import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { apiFetch, resolveApiBase } from '@/shared/api/apiBase';

export type SocialProvider = 'apple' | 'google' | 'line' | 'facebook' | 'email' | 'phone';

export type AuthUser = {
  id: string;
  displayName: string;
  handle?: string;
  provider: SocialProvider;
  status: string;
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
          user = raw ? (JSON.parse(raw) as AuthUser) : null;
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
  const data = json.data as { sessionToken: string; user: AuthUser };
  return { sessionToken: data.sessionToken, user: data.user };
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
  const data = json.data as { sessionToken: string; user: AuthUser };
  return { sessionToken: data.sessionToken, user: data.user };
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
  const data = json.data as { sessionToken: string; user: AuthUser };
  return { sessionToken: data.sessionToken, user: data.user };
}
