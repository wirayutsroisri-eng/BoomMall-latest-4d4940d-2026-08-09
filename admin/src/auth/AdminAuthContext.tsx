import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearApiKey,
  fetchAdminSession,
  getActor,
  getApiKey,
  setActor,
  setApiKey,
  setStoredRole,
  type AdminRole,
  type AdminSession,
} from '../lib/api';
import { ALL_ROLES } from './access';

type AuthState = {
  ready: boolean;
  session: AdminSession | null;
  error: string | null;
  apiKey: string;
  actor: string;
  signedIn: boolean;
  isPlatformAdmin: boolean;
  /** @deprecated use signedIn — kept so existing pages compile */
  isAdmin: boolean;
  login: (apiKey: string, actor?: string) => Promise<boolean>;
  logout: () => void;
  refreshSession: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

function isKnownRole(role: string): role is AdminRole {
  return ALL_ROLES.includes(role as AdminRole);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKeyState] = useState(getApiKey);
  const [actor, setActorState] = useState(getActor);

  const refreshSession = useCallback(async () => {
    const key = getApiKey();
    if (!key) {
      setSession(null);
      setStoredRole(null);
      setError(null);
      return;
    }
    try {
      const res = await fetchAdminSession();
      if (!isKnownRole(res.data.role)) {
        setSession(null);
        setStoredRole(null);
        setError('รหัสนี้ไม่มีสิทธิ์เข้า Admin OS');
        return;
      }
      setSession(res.data);
      setStoredRole(res.data.role);
      setActorState(res.data.actor);
      setActor(res.data.actor);
      setError(null);
    } catch (e) {
      setSession(null);
      setStoredRole(null);
      setError(e instanceof Error ? e.message : 'ยืนยันสิทธิ์ไม่สำเร็จ');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshSession();
      setReady(true);
    })();
  }, [refreshSession]);

  const login = useCallback(async (key: string, nextActor?: string) => {
    setApiKey(key.trim());
    setApiKeyState(key.trim());
    if (nextActor?.trim()) {
      setActor(nextActor.trim());
      setActorState(nextActor.trim());
    }
    try {
      const res = await fetchAdminSession();
      if (!isKnownRole(res.data.role)) {
        clearApiKey();
        setSession(null);
        setError('รหัสนี้ไม่มีสิทธิ์เข้า Admin OS');
        return false;
      }
      setSession(res.data);
      setStoredRole(res.data.role);
      setError(null);
      return true;
    } catch (e) {
      clearApiKey();
      setSession(null);
      setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    clearApiKey();
    setApiKeyState('');
    setSession(null);
    setError(null);
  }, []);

  const signedIn = Boolean(session);
  const isPlatformAdmin = session?.role === 'ADMIN' || session?.role === 'SUPER_ADMIN';

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      error,
      apiKey,
      actor,
      signedIn,
      isPlatformAdmin,
      isAdmin: signedIn,
      login,
      logout,
      refreshSession,
    }),
    [ready, session, error, apiKey, actor, signedIn, isPlatformAdmin, login, logout, refreshSession],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminAuth outside provider');
  return ctx;
}
