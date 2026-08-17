import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAdminUsers, fetchCommerceOrders, type AdminUserRow, type CommerceOrderRow } from '../lib/api';
import { fetchSafetyCases, type SafetyCase } from '../lib/safetyApi';

const JUMPS: Array<{ q: string[]; label: string; to: string; hint: string }> = [
  { q: ['ภาพรวม', 'dashboard', 'วันนี้'], label: 'ภาพรวม', to: '/', hint: 'งานวันนี้' },
  { q: ['แจ้งเตือน', 'alert', 'กระดิ่ง'], label: 'การแจ้งเตือน', to: '/alerts', hint: 'คิวที่ต้องจัดการ' },
  { q: ['สุขภาพ', 'health'], label: 'สุขภาพระบบ', to: '/health', hint: 'บัญชีตรงกันหรือไม่' },
  { q: ['เคส', 'case', 'scam'], label: 'ศูนย์จัดการเคส', to: '/safety/cases', hint: 'รวมปัญหาทั้งระบบ' },
  { q: ['รายงาน', 'report'], label: 'รายงาน', to: '/safety/reports', hint: 'รายงานจากผู้ใช้' },
  { q: ['ผู้ใช้', 'user'], label: 'ผู้ใช้', to: '/users', hint: 'บัญชี' },
  { q: ['ร้าน', 'seller', 'shop'], label: 'ร้านค้า', to: '/sellers', hint: 'ร้านค้า' },
  { q: ['ออเดอร์', 'order', 'คำสั่งซื้อ'], label: 'คำสั่งซื้อ', to: '/orders', hint: 'ออเดอร์และการเงิน' },
  { q: ['การเงิน', 'finance', 'gp', 'escrow'], label: 'การเงิน', to: '/finance', hint: 'GP Escrow Payout' },
  { q: ['แชต', 'chat', 'scam'], label: 'Chat Safety', to: '/safety/chat/reports', hint: 'ข้อความถูกรายงาน' },
  { q: ['คอนเทนต์', 'โพสต์', 'content'], label: 'คอนเทนต์', to: '/content', hint: 'โพสต์' },
  { q: ['ฟีด', 'feed'], label: 'Feed', to: '/feed', hint: 'อัลกอริทึม' },
  { q: ['หางาน', 'บอร์ด', 'board'], label: 'Board', to: '/board', hint: 'หางาน' },
  { q: ['โฆษณา', 'ads'], label: 'โฆษณา', to: '/ads', hint: 'แคมเปญ' },
  { q: ['audit', 'บันทึก'], label: 'Audit Log', to: '/safety/audit', hint: 'ย้อนหลัง' },
  { q: ['เหรียญ', 'coin'], label: 'Boom Coin', to: '/coins', hint: 'ยอดเหรียญระบบ' },
];

export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [orders, setOrders] = useState<CommerceOrderRow[]>([]);
  const [cases, setCases] = useState<SafetyCase[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const needle = q.trim();
      if (needle.length < 2) {
        setUsers([]);
        setOrders([]);
        setCases([]);
        return;
      }
      void Promise.all([
        fetchAdminUsers().catch(() => ({ data: [] as AdminUserRow[] })),
        fetchCommerceOrders().catch(() => ({ data: [] as CommerceOrderRow[] })),
        fetchSafetyCases().catch(() => ({ data: [] as SafetyCase[] })),
      ]).then(([u, o, c]) => {
        const n = needle.toLowerCase();
        setUsers(
          u.data
            .filter(
              (row) =>
                row.userId.toLowerCase().includes(n) ||
                (row.handle ?? '').toLowerCase().includes(n) ||
                (row.displayName ?? '').toLowerCase().includes(n),
            )
            .slice(0, 5),
        );
        setOrders(
          o.data.filter((row) => row.id.toLowerCase().includes(n)).slice(0, 5),
        );
        setCases(
          c.data
            .filter(
              (row) =>
                row.id.toLowerCase().includes(n) ||
                (row.userId ?? '').toLowerCase().includes(n),
            )
            .slice(0, 5),
        );
      });
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  const jumps = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return JUMPS.slice(0, 6);
    return JUMPS.filter((j) => j.q.some((k) => k.includes(n) || n.includes(k)) || j.label.toLowerCase().includes(n)).slice(
      0,
      8,
    );
  }, [q]);

  const go = (to: string) => {
    setOpen(false);
    setQ('');
    navigate(to);
  };

  return (
    <div className="global-search">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 180)}
        placeholder="ค้นหาผู้ใช้ ร้าน ออเดอร์ เคส…"
        aria-label="ค้นหาทั้งระบบ"
        className="global-search-input"
      />
      {open ? (
        <div className="global-search-menu">
          {jumps.map((j) => (
            <button key={j.to} type="button" className="global-search-item" onMouseDown={() => go(j.to)}>
              <span>{j.label}</span>
              <span className="text-[11px] text-[var(--ink-tertiary)]">{j.hint}</span>
            </button>
          ))}
          {users.map((u) => (
            <button
              key={u.userId}
              type="button"
              className="global-search-item"
              onMouseDown={() => go(`/safety/users/${encodeURIComponent(u.userId)}`)}
            >
              <span>{u.displayName || u.handle || u.userId}</span>
              <span className="text-[11px] text-[var(--ink-tertiary)]">ผู้ใช้</span>
            </button>
          ))}
          {orders.map((o) => (
            <button
              key={o.id}
              type="button"
              className="global-search-item"
              onMouseDown={() => go(`/orders?focus=${encodeURIComponent(o.id)}`)}
            >
              <span>{o.id}</span>
              <span className="text-[11px] text-[var(--ink-tertiary)]">คำสั่งซื้อ · {o.status}</span>
            </button>
          ))}
          {cases.map((c) => (
            <button
              key={c.id}
              type="button"
              className="global-search-item"
              onMouseDown={() => go('/safety/cases')}
            >
              <span>CASE #{c.id}</span>
              <span className="text-[11px] text-[var(--ink-tertiary)]">เคส · {c.status}</span>
            </button>
          ))}
          {jumps.length === 0 && users.length === 0 && orders.length === 0 && cases.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[var(--ink-tertiary)]">ไม่พบรายการที่ตรงกัน</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
