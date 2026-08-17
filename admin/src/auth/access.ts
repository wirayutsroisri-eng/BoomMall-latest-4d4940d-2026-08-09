import type { AdminNavKey, AdminRole, AdminSession } from '../lib/api';

export const PATH_NAV: Array<{ prefix: string; nav: AdminNavKey }> = [
  { prefix: '/alerts', nav: 'dashboard' },
  { prefix: '/health', nav: 'dashboard' },
  { prefix: '/cases', nav: 'safety' },
  { prefix: '/orders', nav: 'finance' },
  { prefix: '/coins', nav: 'finance' },
  { prefix: '/handbook', nav: 'handbook' },
  { prefix: '/promotions', nav: 'ads' },
  { prefix: '/ads', nav: 'ads' },
  { prefix: '/safety', nav: 'safety' },
  { prefix: '/feed', nav: 'feed' },
  { prefix: '/sellers', nav: 'sellers' },
  { prefix: '/finance', nav: 'finance' },
  { prefix: '/shop-chat', nav: 'shopChat' },
  { prefix: '/users', nav: 'users' },
  { prefix: '/content', nav: 'content' },
  { prefix: '/analytics', nav: 'analytics' },
  { prefix: '/ai', nav: 'ai' },
  { prefix: '/domains', nav: 'domains' },
  { prefix: '/settings', nav: 'settings' },
];

export const ALL_ROLES: AdminRole[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'SAFETY',
  'ADS',
  'FEED',
  'MARKETPLACE',
  'FINANCE',
];

export function canAccessPath(session: AdminSession | null, pathname: string) {
  if (!session) return false;
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/' || path === '') return Boolean(session.nav?.dashboard ?? true);
  const hit = PATH_NAV.find((row) => path === row.prefix || path.startsWith(`${row.prefix}/`));
  if (!hit) return true;
  return session.nav?.[hit.nav] !== false;
}

export function homeForSession(session: AdminSession | null) {
  return session?.home || '/';
}
