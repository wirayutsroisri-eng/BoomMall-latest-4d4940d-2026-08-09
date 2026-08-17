/**
 * App JWT issuance / verification (HS256 via jose).
 * Used for mobile Sign in with Apple exchange → BoomMall session.
 */

import { createSecretKey } from 'node:crypto';
import * as jose from 'jose';
import { AppError } from '../../lib/errors';

export type AppJwtClaims = {
  /** JWT subject — canonical user id */
  sub: string;
  /** Alias of `sub` for handlers that read `req.user.id` */
  id: string;
  role: string;
  provider?: string;
  shopId?: string;
};

function jwtSecretKey() {
  const raw = process.env.JWT_SECRET?.trim();
  if (raw) return createSecretKey(Buffer.from(raw, 'utf8'));
  if (process.env.NODE_ENV === 'production') {
    throw new AppError('CONFIG', 'JWT_SECRET is required in production', 500);
  }
  const dev =
    process.env.ADMIN_API_KEY?.trim() || 'dev-jwt-insecure-change-me';
  return createSecretKey(Buffer.from(dev, 'utf8'));
}

export async function signAppJwt(
  claims: Omit<AppJwtClaims, 'id'> & { id?: string },
  expiresIn = process.env.JWT_EXPIRES_IN?.trim() || '7d',
): Promise<string> {
  const builder = new jose.SignJWT({
    role: claims.role,
    ...(claims.provider ? { provider: claims.provider } : {}),
    ...(claims.shopId ? { shopId: claims.shopId } : {}),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuer('boommall')
    .setIssuedAt()
    .setExpirationTime(expiresIn);

  return builder.sign(jwtSecretKey());
}

export async function verifyAppJwt(token: string): Promise<AppJwtClaims> {
  try {
    const { payload } = await jose.jwtVerify(token, jwtSecretKey(), {
      issuer: 'boommall',
      algorithms: ['HS256'],
    });
    const extra = payload as Record<string, unknown>;
    const sub = [payload.sub, extra.id, extra.userId]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find(Boolean);
    if (!sub) throw new AppError('INVALID_TOKEN_PAYLOAD', 'Token ไม่ถูกต้อง', 401);
    return {
      sub,
      id: sub,
      role: typeof payload.role === 'string' ? payload.role : 'BUYER',
      provider: typeof payload.provider === 'string' ? payload.provider : undefined,
      shopId: typeof payload.shopId === 'string' ? payload.shopId : undefined,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    if (e instanceof jose.errors.JWTExpired) {
      throw new AppError('TOKEN_EXPIRED_OR_INVALID', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
    }
    throw new AppError('TOKEN_EXPIRED_OR_INVALID', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
  }
}

export function authDomainJwtStatus() {
  return {
    algorithm: 'HS256',
    issuer: 'boommall',
    jwtSecretConfigured: Boolean(process.env.JWT_SECRET?.trim()),
    appleClientIdConfigured: Boolean(process.env.APPLE_CLIENT_ID?.trim()),
    allowDevAuth: process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production',
  };
}
