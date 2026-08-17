import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { useAdminAuth } from '../auth/AdminAuthContext';

const DESKS = [
  { role: 'SUPER_ADMIN', env: 'SUPER_ADMIN_API_KEY', scope: 'ทั้งระบบ + emergency chat' },
  { role: 'ADMIN', env: 'ADMIN_API_KEY', scope: 'ทุกแผนก ยกเว้น emergency' },
  { role: 'SAFETY', env: 'ADMIN_KEY_SAFETY', scope: 'Safety / Users / Chat' },
  { role: 'ADS', env: 'ADMIN_KEY_ADS', scope: 'Ads + ดันฟีดสินค้า' },
  { role: 'FEED', env: 'ADMIN_KEY_FEED', scope: 'อัลกอริทึมฟีด' },
  { role: 'MARKETPLACE', env: 'ADMIN_KEY_MARKETPLACE', scope: 'ร้านค้า / แคตตาล็อก' },
  { role: 'FINANCE', env: 'ADMIN_KEY_FINANCE', scope: 'GP / ออเดอร์ร้าน' },
];

export function SettingsPage() {
  const { session } = useAdminAuth();

  return (
    <div>
      <PageHeader
        eyebrow="ระบบ"
        title="ตั้งค่า / Roles"
        description="แต่ละแผนกเข้าด้วยรหัสของตัวเอง — จำกัดให้เห็นเฉพาะงานที่เกี่ยวข้อง"
        helpKey="settings"
      />

      <div className="grid max-w-3xl gap-4">
        <div className="surface-panel p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
            เซสชันนี้
          </p>
          <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight">
            {session?.deskLabel ?? session?.role}
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">
            ผู้ใช้ {session?.actor} · role {session?.role}
          </p>
        </div>

        <div className="surface-panel p-6">
          <h2 className="font-display text-xl font-extrabold tracking-tight">รหัสตามแผนก</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
            ตั้งค่าใน <code>backend/.env</code> — ไม่ใส่รหัสแผนกไหน แผนกนั้นจะล็อกอินไม่ได้
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {DESKS.map((d) => (
              <li key={d.role} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-2 last:border-0">
                <span className="font-semibold">{d.role}</span>
                <span className="text-[var(--ink-secondary)]">{d.scope}</span>
                <code className="w-full text-xs text-[var(--ink-tertiary)]">{d.env}</code>
              </li>
            ))}
          </ul>
        </div>

        <Link
            to="/finance"
            className="surface-panel block p-6 transition hover:border-[var(--line-strong)] hover:shadow-[var(--shadow-md)]"
          >
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--accent)]">
              การเงิน
            </p>
            <h2 className="font-display mt-1 text-xl font-extrabold tracking-tight">
              GP และออเดอร์ร้าน
            </h2>
            <p className="mt-2 text-sm text-[var(--ink-secondary)]">
              ไม่มีเหรียญในระบบ — ลูกค้าจ่ายเงินบาท แพลตฟอร์มหัก GP
            </p>
          </Link>
      </div>
    </div>
  );
}
