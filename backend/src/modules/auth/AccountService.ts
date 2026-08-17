import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { hardDeleteUser } from '../../services/moderation';
import { hashPassword, randomTempPassword } from './PasswordService';
import { upsertProfile } from './ProfileService';

const ROLES = new Set(['BUYER', 'SELLER', 'ADMIN']);

async function ignoreMissingTable(run: () => Promise<unknown>) {
  try {
    await run();
  } catch {
    /* table may not exist yet */
  }
}

export async function deleteOwnAccount(userId: string, actor: string) {
  if (!userId) throw new AppError('VALIDATION', 'userId required', 400);

  await ignoreMissingTable(() => prisma.socialLike.deleteMany({ where: { userId } }));
  await ignoreMissingTable(() => prisma.socialComment.deleteMany({ where: { authorId: userId } }));
  await ignoreMissingTable(() => prisma.socialPost.deleteMany({ where: { authorId: userId } }));
  await ignoreMissingTable(() => prisma.boardVote.deleteMany({ where: { userId } }));
  await ignoreMissingTable(() => prisma.boardReply.deleteMany({ where: { authorId: userId } }));
  await ignoreMissingTable(() => prisma.boardThread.deleteMany({ where: { authorId: userId } }));
  await ignoreMissingTable(() =>
    prisma.follow.deleteMany({
      where: { OR: [{ followerId: userId }, { followingId: userId }] },
    }),
  );
  await ignoreMissingTable(() => prisma.pushDevice.deleteMany({ where: { userId } }));
  await ignoreMissingTable(() => prisma.eulaAcceptance.deleteMany({ where: { userId } }));
  await ignoreMissingTable(() => prisma.sellerNotification.deleteMany({ where: { userId } }));
  await ignoreMissingTable(() => prisma.authIdentity.deleteMany({ where: { userId } }));
  await ignoreMissingTable(() => prisma.chatParticipant.deleteMany({ where: { userId } }));
  await ignoreMissingTable(() =>
    prisma.chatMessage.updateMany({
      where: { senderId: userId },
      data: { body: '', status: 'DELETED' },
    }),
  );
  await ignoreMissingTable(() => prisma.userProfile.deleteMany({ where: { userId } }));

  hardDeleteUser({ userId, actor, reason: 'user_requested_delete' });
  return { ok: true as const, userId, deletedAt: new Date().toISOString() };
}

export async function adminSetUserRole(userId: string, role: string) {
  const next = role.trim().toUpperCase();
  if (!ROLES.has(next)) throw new AppError('VALIDATION', 'role must be BUYER | SELLER | ADMIN', 400);
  return upsertProfile({ userId, role: next });
}

export async function adminResetPassword(userId: string) {
  if (!userId) throw new AppError('VALIDATION', 'userId required', 400);
  const temp = randomTempPassword();
  const passwordHash = await hashPassword(temp);
  try {
    const row = await prisma.userProfile.update({
      where: { userId },
      data: { passwordHash },
    });
    return {
      userId: row.userId,
      temporaryPassword: temp,
      note: 'ส่งรหัสนี้ให้ผู้ใช้ครั้งเดียว แล้วให้เปลี่ยนทันที',
    };
  } catch {
    throw new AppError('NOT_FOUND', 'profile not found', 404);
  }
}
