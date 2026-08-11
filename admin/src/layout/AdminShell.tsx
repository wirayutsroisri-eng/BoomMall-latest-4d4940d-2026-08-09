import { NavLink, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
    isActive
      ? 'bg-[#122820] text-white'
      : 'text-[#122820]/75 hover:bg-[#122820]/8'
  }`;

export function AdminShell() {
  const { session, logout } = useAdminAuth();

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="no-print mb-8 border-b border-[#122820]/10 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#00a86b]">
              BoomMall Internal · ADMIN
            </p>
            <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight text-[#0b1f17] sm:text-4xl">
              Boom Coin Admin
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[#122820]/70">
              สวัสดี {session?.actor} · สิทธิ์ {session?.role}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-[#122820]/15 bg-white/80 px-3 py-2 text-sm font-semibold text-[#122820]"
          >
            ออกจากระบบ
          </button>
        </div>
        <nav className="mt-5 flex flex-wrap gap-2">
          <NavLink to="/" end className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/moderation" className={linkClass}>
            Moderation
          </NavLink>
          <NavLink to="/handbook" className={linkClass}>
            คู่มือระบบ (Handbook)
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
