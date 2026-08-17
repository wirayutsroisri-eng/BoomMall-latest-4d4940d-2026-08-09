/**
 * Sign in with Apple — verify identityToken against Apple JWKS.
 * Dev: ALLOW_DEV_AUTH=1 (or non-production) may skip JWKS when APPLE_CLIENT_ID unset.
 */

import * as jose from 'jose';
import { AppError } from '../../lib/errors';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = jose.createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export type VerifiedAppleIdentity = {
  provider: 'apple';
  providerUserId: string;
  email?: string;
};

function allowDevAuth() {
  return process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
}

export async function verifyAppleIdentityToken(
  identityToken: string,
  expectedSub?: string,
): Promise<VerifiedAppleIdentity> {
  const audience = process.env.APPLE_CLIENT_ID?.trim();

  if (!audience) {
    if (!allowDevAuth()) {
      throw new AppError(
        'APPLE_NOT_CONFIGURED',
        'APPLE_CLIENT_ID required for Sign in with Apple in production',
        503,
      );
    }
    // Dev path: decode without verify (never ship as production trust)
    const decoded = jose.decodeJwt(identityToken);
    const sub = typeof decoded.sub === 'string' ? decoded.sub : expectedSub;
    if (!sub) throw new AppError('UNAUTHORIZED', 'Apple token missing sub', 401);
    if (expectedSub && expectedSub !== sub) {
      throw new AppError('UNAUTHORIZED', 'Apple sub mismatch', 401);
    }
    return {
      provider: 'apple',
      providerUserId: sub,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
  }

  try {
    const { payload } = await jose.jwtVerify(identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience,
    });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) throw new AppError('UNAUTHORIZED', 'Apple token missing sub', 401);
    if (expectedSub && expectedSub !== sub) {
      throw new AppError('UNAUTHORIZED', 'Apple sub mismatch', 401);
    }
    return {
      provider: 'apple',
      providerUserId: sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('UNAUTHORIZED', 'Apple identity token verification failed', 401);
  }
}
