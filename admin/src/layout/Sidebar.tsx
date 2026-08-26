import { NavLink, useLocation } from 'react-router-dom';
import {
  IconAds,
  IconAi,
  IconAnalytics,
  IconContent,
  IconDashboard,
  IconFeed,
  IconSafety,
  IconSellers,
  IconSettings,
  IconUsers,
  IconChat,
} from '../components/icons';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useShell } from './ShellContext';
import type { AdminNavKey } from '../lib/api';

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  nav: AdminNavKey;
};

type NavGroupDef = { title: string; items: NavItem[] };

const GROUPS: NavGroupDef[] = [
  {
    title: 'ภาพรวม',
    items: [
      { to: '/', label: 'ภาพรวม', icon: IconDashboard, end: true, nav: 'dashboard' },
      { to: '/alerts', label: 'การแจ้งเตือน', icon: IconDashboard, nav: 'dashboard' },
      { to: '/safety/cases', label: 'ศูนย์จัดการเคส', icon: IconSafety, nav: 'safety' },
    ],
  },
  {
    title: 'ชุมชน',
    items: [
      { to: '/users', label: 'ผู้ใช้', icon: IconUsers, nav: 'users' },
      { to: '/content', label: 'โพสต์ / คอนเทนต์', icon: IconContent, nav: 'content' },
      { to: '/feed', label: 'Feed', icon: IconFeed, nav: 'feed' },
      { to: '/board', label: 'Board', icon: IconContent, nav: 'content' },
      { to: '/safety/chat/reports', label: 'Chat Safety', icon: IconChat, nav: 'safety' },
    ],
  },
  {
    title: 'การซื้อขาย',
    items: [
      { to: '/sellers', label: 'ร้านค้า', icon: IconSellers, nav: 'sellers' },
      { to: '/sellers?view=products', label: 'สินค้า', icon: IconSellers, nav: 'sellers' },
      { to: '/orders', label: 'คำสั่งซื้อ', icon: IconAnalytics, nav: 'finance' },
      { to: '/sellers?view=warehouse', label: 'Shared Warehouse', icon: IconSellers, nav: 'sellers' },
      { to: '/orders?view=disputes', label: 'ข้อพิพาท / คืนเงิน', icon: IconSafety, nav: 'finance' },
    ],
  },
  {
    title: 'การเงิน',
    items: [
      { to: '/finance', label: 'ภาพรวมการเงิน', icon: IconAnalytics, nav: 'finance' },
      { to: '/finance?focus=gp', label: 'GP / Fees', icon: IconAnalytics, nav: 'finance' },
      { to: '/finance?focus=balance', label: 'Seller Balance', icon: IconAnalytics, nav: 'finance' },
      { to: '/finance?focus=escrow', label: 'Escrow', icon: IconAnalytics, nav: 'finance' },
      { to: '/finance?focus=payout', label: 'Payout', icon: IconAnalytics, nav: 'finance' },
      { to: '/finance?focus=refund', label: 'Refund', icon: IconAnalytics, nav: 'finance' },
      { to: '/finance?focus=recon', label: 'Reconciliation', icon: IconAnalytics, nav: 'finance' },
    ],
  },
  {
    title: 'โฆษณา',
    items: [
      { to: '/ads', label: 'Campaign', icon: IconAds, nav: 'ads' },
      { to: '/ads?tab=promotions', label: 'Feed Ads', icon: IconAds, nav: 'ads' },
      { to: '/ads?tab=billing', label: 'Banner', icon: IconAds, nav: 'ads' },
      { to: '/promotions', label: 'Promotion', icon: IconAds, nav: 'ads' },
      { to: '/analytics', label: 'Analytics', icon: IconAnalytics, nav: 'analytics' },
    ],
  },
  {
    title: 'ความปลอดภัย',
    items: [
      { to: '/safety/reports', label: 'Reports', icon: IconSafety, nav: 'safety' },
      { to: '/safety', label: 'Fraud Detection', icon: IconSafety, end: true, nav: 'safety' },
      { to: '/safety/content', label: 'Moderation', icon: IconSafety, nav: 'safety' },
      { to: '/safety/users', label: 'Account Risk', icon: IconSafety, nav: 'safety' },
      { to: '/safety/algorithm', label: 'Security', icon: IconSafety, nav: 'safety' },
    ],
  },
  {
    title: 'ระบบ',
    items: [
      { to: '/ai', label: 'AI Control', icon: IconAi, nav: 'ai' },
      { to: '/safety/audit', label: 'Audit Log', icon: IconSafety, nav: 'safety' },
      { to: '/settings', label: 'Admin / Roles', icon: IconSettings, nav: 'settings' },
      { to: '/health', label: 'System Health', icon: IconSettings, nav: 'dashboard' },
      { to: '/domains', label: 'โดเมนระบบ', icon: IconSettings, nav: 'domains' },
    ],
  },
];

function itemIsActive(to: string, loc: { pathname: string; search: string }, end?: boolean) {
  const target = new URL(to, 'https://admin.local');
  const path = loc.pathname.replace(/\/$/, '') || '/';
  const want = target.pathname.replace(/\/$/, '') || '/';
  const pathOk = end ? path === want : path === want || path.startsWith(`${want}/`);
  if (!pathOk) return false;
  const keys = [...target.searchParams.keys()];
  if (keys.length === 0) {
    return !loc.search || loc.search === '?';
  }
  const current = new URLSearchParams(loc.search);
  return keys.every((k) => current.get(k) === target.searchParams.get(k));
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  const loc = useLocation();
  if (items.length === 0) return null;
  return (
    <div>
      <p className="nav-section-label">{title}</p>
      {items.map((item) => (
        <NavLink
          key={`${item.to}-${item.label}`}
          to={item.to}
          end={item.end}
          title={item.label}
          className={() => `nav-link${itemIsActive(item.to, loc, item.end) ? ' is-active' : ''}`}
        >
          <item.icon className="nav-icon" />
          <span className="nav-label">{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

export function Sidebar() {
  const { collapsed } = useShell();
  const { session } = useAdminAuth();
  const allowed = (nav: AdminNavKey) => session?.nav?.[nav] !== false;

  return (
    <aside className="admin-sidebar no-print" aria-label="Admin navigation">
      {GROUPS.map((g) => (
        <NavGroup
          key={g.title}
          title={collapsed ? '' : g.title}
          items={g.items.filter((i) => allowed(i.nav))}
        />
      ))}
    </aside>
  );
}
