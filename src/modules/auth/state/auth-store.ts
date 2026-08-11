import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type SocialProvider = 'apple' | 'google' | 'line';

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
  return process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
}

function utf8ToBase64(value: string) {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = unescape(encodeURIComponent(value));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i);
    const b = i + 1 < bytes.length ? bytes.charCodeAt(i + 1) : 0;
    const c = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) : 0;
    const triplet = (a << 16) | (b << 8) | c;
    out += chars[(triplet >> 18) & 63];
    out += chars[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[triplet & 63] : '=';
  }
  return out;
}

export async function exchangeSocialLogin(input: {
  provider: SocialProvider;
  providerUserId: string;
  displayName: string;
  handle?: string;
  identityToken?: string;
}): Promise<{ sessionToken: string; user: AuthUser }> {
  const base = getApiBase();
  if (!base) {
    // Offline / no API — local session still enforces login gate for UGC
    const user: AuthUser = {
      id: `${input.provider}_${input.providerUserId}`.slice(0, 64),
      displayName: input.displayName,
      handle: input.handle,
      provider: input.provider,
      status: 'active',
    };
    return {
      sessionToken: `local.${utf8ToBase64(user.id)}`,
      user,
    };
  }

  const res = await fetch(`${base}/api/v1/moderation/auth/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json?.error?.message ?? `Login failed (${res.status})`);
  }
  return {
    sessionToken: json.data.sessionToken as string,
    user: json.data.user as AuthUser,
  };
}
