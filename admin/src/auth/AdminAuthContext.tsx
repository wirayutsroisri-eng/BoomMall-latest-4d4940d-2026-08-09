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

type AuthState = {
  ready: boolean;
  session: AdminSession | null;
  error: string | null;
  apiKey: string;
  actor: string;
  isAdmin: boolean;
  login: (apiKey: string, actor?: string) => Promise<boolean>;
  logout: () => void;
  refreshSession: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

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
      if (res.data.role !== 'ADMIN') {
        setSession(null);
        setStoredRole(null);
        setError('บัญชีนี้ไม่มีสิทธิ์ ADMIN');
        return;
      }
      setSession(res.data);
      setStoredRole(res.data.role as AdminRole);
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

  const login = useCallback(
    async (key: string, nextActor?: string) => {
      setApiKey(key.trim());
      setApiKeyState(key.trim());
      if (nextActor?.trim()) {
        setActor(nextActor.trim());
        setActorState(nextActor.trim());
      }
      try {
        const res = await fetchAdminSession();
        if (res.data.role !== 'ADMIN') {
          clearApiKey();
          setSession(null);
          setError('เข้าถึงได้เฉพาะบัญชี ADMIN');
          return false;
        }
        setSession(res.data);
        setStoredRole('ADMIN');
        setError(null);
        return true;
      } catch (e) {
        clearApiKey();
        setSession(null);
        setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ');
        return false;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    clearApiKey();
    setApiKeyState('');
    setSession(null);
    setError(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      ready,
      session,
      error,
      apiKey,
      actor,
      isAdmin: session?.role === 'ADMIN',
      login,
      logout,
      refreshSession,
    }),
    [ready, session, error, apiKey, actor, login, logout, refreshSession],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAdminAuth outside provider');
  return ctx;
}
