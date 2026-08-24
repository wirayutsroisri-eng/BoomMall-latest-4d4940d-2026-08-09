/**
 * App Store Review demo account (Guideline 2.1).
 * Recreated automatically if a reviewer deleted it while testing account deletion.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { hashPassword } from './PasswordService';
import { getProfileByEmail, upsertProfile } from './ProfileService';
import { restoreHardDeletedUser, upsertUser } from '../../services/moderation';

export const APPLE_REVIEW_EMAIL = (
  process.env.APPLE_REVIEW_EMAIL?.trim() || ''
).toLowerCase();
export const APPLE_REVIEW_PASSWORD = process.env.APPLE_REVIEW_PASSWORD?.trim() || '';
const APPLE_REVIEW_NAME = process.env.APPLE_REVIEW_NAME?.trim() || '';
const APPLE_REVIEW_HANDLE = process.env.APPLE_REVIEW_HANDLE?.trim() || '';

export function isAppleReviewEmail(email: string) {
  return Boolean(APPLE_REVIEW_EMAIL) && email.trim().toLowerCase() === APPLE_REVIEW_EMAIL;
}

export async function ensureAppleReviewAccount() {
  if (!APPLE_REVIEW_EMAIL || !APPLE_REVIEW_PASSWORD || !APPLE_REVIEW_NAME || !APPLE_REVIEW_HANDLE) {
    throw new AppError('CONFIG', 'Apple Review account environment is incomplete', 503);
  }
  const existing = await getProfileByEmail(APPLE_REVIEW_EMAIL);
  const identity = await prisma.authIdentity.findUnique({
    where: { provider_providerUserId: { provider: 'email', providerUserId: APPLE_REVIEW_EMAIL } },
  });
  const userId = existing?.userId ?? identity?.userId ?? randomUUID();
  restoreHardDeletedUser(userId, APPLE_REVIEW_NAME, APPLE_REVIEW_HANDLE);
  upsertUser({
    id: userId,
    displayName: APPLE_REVIEW_NAME,
    handle: APPLE_REVIEW_HANDLE,
  });

  const passwordHash = await hashPassword(APPLE_REVIEW_PASSWORD);
  await upsertProfile({
    userId,
    displayName: APPLE_REVIEW_NAME,
    handle: APPLE_REVIEW_HANDLE,
    email: APPLE_REVIEW_EMAIL,
    passwordHash,
    role: 'BUYER',
  });

  await prisma.authIdentity.upsert({
      where: {
        provider_providerUserId: { provider: 'email', providerUserId: APPLE_REVIEW_EMAIL },
      },
      create: {
        userId,
        provider: 'email',
        providerUserId: APPLE_REVIEW_EMAIL,
      },
      update: { userId },
    });
}
