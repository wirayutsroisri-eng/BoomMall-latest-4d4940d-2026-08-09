/**
 * End-user Bearer JWT gate. Verifies with jose (HS256) — not jsonwebtoken.
 * Identity is JWT `sub` (also exposed as `user.id`).
 */

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { verifyAppJwt, type AppJwtClaims } from '../modules/auth/JwtService';

export type AuthenticatedRequest = Request & {
  user?: AppJwtClaims;
};

export type UserAuthedRequest = AuthenticatedRequest;

export function authedUserId(req: AuthenticatedRequest) {
  const id = req.user?.id?.trim() || req.user?.sub?.trim();
  if (!id) throw new AppError('UNAUTHORIZED', 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 401);
  return id;
}

function bearerToken(req: Request) {
  const header = req.header('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

/** Production path: Bearer JWT required. */
export async function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    if (!token) {
      throw new AppError('UNAUTHORIZED', 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 401);
    }
    req.user = await verifyAppJwt(token);
    next();
  } catch (err) {
    next(err);
  }
}

export const requireUser = requireAuth;

/** JWT first; `x-user-id` only when ALLOW_DEV_AUTH=1 or non-production. */
export async function requireUserOrDevHeader(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = bearerToken(req);
    if (token) {
      try {
        req.user = await verifyAppJwt(token);
        return next();
      } catch (err) {
        const allowDev =
          process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
        const legacy = req.header('x-user-id')?.trim();
        if (allowDev && legacy) {
          req.user = { sub: legacy, id: legacy, role: 'BUYER' };
          return next();
        }
        throw err;
      }
    }
    const allowDev =
      process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
    const legacy = req.header('x-user-id')?.trim();
    if (allowDev && legacy) {
      req.user = { sub: legacy, id: legacy, role: 'BUYER' };
      return next();
    }
    throw new AppError('UNAUTHORIZED', 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 401);
  } catch (err) {
    next(err);
  }
}
