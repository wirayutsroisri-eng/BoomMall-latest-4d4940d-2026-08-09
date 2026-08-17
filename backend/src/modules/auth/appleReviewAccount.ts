/**
 * App Store Review demo account (Guideline 2.1).
 * Recreated automatically if a reviewer deleted it while testing account deletion.
 */

import { prisma } from '../../lib/prisma';
import { hashPassword } from './PasswordService';
import { getProfileByEmail, upsertProfile } from './ProfileService';
import { restoreHardDeletedUser, upsertUser } from '../../services/moderation';

export const APPLE_REVIEW_EMAIL = (
  process.env.APPLE_REVIEW_EMAIL?.trim() || 'apple-review@boommall.com'
).toLowerCase();
export const APPLE_REVIEW_PASSWORD = process.env.APPLE_REVIEW_PASSWORD?.trim() || 'Password1234';
const APPLE_REVIEW_NAME = 'Apple Review';
const APPLE_REVIEW_HANDLE = 'applereview';

export function isAppleReviewEmail(email: string) {
  return email.trim().toLowerCase() === APPLE_REVIEW_EMAIL;
}

export function appleReviewUserId() {
  return `email_${APPLE_REVIEW_EMAIL}`.slice(0, 64);
}

export async function ensureAppleReviewAccount() {
  const userId = appleReviewUserId();
  restoreHardDeletedUser(userId, APPLE_REVIEW_NAME, APPLE_REVIEW_HANDLE);
  upsertUser({
    id: userId,
    displayName: APPLE_REVIEW_NAME,
    handle: APPLE_REVIEW_HANDLE,
  });

  const passwordHash = await hashPassword(APPLE_REVIEW_PASSWORD);
  const existing = await getProfileByEmail(APPLE_REVIEW_EMAIL);
  await upsertProfile({
    userId: existing?.userId ?? userId,
    displayName: APPLE_REVIEW_NAME,
    handle: APPLE_REVIEW_HANDLE,
    email: APPLE_REVIEW_EMAIL,
    passwordHash,
    role: 'BUYER',
  });

  try {
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
  } catch {
    /* migrate not applied */
  }
}
