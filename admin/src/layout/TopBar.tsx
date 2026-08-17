import { useAdminAuth } from '../auth/AdminAuthContext';
import { IconMenu } from '../components/icons';
import { GlobalSearch } from '../components/GlobalSearch';
import { NotificationCenter } from '../components/NotificationCenter';
import { useShell } from './ShellContext';

export function TopBar() {
  const { session, logout } = useAdminAuth();
  const { collapsed, toggleCollapsed } = useShell();

  return (
    <header className="admin-topbar no-print">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="btn-ghost"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <div className="hidden min-w-0 sm:block">
          <p className="font-display text-[15px] font-extrabold tracking-tight text-[var(--ink)]">
            BoomMall Admin OS
          </p>
          <p className="text-[11px] font-semibold text-[var(--ink-tertiary)]">
            เปิดมาแล้วรู้ว่าวันนี้ต้องจัดการอะไร
          </p>
        </div>
      </div>

      <GlobalSearch />

      <div className="flex items-center gap-2">
        <NotificationCenter />
        <div className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-extrabold text-[var(--accent-strong)]">
            {(session?.actor ?? 'A').slice(0, 1).toUpperCase()}
          </span>
          <div className="pr-1">
            <p className="text-xs font-bold leading-tight">{session?.actor ?? 'Admin'}</p>
            <p className="text-[10px] font-semibold text-[var(--ink-tertiary)]">
              {session?.deskLabel ?? session?.role ?? 'ADMIN'}
            </p>
          </div>
        </div>
        <button type="button" className="btn-secondary !py-1.5 !text-xs" onClick={logout}>
          ออกจากระบบ
        </button>
      </div>
    </header>
  );
}
