import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type ShellCtx = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggleCollapsed: () => void;
};

const Ctx = createContext<ShellCtx | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const value = useMemo(
    () => ({
      collapsed,
      setCollapsed,
      toggleCollapsed: () => setCollapsed((c) => !c),
    }),
    [collapsed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShell() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShell must be used within ShellProvider');
  return ctx;
}
