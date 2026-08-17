/**
 * Social login exchange → AuthIdentity + UserProfile + JWT.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { verifyAppleIdentityToken } from './AppleAuth';
import { verifyGoogleIdentityToken } from './GoogleAuth';
import { verifyFacebookAccessToken } from './FacebookAuth';
import { signAppJwt } from './JwtService';
import { getProfileByEmail, upsertProfile } from './ProfileService';
import { ensureAppleReviewAccount, isAppleReviewEmail } from './appleReviewAccount';
import { assertPasswordPolicy, hashPassword, verifyPassword } from './PasswordService';
import { recordAnalyticsEvent } from '../ecommerce/EventService';
import {
  getUser,
  isSocialBlacklisted,
  upsertUser,
  type SocialProvider,
} from '../../services/moderation';

async function linkIdentity(userId: string, provider: string, providerUserId: string) {
  try {
    await prisma.authIdentity.upsert({
      where: {
        provider_providerUserId: { provider, providerUserId },
      },
      create: {
        id: randomUUID(),
        userId,
        provider,
        providerUserId,
      },
      update: { userId },
    });
  } catch {
    // Prisma model may be unavailable before migrate — ignore; JWT still issued
  }
}

export async function exchangeSocialLogin(input: {
  provider: SocialProvider;
  providerUserId: string;
  displayName?: string;
  handle?: string;
  identityToken?: string;
}) {
  const { provider, displayName, handle, identityToken } = input;
  let providerUserId = input.providerUserId.trim();

  if (!['apple', 'google', 'line', 'facebook'].includes(provider) || !providerUserId) {
    throw new AppError('VALIDATION', 'provider and providerUserId required', 400);
  }

  let verifiedEmail: string | undefined;
  if (provider === 'line') {
    throw new AppError('NOT_IMPLEMENTED', 'LINE Login is not enabled until server token verification ships', 501);
  }
  if (provider === 'apple') {
    if (!identityToken) {
      throw new AppError('VALIDATION', 'identityToken required for Apple Sign In', 400);
    }
    const verified = await verifyAppleIdentityToken(identityToken, providerUserId);
    providerUserId = verified.providerUserId;
    verifiedEmail = verified.email;
  } else if (provider === 'google') {
    if (!identityToken) {
      throw new AppError('VALIDATION', 'identityToken required for Google Sign In', 400);
    }
    const verified = await verifyGoogleIdentityToken(identityToken, providerUserId);
    providerUserId = verified.providerUserId;
    verifiedEmail = verified.email;
  } else if (provider === 'facebook') {
    if (!identityToken) {
      throw new AppError('VALIDATION', 'access token required for Facebook Login', 400);
    }
    const verified = await verifyFacebookAccessToken(identityToken, providerUserId);
    providerUserId = verified.providerUserId;
    verifiedEmail = verified.email;
  }

  if (isSocialBlacklisted(provider, providerUserId)) {
    throw new AppError('FORBIDDEN', 'This social account is banned from BoomMall', 403);
  }

  const userId = `${provider}_${providerUserId}`.slice(0, 64);
  const existing = getUser(userId);
  if (existing?.status === 'banned' || existing?.status === 'soft_banned') {
    throw new AppError('FORBIDDEN', 'Account suspended', 403);
  }
  if (existing?.status === 'hard_deleted') {
    throw new AppError('FORBIDDEN', 'Account deleted', 403);
  }

  const user = upsertUser({
    id: userId,
    displayName: displayName ?? 'BoomMall User',
    handle,
    social: { [provider]: providerUserId },
  });

  const profile = await upsertProfile({
    userId,
    displayName: user.displayName,
    handle: user.handle ?? undefined,
    role: 'BUYER',
    email: verifiedEmail,
  });

  await linkIdentity(userId, provider, providerUserId);

  const accessToken = await signAppJwt({
    sub: userId,
    role: profile.role,
    provider,
    shopId: profile.shopId ?? undefined,
  });

  void recordAnalyticsEvent({ userId, name: 'session.active', entityType: 'user', entityId: userId });

  return {
    accessToken,
    tokenType: 'Bearer' as const,
    /** @deprecated prefer accessToken */
    sessionToken: accessToken,
    user: {
      id: user.id,
      displayName: user.displayName,
      handle: user.handle,
      status: user.status,
      role: profile.role,
      provider,
    },
  };
}

function issueSession(input: {
  userId: string;
  displayName: string;
  handle?: string | null;
  role: string;
  provider: string;
  status?: string;
  shopId?: string | null;
}) {
  void recordAnalyticsEvent({
    userId: input.userId,
    name: 'session.active',
    entityType: 'user',
    entityId: input.userId,
  });
  return signAppJwt({
    sub: input.userId,
    role: input.role,
    provider: input.provider,
    shopId: input.shopId ?? undefined,
  }).then((accessToken) => ({
    accessToken,
    tokenType: 'Bearer' as const,
    sessionToken: accessToken,
    user: {
      id: input.userId,
      displayName: input.displayName,
      handle: input.handle,
      status: input.status ?? 'active',
      role: input.role,
      provider: input.provider,
    },
  }));
}

export async function registerEmail(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw new AppError('VALIDATION', 'email required', 400);
  assertPasswordPolicy(input.password);
  const existing = await getProfileByEmail(email);
  if (existing) throw new AppError('CONFLICT', 'email already registered', 409);

  const userId = `email_${email}`.slice(0, 64);
  const banned = getUser(userId);
  if (banned?.status === 'banned' || banned?.status === 'hard_deleted') {
    throw new AppError('FORBIDDEN', 'Account suspended', 403);
  }

  const handle = email.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').slice(0, 20) || 'user';
  const displayName = input.displayName?.trim() || handle;
  upsertUser({ id: userId, displayName, handle });
  const profile = await upsertProfile({
    userId,
    displayName,
    handle,
    email,
    passwordHash: await hashPassword(input.password),
    role: 'BUYER',
  });
  await linkIdentity(userId, 'email', email);
  return issueSession({
    userId,
    displayName: profile.displayName ?? displayName,
    handle: profile.handle,
    role: profile.role,
    provider: 'email',
    shopId: profile.shopId,
  });
}

export async function loginEmail(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if (isAppleReviewEmail(email)) {
    await ensureAppleReviewAccount();
  }
  const profile = await getProfileByEmail(email);
  if (!profile?.passwordHash) throw new AppError('UNAUTHORIZED', 'invalid credentials', 401);
  const ok = await verifyPassword(input.password, profile.passwordHash);
  if (!ok) throw new AppError('UNAUTHORIZED', 'invalid credentials', 401);

  const banned = getUser(profile.userId);
  if (banned?.status === 'banned' || banned?.status === 'soft_banned') {
    throw new AppError('FORBIDDEN', 'Account suspended', 403);
  }
  if (banned?.status === 'hard_deleted') {
    throw new AppError('FORBIDDEN', 'Account deleted', 403);
  }

  return issueSession({
    userId: profile.userId,
    displayName: profile.displayName ?? email,
    handle: profile.handle,
    role: profile.role,
    provider: 'email',
    shopId: profile.shopId,
  });
}
