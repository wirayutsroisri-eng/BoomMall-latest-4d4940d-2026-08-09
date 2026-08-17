/**
 * Google Sign-In — verify id_token against Google JWKS.
 */

import * as jose from 'jose';
import { AppError } from '../../lib/errors';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_JWKS = jose.createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export type VerifiedGoogleIdentity = {
  provider: 'google';
  providerUserId: string;
  email?: string;
  name?: string;
};

function allowDevAuth() {
  return process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
}

export async function verifyGoogleIdentityToken(
  identityToken: string,
  expectedSub?: string,
): Promise<VerifiedGoogleIdentity> {
  const audience = process.env.GOOGLE_CLIENT_ID?.trim();

  if (!audience) {
    if (!allowDevAuth()) {
      throw new AppError(
        'GOOGLE_NOT_CONFIGURED',
        'GOOGLE_CLIENT_ID required for Google Sign-In in production',
        503,
      );
    }
    const decoded = jose.decodeJwt(identityToken);
    const sub = typeof decoded.sub === 'string' ? decoded.sub : expectedSub;
    if (!sub) throw new AppError('UNAUTHORIZED', 'Google token missing sub', 401);
    if (expectedSub && expectedSub !== sub) {
      throw new AppError('UNAUTHORIZED', 'Google sub mismatch', 401);
    }
    return {
      provider: 'google',
      providerUserId: sub,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
    };
  }

  try {
    const { payload } = await jose.jwtVerify(identityToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    if (!sub) throw new AppError('UNAUTHORIZED', 'Google token missing sub', 401);
    if (expectedSub && expectedSub !== sub) {
      throw new AppError('UNAUTHORIZED', 'Google sub mismatch', 401);
    }
    return {
      provider: 'google',
      providerUserId: sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('UNAUTHORIZED', 'Google identity token verification failed', 401);
  }
}
