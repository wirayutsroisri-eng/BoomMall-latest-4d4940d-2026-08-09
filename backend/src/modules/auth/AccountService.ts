import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { hardDeleteUser } from '../../services/moderation';
import { hashPassword, randomTempPassword } from './PasswordService';
import { upsertProfile } from './ProfileService';

const ROLES = new Set(['BUYER', 'SELLER', 'ADMIN']);

export async function deleteOwnAccount(userId: string, actor: string) {
  if (!userId) throw new AppError('VALIDATION', 'userId required', 400);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.socialLike.deleteMany({ where: { userId } });
      await tx.socialComment.deleteMany({ where: { authorId: userId } });
      await tx.socialPost.deleteMany({ where: { authorId: userId } });
      await tx.boardVote.deleteMany({ where: { userId } });
      await tx.boardReply.deleteMany({ where: { authorId: userId } });
      await tx.boardThread.deleteMany({ where: { authorId: userId } });
      await tx.follow.deleteMany({
      where: { OR: [{ followerId: userId }, { followingId: userId }] },
      });
      await tx.pushDevice.deleteMany({ where: { userId } });
      await tx.eulaAcceptance.deleteMany({ where: { userId } });
      await tx.sellerNotification.deleteMany({ where: { userId } });
      await tx.authIdentity.deleteMany({ where: { userId } });
      await tx.chatParticipant.deleteMany({ where: { userId } });
      await tx.chatMessage.updateMany({
        where: { senderId: userId },
        data: { body: '', status: 'DELETED' },
      });
      await tx.userProfile.deleteMany({ where: { userId } });
    });
  } catch (error) {
    throw new AppError('DATABASE_UNAVAILABLE', 'ไม่สามารถลบบัญชีจากฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง', 503, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  hardDeleteUser({ userId, actor, reason: 'user_requested_delete', allowReRegistration: true });
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
