import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/safety/chat', end: true, label: 'แดชบอร์ด' },
  { to: '/safety/chat/reports', label: 'ข้อความถูกรายงาน' },
  { to: '/safety/chat/policy', label: 'นโยบาย' },
  { to: '/safety/chat/delivery', label: 'การส่งข้อความ' },
  { to: '/safety/chat/realtime', label: 'เรียลไทม์' },
  { to: '/safety/chat/notifications', label: 'การแจ้งเตือน' },
  { to: '/safety/chat/antispam', label: 'กันสแปม' },
  { to: '/safety/chat/blocks', label: 'การบล็อก' },
  { to: '/safety/chat/restrictions', label: 'จำกัดสิทธิ์' },
  { to: '/safety/chat/analytics', label: 'วิเคราะห์' },
  { to: '/safety/chat/emergency', label: 'ฉุกเฉิน' },
];

export function ChatLayout() {
  return (
    <div>
      <p className="mb-3 text-sm text-[var(--ink-secondary)]">
        ความปลอดภัยแชต · เปิดอ่านข้อความเฉพาะเมื่อมีรายงาน ธงความเสี่ยง หรือข้อพิพาท — ไม่เปิดแชตทั้งสนทนาโดยอัตโนมัติ
      </p>
      <div className="mb-6 flex flex-wrap gap-1.5">
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
      </div>
      <Outlet />
    </div>
  );
}
