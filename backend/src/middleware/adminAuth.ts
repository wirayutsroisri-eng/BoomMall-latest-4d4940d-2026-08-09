/**
 * Shared-secret Admin OS auth — one portal, desk-specific access codes.
 * Header: Authorization: Bearer <desk key>
 * Optional: X-Admin-Actor for audit trail
 */

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'SAFETY'
  | 'ADS'
  | 'FEED'
  | 'MARKETPLACE'
  | 'FINANCE';

export type AdminPermission =
  | 'ads:read'
  | 'ads:write'
  | 'ads:billing'
  | 'marketplace:read'
  | 'marketplace:write'
  | 'chat:read'
  | 'chat:write'
  | 'feed:write'
  | 'users:moderate'
  | 'finance:read'
  | 'finance:write'
  | 'handbook:read'
  | 'dashboard:read'
  | 'platform:read'
  | '*';

export type AdminNavKey =
  | 'dashboard'
  | 'users'
  | 'content'
  | 'feed'
  | 'ads'
  | 'safety'
  | 'sellers'
  | 'finance'
  | 'shopChat'
  | 'analytics'
  | 'ai'
  | 'domains'
  | 'settings'
  | 'handbook';

export type AdminDesk = {
  role: AdminRole;
  label: string;
  defaultActor: string;
  home: string;
  permissions: AdminPermission[];
};

export type AuthedRequest = Request & {
  adminActor?: string;
  adminRole?: AdminRole;
  adminDesk?: AdminDesk;
};

const ALL_DESK_PERMS: AdminPermission[] = [
  'ads:read',
  'ads:write',
  'ads:billing',
  'marketplace:read',
  'marketplace:write',
  'chat:read',
  'chat:write',
  'feed:write',
  'users:moderate',
  'finance:read',
  'finance:write',
  'handbook:read',
  'dashboard:read',
  'platform:read',
];

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ALL_DESK_PERMS,
  SAFETY: ['dashboard:read', 'users:moderate', 'chat:read', 'chat:write'],
  ADS: ['dashboard:read', 'ads:read', 'ads:write', 'ads:billing'],
  FEED: ['dashboard:read', 'feed:write'],
  MARKETPLACE: ['dashboard:read', 'marketplace:read', 'marketplace:write'],
  FINANCE: ['dashboard:read', 'finance:read', 'finance:write', 'handbook:read', 'marketplace:read'],
};

const DESK_META: Record<AdminRole, Omit<AdminDesk, 'permissions'>> = {
  SUPER_ADMIN: { role: 'SUPER_ADMIN', label: 'Super Admin', defaultActor: 'super-admin', home: '/' },
  ADMIN: { role: 'ADMIN', label: 'แพลตฟอร์ม', defaultActor: 'admin', home: '/' },
  SAFETY: { role: 'SAFETY', label: 'Safety', defaultActor: 'safety', home: '/safety' },
  ADS: { role: 'ADS', label: 'Ads / ดันฟีด', defaultActor: 'ads', home: '/ads' },
  FEED: { role: 'FEED', label: 'Feed', defaultActor: 'feed', home: '/feed' },
  MARKETPLACE: { role: 'MARKETPLACE', label: 'ร้านค้า', defaultActor: 'marketplace', home: '/sellers' },
  FINANCE: { role: 'FINANCE', label: 'การเงินแพลตฟอร์ม', defaultActor: 'finance', home: '/finance' },
};

const ENV_FOR_ROLE: Record<AdminRole, string> = {
  SUPER_ADMIN: 'SUPER_ADMIN_API_KEY',
  ADMIN: 'ADMIN_API_KEY',
  SAFETY: 'ADMIN_KEY_SAFETY',
  ADS: 'ADMIN_KEY_ADS',
  FEED: 'ADMIN_KEY_FEED',
  MARKETPLACE: 'ADMIN_KEY_MARKETPLACE',
  FINANCE: 'ADMIN_KEY_FINANCE',
};

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

function deskFor(role: AdminRole): AdminDesk {
  return { ...DESK_META[role], permissions: ROLE_PERMISSIONS[role] };
}

export function deskForRole(role: AdminRole): AdminDesk {
  return deskFor(role);
}

type ExtraCode = { key: string; role: AdminRole; label?: string };

function extraCodes(): ExtraCode[] {
  const raw = process.env.ADMIN_ACCESS_CODES?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const rec = row as { key?: unknown; role?: unknown; label?: unknown };
      const key = typeof rec.key === 'string' ? rec.key.trim() : '';
      const role = typeof rec.role === 'string' ? (rec.role.toUpperCase() as AdminRole) : null;
      if (!key || !role || !(role in DESK_META)) return [];
      return [{ key, role, label: typeof rec.label === 'string' ? rec.label : undefined }];
    });
  } catch {
    return [];
  }
}

export function resolveAdminAccess(presented: string): AdminDesk | null {
  const token = presented.trim();
  if (!token) return null;

  const master = process.env.MASTER_KEY?.trim() ?? '';
  if (master && safeEqual(token, master)) {
    return deskFor('SUPER_ADMIN');
  }

  const order: AdminRole[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'SAFETY',
    'ADS',
    'FEED',
    'MARKETPLACE',
    'FINANCE',
  ];
  for (const role of order) {
    const envName = ENV_FOR_ROLE[role];
    const configured = process.env[envName]?.trim() ?? '';
    if (configured && safeEqual(token, configured)) {
      return deskFor(role);
    }
  }

  for (const extra of extraCodes()) {
    if (safeEqual(token, extra.key)) {
      const desk = deskFor(extra.role);
      return extra.label ? { ...desk, label: extra.label } : desk;
    }
  }
  return null;
}

export function listConfiguredDesks() {
  return (Object.keys(DESK_META) as AdminRole[]).map((role) => ({
    role,
    label: DESK_META[role].label,
    home: DESK_META[role].home,
    configured: Boolean(process.env[ENV_FOR_ROLE[role]]?.trim()),
    env: ENV_FOR_ROLE[role],
  }));
}

export function adminHasPermission(
  role: AdminRole | undefined,
  permission: AdminPermission,
  desk?: AdminDesk,
) {
  const perms = desk?.permissions ?? (role ? ROLE_PERMISSIONS[role] : []);
  return perms.includes('*') || perms.includes(permission);
}

export function navForDesk(desk: AdminDesk): Record<AdminNavKey, boolean> {
  const has = (p: AdminPermission) => adminHasPermission(desk.role, p, desk);
  const platform = has('*') || has('platform:read');
  return {
    dashboard: has('dashboard:read'),
    users: has('users:moderate'),
    content: has('users:moderate') || has('feed:write'),
    feed: has('feed:write'),
    ads: has('ads:read'),
    safety: has('users:moderate') || has('chat:read'),
    sellers: has('marketplace:read') || has('finance:read'),
    finance: has('marketplace:read') || has('finance:read'),
    shopChat: has('chat:read'),
    analytics: has('dashboard:read'),
    ai: platform,
    domains: platform,
    settings: true,
    handbook: has('handbook:read'),
  };
}

export function sessionPermissions(desk: AdminDesk) {
  const has = (p: AdminPermission) => adminHasPermission(desk.role, p, desk);
  return {
    dashboard: has('dashboard:read'),
    handbook: has('handbook:read'),
    moderation: has('users:moderate'),
    chatAdmin: has('chat:read'),
    chatEmergency: desk.role === 'SUPER_ADMIN',
    gpWrite: has('marketplace:write') || has('finance:write'),
  };
}

export function requireAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const alt = req.header('x-admin-api-key')?.trim() ?? '';
  const presented = token || alt;

  const anyKey = Boolean(
    process.env.MASTER_KEY?.trim() ||
      process.env.ADMIN_API_KEY?.trim() ||
      process.env.SUPER_ADMIN_API_KEY?.trim() ||
      process.env.ADMIN_KEY_SAFETY?.trim() ||
      process.env.ADMIN_KEY_ADS?.trim() ||
      process.env.ADMIN_KEY_FEED?.trim() ||
      process.env.ADMIN_KEY_MARKETPLACE?.trim() ||
      process.env.ADMIN_KEY_FINANCE?.trim() ||
      process.env.ADMIN_ACCESS_CODES?.trim(),
  );
  if (!anyKey) {
    return next(new AppError('ADMIN_KEY_MISSING', 'Server ADMIN_API_KEY not configured', 500));
  }

  const desk = resolveAdminAccess(presented);
  if (!desk) {
    return next(new AppError('UNAUTHORIZED', 'Invalid admin credentials', 401));
  }

  req.adminDesk = desk;
  req.adminRole = desk.role;
  req.adminActor = req.header('x-admin-actor')?.trim() || desk.defaultActor;
  return next();
}

/** Handbook / destructive platform ops */
export function requireAdminRole(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.adminRole === 'ADMIN' || req.adminRole === 'SUPER_ADMIN' || req.adminRole === 'FINANCE') {
    return next();
  }
  return next(new AppError('FORBIDDEN', 'ADMIN role required', 403));
}

/** Emergency chat controls — SUPER_ADMIN only */
export function requireSuperAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.adminRole !== 'SUPER_ADMIN') {
    return next(new AppError('FORBIDDEN', 'SUPER_ADMIN role required', 403));
  }
  return next();
}

export function requirePermission(permission: AdminPermission) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!adminHasPermission(req.adminRole, permission, req.adminDesk)) {
      return next(new AppError('FORBIDDEN', `Missing permission: ${permission}`, 403));
    }
    return next();
  };
}

export function listAdminPermissions(role: AdminRole) {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function listAdminRoles(): AdminRole[] {
  return ['SUPER_ADMIN', 'ADMIN', 'SAFETY', 'ADS', 'FEED', 'MARKETPLACE', 'FINANCE'];
}
