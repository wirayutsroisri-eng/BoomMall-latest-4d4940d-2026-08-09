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

export async function verifyGoogleIdentityToken(
  identityToken: string,
  expectedSub?: string,
): Promise<VerifiedGoogleIdentity> {
  const audiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
  const audience = audiences.length === 1 ? audiences[0] : audiences.length > 1 ? audiences : '';

  if (!audience || (Array.isArray(audience) && audience.length === 0)) {
    throw new AppError(
      'GOOGLE_NOT_CONFIGURED',
      'GOOGLE_CLIENT_ID required for Google Sign-In',
      503,
    );
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
