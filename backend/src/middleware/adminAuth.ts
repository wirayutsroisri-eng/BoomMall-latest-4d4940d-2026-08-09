import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';

export type AdminRole = 'ADMIN';

export type AuthedRequest = Request & {
  adminActor?: string;
  adminRole?: AdminRole;
};

/**
 * Shared-secret admin auth for internal dashboard.
 * Header: Authorization: Bearer <ADMIN_API_KEY>
 * Optional: X-Admin-Actor for audit trail
 *
 * Valid key ⇒ role ADMIN only (handbook + mint approve).
 */
export function requireAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_KEY ?? '';
  if (!expected) {
    return next(new AppError('ADMIN_KEY_MISSING', 'Server ADMIN_API_KEY not configured', 500));
  }

  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const alt = req.header('x-admin-api-key')?.trim() ?? '';

  if (token !== expected && alt !== expected) {
    return next(new AppError('UNAUTHORIZED', 'Invalid admin credentials', 401));
  }

  req.adminActor = req.header('x-admin-actor')?.trim() || 'admin';
  req.adminRole = 'ADMIN';
  return next();
}

/** Handbook and destructive ops — ADMIN role only */
export function requireAdminRole(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.adminRole !== 'ADMIN') {
    return next(new AppError('FORBIDDEN', 'ADMIN role required', 403));
  }
  return next();
}
