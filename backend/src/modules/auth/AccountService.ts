import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { hardDeleteUser } from '../../services/moderation';
import { hashPassword, randomTempPassword } from './PasswordService';
import { upsertProfile } from './ProfileService';
import { mediaStorageProvider } from '../media/storage';

const ROLES = new Set(['BUYER', 'SELLER', 'ADMIN']);

export async function deleteOwnAccount(userId: string, actor: string) {
  if (!userId) throw new AppError('VALIDATION', 'userId required', 400);

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { shopId: true },
  });
  if (!profile) throw new AppError('NOT_FOUND', 'ไม่พบบัญชีผู้ใช้', 404);
  const deletedUserRef = `deleted:${randomUUID()}`;
  const deletedShopRef = profile.shopId ? `deleted-shop:${randomUUID()}` : null;
  const media = await prisma.mediaAsset.findMany({
    where: { ownerId: userId },
    select: { storageKey: true },
  });
  const buyerOrders = await prisma.commerceOrder.findMany({
    where: { buyerId: userId },
    select: { shipmentGroupId: true },
  });
  const shipmentGroupIds = buyerOrders
    .map((row) => row.shipmentGroupId)
    .filter((id): id is string => Boolean(id));

  try {
    await prisma.$transaction(async (tx) => {
      const sentMessages = await tx.chatMessage.findMany({
        where: { senderId: userId },
        select: { id: true },
      });
      const sentMessageIds = sentMessages.map((row) => row.id);
      if (sentMessageIds.length) {
        await tx.chatMessageAttachment.deleteMany({ where: { messageId: { in: sentMessageIds } } });
      }
      await tx.chatMessage.updateMany({
        where: { senderId: userId },
        data: { senderId: deletedUserRef, body: '', metadataJson: {}, status: 'DELETED' },
      });
      await tx.analyticsEvent.updateMany({
        where: { userId },
        data: { userId: null, payloadJson: {} },
      });

      // Paid commerce/finance records are retained but detached from personal identity.
      await tx.commerceOrder.updateMany({
        where: { buyerId: userId },
        data: { buyerId: deletedUserRef, shippingJson: {}, addressMergeKey: null },
      });
      if (shipmentGroupIds.length) {
        await tx.shipmentGroup.updateMany({
          where: { id: { in: shipmentGroupIds } },
          data: { addressMergeKey: `deleted:${randomUUID()}` },
        });
      }
      if (profile.shopId && deletedShopRef) {
        await tx.commerceOrder.updateMany({
          where: { merchantId: profile.shopId },
          data: { merchantId: deletedShopRef },
        });
        await tx.commerceProduct.deleteMany({ where: { merchantId: profile.shopId } });
        await tx.catalogItem.deleteMany({ where: { merchantId: profile.shopId } });
        await tx.merchantPayoutAccount.deleteMany({ where: { merchantId: profile.shopId } });
        await tx.store.updateMany({
          where: { id: profile.shopId },
          data: {
            name: 'Deleted store', taxId: null, address: null, bankName: null,
            bankAccountNo: null, bankAccountName: null, bankCode: null,
            paymentPinHash: null,
          },
        });
        await tx.sellerWallet.updateMany({
          where: { sellerId: profile.shopId },
          data: {
            sellerId: deletedShopRef, bankName: null, bankAccountNo: null,
            bankAccountName: null, bankCode: null,
          },
        });
      }

      // Database cascades remove all social/profile children linked to this userId.
      await tx.userProfile.delete({ where: { userId } });
    });
  } catch (error) {
    throw new AppError('DATABASE_UNAVAILABLE', 'ไม่สามารถลบบัญชีจากฐานข้อมูลได้ กรุณาลองใหม่อีกครั้ง', 503, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  await Promise.allSettled(media.map((asset) => mediaStorageProvider().remove(asset.storageKey)));

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
