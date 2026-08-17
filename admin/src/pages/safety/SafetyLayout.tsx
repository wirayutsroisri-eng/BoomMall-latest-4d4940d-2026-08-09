import { NavLink, Outlet } from 'react-router-dom';
import { HelpPopover } from '../../components/HelpPopover';

const links: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/safety', label: 'ภาพรวม', end: true },
  { to: '/safety/reports', label: 'รายงาน' },
  { to: '/safety/cases', label: 'เคส' },
  { to: '/safety/users', label: 'ผู้ใช้' },
  { to: '/safety/content', label: 'คอนเทนต์' },
  { to: '/safety/automod', label: 'ตรวจอัตโนมัติ' },
  { to: '/safety/algorithm', label: 'อัลกอริทึม' },
  { to: '/safety/policy', label: 'นโยบาย' },
  { to: '/safety/blacklist', label: 'บัญชีดำ' },
  { to: '/safety/appeals', label: 'อุทธรณ์' },
  { to: '/safety/audit', label: 'บันทึกตรวจ' },
  { to: '/safety/chat', label: 'ความปลอดภัยแชต' },
];

export function SafetyLayout() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--accent)]">ความปลอดภัย</p>
        <HelpPopover helpKey="safety" />
      </div>
      <nav className="mb-7 flex flex-wrap gap-1.5 border-b border-[var(--line)] pb-4">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                isActive
                  ? 'bg-[var(--ink)] text-white'
                  : 'bg-white text-[var(--ink-secondary)] ring-1 ring-[var(--line)] hover:text-[var(--ink)]'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
