/**
 * Social login exchange → AuthIdentity + UserProfile + JWT.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { verifyAppleIdentityToken } from './AppleAuth';
import { verifyGoogleIdentityToken } from './GoogleAuth';
import { verifyFacebookAccessToken } from './FacebookAuth';
import { consumePhoneOtp, maskPhone, requestPhoneOtp as issuePhoneOtp } from './PhoneAuth';
import { signAppJwt } from './JwtService';
import { getProfile, getProfileByEmail, upsertProfile } from './ProfileService';
import { ensureAppleReviewAccount, isAppleReviewEmail } from './appleReviewAccount';
import { assertPasswordPolicy, hashPassword, verifyPassword } from './PasswordService';
import { recordAnalyticsEvent } from '../ecommerce/EventService';
import {
  getUser,
  isSocialBlacklisted,
  upsertUser,
  restoreHardDeletedUser,
  type SocialProvider,
} from '../../services/moderation';

/** Canonical account IDs are opaque UUIDs created by the backend, never identity-derived strings. */
export function createAccountUserId() {
  return randomUUID();
}

async function linkIdentity(userId: string, provider: string, providerUserId: string) {
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
}

async function findIdentity(provider: string, providerUserId: string) {
  try {
    return await prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
    });
  } catch (error) {
    throw new AppError('DATABASE_UNAVAILABLE', 'ไม่สามารถเชื่อมต่อฐานข้อมูลบัญชีได้ กรุณาลองใหม่อีกครั้ง', 503, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function exchangeSocialLogin(input: {
  provider: SocialProvider;
  providerUserId: string;
  displayName?: string;
  handle?: string;
  identityToken?: string;
  mode?: 'login' | 'register';
}) {
  const { provider, displayName, handle, identityToken } = input;
  const mode = input.mode ?? 'login';
  let providerUserId = input.providerUserId.trim();

  if (!['apple', 'google', 'line', 'facebook'].includes(provider) || !providerUserId) {
    throw new AppError('VALIDATION', 'provider and providerUserId required', 400);
  }

  let verifiedEmail: string | undefined;
  let verifiedDisplayName: string | undefined;
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
    verifiedDisplayName = verified.name;
  } else if (provider === 'facebook') {
    if (!identityToken) {
      throw new AppError('VALIDATION', 'access token required for Facebook Login', 400);
    }
    const verified = await verifyFacebookAccessToken(identityToken, providerUserId);
    providerUserId = verified.providerUserId;
    verifiedEmail = verified.email;
    verifiedDisplayName = verified.name;
  }

  const identity = await findIdentity(provider, providerUserId);
  if (mode === 'register' && identity) {
    throw new AppError('ACCOUNT_EXISTS', 'บัญชีนี้สมัครแล้ว กรุณาเลือกเข้าสู่ระบบ', 409);
  }
  if (mode === 'login' && !identity) {
    throw new AppError('NOT_FOUND', 'ยังไม่มีบัญชี กรุณาเลือกสมัครสมาชิก', 404);
  }
  const userId = identity?.userId ?? createAccountUserId();
  const existing = getUser(userId);
  if (existing?.status === 'banned' || existing?.status === 'soft_banned') {
    throw new AppError('FORBIDDEN', 'Account suspended', 403);
  }
  const existingProfile = identity ? await getProfile(userId) : null;
  if (existing?.status === 'hard_deleted') {
    if (mode === 'login') throw new AppError('NOT_FOUND', 'ไม่พบบัญชี กรุณาสมัครสมาชิกใหม่', 404);
    const restoredName = displayName?.trim();
    if (!restoredName) throw new AppError('VALIDATION', 'กรุณากรอกชื่อที่แสดงก่อนสมัครสมาชิก', 400);
    restoreHardDeletedUser(userId, restoredName, handle);
  } else {
    if (mode === 'login' && !existingProfile) throw new AppError('ACCOUNT_DATA_MISSING', 'ไม่พบข้อมูลโปรไฟล์ของบัญชี', 409);
  }
  if (isSocialBlacklisted(provider, providerUserId)) {
    throw new AppError('FORBIDDEN', 'This social account is banned from BoomMall', 403);
  }

  const realDisplayName =
    existingProfile?.displayName?.trim() || verifiedDisplayName?.trim() || displayName?.trim();
  if (!realDisplayName) {
    throw new AppError('VALIDATION', 'กรุณากรอกชื่อที่แสดงก่อนสมัครสมาชิก', 400);
  }
  const user = upsertUser({
    id: userId,
    displayName: realDisplayName,
    handle: existingProfile?.handle ?? handle,
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

  const userId = createAccountUserId();
  const banned = getUser(userId);
  if (banned?.status === 'banned') {
    throw new AppError('FORBIDDEN', 'Account suspended', 403);
  }
  const handle = email.split('@')[0]?.replace(/[^a-z0-9_]/gi, '').slice(0, 20) || `u${userId.slice(0, 8)}`;
  const displayName = input.displayName?.trim();
  if (!displayName) throw new AppError('VALIDATION', 'กรุณากรอกชื่อที่แสดง', 400);
  if (banned?.status === 'hard_deleted') restoreHardDeletedUser(userId, displayName, handle);
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

export async function requestPhoneOtp(input: { phone: string; ipHint?: string }) {
  return issuePhoneOtp(input);
}

export async function verifyPhoneOtp(input: { phone: string; code: string; mode?: 'login' | 'register'; displayName?: string }) {
  const e164 = consumePhoneOtp(input);
  const identity = await findIdentity('phone', e164);
  if (input.mode === 'register' && identity) {
    throw new AppError('ACCOUNT_EXISTS', 'เบอร์นี้สมัครแล้ว กรุณาเลือกเข้าสู่ระบบ', 409);
  }
  if (input.mode === 'login' && !identity) {
    throw new AppError('NOT_FOUND', 'เบอร์นี้ยังไม่มีบัญชี กรุณาเลือกสมัครสมาชิก', 404);
  }
  const userId = identity?.userId ?? createAccountUserId();
  const existing = getUser(userId);
  const existingProfile = identity ? await getProfile(userId) : null;
  if (existing?.status === 'banned' || existing?.status === 'soft_banned') {
    throw new AppError('FORBIDDEN', 'Account suspended', 403);
  }
  if (existing?.status === 'hard_deleted') {
    if (input.mode === 'login') throw new AppError('NOT_FOUND', 'ไม่พบบัญชี กรุณาสมัครสมาชิกใหม่', 404);
    const restoredName = input.displayName?.trim();
    if (!restoredName) throw new AppError('VALIDATION', 'กรุณากรอกชื่อที่แสดงก่อนสมัครสมาชิก', 400);
    restoreHardDeletedUser(userId, restoredName, `u${userId.slice(0, 12)}`);
  } else {
    if (input.mode === 'register' && existingProfile) {
      throw new AppError('ACCOUNT_EXISTS', 'เบอร์นี้สมัครแล้ว กรุณาเลือกเข้าสู่ระบบ', 409);
    }
    if (input.mode === 'login' && !existingProfile) {
      throw new AppError('NOT_FOUND', 'เบอร์นี้ยังไม่มีบัญชี กรุณาเลือกสมัครสมาชิก', 404);
    }
  }

  const displayName = existingProfile?.displayName?.trim() || existing?.displayName || input.displayName?.trim();
  if (!displayName) throw new AppError('VALIDATION', 'กรุณากรอกชื่อที่แสดงก่อนสมัครสมาชิก', 400);
  const handle = existingProfile?.handle || existing?.handle || `u${userId.replace(/-/g, '').slice(0, 12)}`;
  const user = upsertUser({
    id: userId,
    displayName,
    handle,
    social: { phone: e164 },
  });
  const profile = await upsertProfile({
    userId,
    displayName: user.displayName,
    handle: user.handle ?? handle,
    role: 'BUYER',
  });
  await linkIdentity(userId, 'phone', e164);

  return issueSession({
    userId,
    displayName: profile.displayName ?? user.displayName,
    handle: profile.handle,
    role: profile.role,
    provider: 'phone',
    shopId: profile.shopId,
  }).then((session) => ({ ...session, phoneMasked: maskPhone(e164) }));
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
