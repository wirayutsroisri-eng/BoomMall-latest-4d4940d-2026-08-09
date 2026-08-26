import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { apiFetch, resolveApiBase } from '@/shared/api/apiBase';

export type SocialProvider = 'apple' | 'google' | 'line' | 'facebook' | 'email' | 'phone';

export type AuthUser = {
  id: string;
  /** Stable shop UUID created and owned by the backend. */
  shopId: string;
  displayName: string;
  handle?: string;
  provider: SocialProvider;
  status: string;
  role?: string;
};

type AuthState = {
  hydrated: boolean;
  sessionToken: string | null;
  user: AuthUser | null;
  setSession: (input: { sessionToken: string; user: AuthUser }) => Promise<void>;
  clearSession: () => Promise<void>;
  hydrate: () => Promise<void>;
  isAuthenticated: () => boolean;
};

const TOKEN_KEY = 'boommall-auth-session';
const USER_KEY = 'boommall-auth-user';

function validAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const user = value as Partial<AuthUser>;
  return Boolean(
    user.id?.trim() &&
      user.shopId?.trim() &&
      user.displayName?.trim() &&
      user.provider &&
      user.status,
  );
}

function parseSessionData(json: Record<string, unknown>) {
  const data = json.data as { sessionToken?: unknown; user?: unknown; shopId?: unknown } | undefined;
  const sessionToken = typeof data?.sessionToken === 'string' ? data.sessionToken : '';
  const rawUser = data?.user && typeof data.user === 'object'
    ? (data.user as Record<string, unknown>)
    : null;
  const shopId = typeof rawUser?.shopId === 'string'
    ? rawUser.shopId
    : typeof data?.shopId === 'string'
      ? data.shopId
      : '';
  const user = rawUser ? ({ ...rawUser, shopId } as unknown) : null;
  if (!sessionToken || !validAuthUser(user)) {
    throw new Error('เซิร์ฟเวอร์ไม่ได้ส่งรหัสร้านค้าจริงกลับมา กรุณาอัปเดตเซิร์ฟเวอร์');
  }
  return { sessionToken, user };
}

async function saveSecure(token: string | null) {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
    else await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

async function readSecure() {
  try {
    return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? (await AsyncStorage.getItem(TOKEN_KEY));
  } catch {
    return AsyncStorage.getItem(TOKEN_KEY);
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      sessionToken: null,
      user: null,
      setSession: async ({ sessionToken, user }) => {
        if (!sessionToken.trim() || !validAuthUser(user)) {
          throw new Error('ไม่สามารถบันทึก session ที่ไม่มีรหัสร้านค้าจริง');
        }
        await saveSecure(sessionToken);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
        set({ sessionToken, user, hydrated: true });
      },
      clearSession: async () => {
        await saveSecure(null);
        await AsyncStorage.removeItem(USER_KEY);
        set({ sessionToken: null, user: null, hydrated: true });
      },
      hydrate: async () => {
        const token = await readSecure();
        const raw = await AsyncStorage.getItem(USER_KEY);
        let user: AuthUser | null = null;
        try {
          const parsed = raw ? JSON.parse(raw) : null;
          user = validAuthUser(parsed) ? parsed : null;
        } catch {
          user = null;
        }
        const isLocal = Boolean(token?.startsWith('local.'));
        if (isLocal) {
          await saveSecure(null);
          await AsyncStorage.removeItem(USER_KEY);
          set({ sessionToken: null, user: null, hydrated: true });
          return;
        }
        if (token && !user) {
          // Upgrade sessions persisted before shopId became mandatory. Keeping
          // the token with a null user breaks profile ownership and warehouse filters.
          try {
            const base = getApiBase();
            const response = await apiFetch(`${base}/api/v1/auth/me`, {
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            const json = await readApiJson(response);
            if (!response.ok || json.ok === false) throw apiError(json, response.status);
            const data = json.data as Record<string, unknown> | undefined;
            const profile = data?.profile && typeof data.profile === 'object'
              ? data.profile as Record<string, unknown>
              : {};
            const repaired: AuthUser = {
              id: String(data?.userId ?? profile.userId ?? ''),
              shopId: String(data?.shopId ?? profile.shopId ?? ''),
              displayName: String(profile.displayName ?? 'ผู้ใช้ BoomMall'),
              handle: typeof profile.handle === 'string' ? profile.handle : undefined,
              provider: String(data?.provider ?? 'email') as SocialProvider,
              status: 'ACTIVE',
              role: typeof data?.role === 'string' ? data.role : undefined,
            };
            if (!validAuthUser(repaired)) throw new Error('SESSION_PROFILE_INVALID');
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(repaired));
            set({ sessionToken: token, user: repaired, hydrated: true });
            return;
          } catch {
            // A transient network failure must not destroy the secure session.
            set({ sessionToken: token, user: null, hydrated: true });
            return;
          }
        }
        set({ sessionToken: token, user: token && user ? user : null, hydrated: true });
      },
      isAuthenticated: () => Boolean(get().sessionToken && get().user),
    }),
    {
      name: 'boommall-auth-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ user: s.user }),
    },
  ),
);

export function getApiBase() {
  return resolveApiBase();
}

async function readApiJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function apiError(json: Record<string, unknown>, status: number) {
  const err = json.error as { message?: string } | undefined;
  return new Error(err?.message ?? `ไม่สำเร็จ (${status})`);
}

/** Authentication is exclusively the backend-issued Bearer JWT. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = useAuthStore.getState().sessionToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function exchangeSocialLogin(input: {
  provider: SocialProvider;
  providerUserId: string;
  displayName: string;
  handle?: string;
  identityToken?: string;
  mode: 'login' | 'register';
}): Promise<{ sessionToken: string; user: AuthUser }> {
  const base = getApiBase();
  if (!base) {
    throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ไม่สามารถสมัครหรือเข้าสู่ระบบได้');
  }

  const res = await apiFetch(`${base}/api/v1/auth/login/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await readApiJson(res);
  if (!res.ok || json.ok === false) throw apiError(json, res.status);
  return parseSessionData(json);
}

export async function exchangeEmailLogin(input: {
  email: string;
  password: string;
  displayName?: string;
  mode: 'login' | 'register';
}): Promise<{ sessionToken: string; user: AuthUser }> {
  const base = getApiBase();
  if (!base) {
    throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ไม่สามารถสมัครหรือเข้าสู่ระบบได้');
  }
  const path = input.mode === 'register' ? '/api/v1/auth/register' : '/api/v1/auth/login';
  const res = await apiFetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    }),
  });
  const json = await readApiJson(res);
  if (!res.ok || json.ok === false) throw apiError(json, res.status);
  return parseSessionData(json);
}

export type PhoneOtpRequestResult = {
  sent: boolean;
  phoneMasked: string;
  expiresInSec: number;
  resendInSec: number;
  channel: 'twilio' | 'http' | 'dev';
  debugCode?: string;
};

function requireApiBase() {
  const base = getApiBase();
  if (!base) {
    throw new Error(
      'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ใส่ EXPO_PUBLIC_API_URL เป็น IP ของคอมพิวเตอร์ เช่น http://192.168.1.10:4000 (เครื่องจริงห้ามใช้ localhost)',
    );
  }
  return base;
}

export async function requestPhoneOtp(phone: string): Promise<PhoneOtpRequestResult> {
  const base = requireApiBase();
  const res = await apiFetch(`${base}/api/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  const json = await readApiJson(res);
  if (!res.ok || json.ok === false) throw apiError(json, res.status);
  return json.data as PhoneOtpRequestResult;
}

export async function verifyPhoneOtp(input: {
  phone: string;
  code: string;
  mode: 'login' | 'register';
  displayName?: string;
}): Promise<{ sessionToken: string; user: AuthUser }> {
  const base = requireApiBase();
  const res = await apiFetch(`${base}/api/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: input.phone,
      code: input.code,
      mode: input.mode,
      displayName: input.displayName,
    }),
  });
  const json = await readApiJson(res);
  if (!res.ok || json.ok === false) throw apiError(json, res.status);
  return parseSessionData(json);
}

export function currentShopId(): string {
  const shopId = useAuthStore.getState().user?.shopId?.trim();
  if (!shopId) throw new Error('ไม่พบรหัสร้านค้าใน session กรุณาเข้าสู่ระบบใหม่');
  return shopId;
}
