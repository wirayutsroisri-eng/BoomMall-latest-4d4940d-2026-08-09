/**
 * Facebook Login — verify access token via Graph API /me.
 */

import { createHmac } from 'node:crypto';
import { AppError } from '../../lib/errors';

export type VerifiedFacebookIdentity = {
  provider: 'facebook';
  providerUserId: string;
  name?: string;
  email?: string;
};

function allowDevAuth() {
  return process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
}

export async function verifyFacebookAccessToken(
  accessToken: string,
  expectedId?: string,
): Promise<VerifiedFacebookIdentity> {
  const appId = process.env.FACEBOOK_APP_ID?.trim();
  if (!appId && !allowDevAuth()) {
    throw new AppError(
      'FACEBOOK_NOT_CONFIGURED',
      'FACEBOOK_APP_ID required for Facebook Login in production',
      503,
    );
  }

  if (!accessToken || accessToken.length < 10) {
    throw new AppError('UNAUTHORIZED', 'Invalid Facebook access token', 401);
  }

  if (!appId && allowDevAuth()) {
    return {
      provider: 'facebook',
      providerUserId: expectedId || `dev-fb-${accessToken.slice(0, 12)}`,
      name: 'Facebook User',
    };
  }

  const url = new URL('https://graph.facebook.com/me');
  url.searchParams.set('fields', 'id,name,email');
  url.searchParams.set('access_token', accessToken);
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  if (appSecret) {
    url.searchParams.set(
      'appsecret_proof',
      createHmac('sha256', appSecret).update(accessToken).digest('hex'),
    );
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new AppError('UNAUTHORIZED', 'Facebook token verification failed', 401);
  }
  const data = (await res.json()) as { id?: string; name?: string; email?: string };
  if (!data.id) throw new AppError('UNAUTHORIZED', 'Facebook token missing id', 401);
  if (expectedId && expectedId !== data.id) {
    throw new AppError('UNAUTHORIZED', 'Facebook id mismatch', 401);
  }
  return {
    provider: 'facebook',
    providerUserId: data.id,
    name: data.name,
    email: data.email,
  };
}
