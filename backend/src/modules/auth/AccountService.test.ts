import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    chatMessage: { findMany: vi.fn(), updateMany: vi.fn() },
    chatMessageAttachment: { deleteMany: vi.fn() },
    analyticsEvent: { updateMany: vi.fn() },
    commerceOrder: { updateMany: vi.fn() },
    shipmentGroup: { updateMany: vi.fn() },
    commerceProduct: { deleteMany: vi.fn() },
    catalogItem: { deleteMany: vi.fn() },
    merchantPayoutAccount: { deleteMany: vi.fn() },
    store: { updateMany: vi.fn() },
    sellerWallet: { updateMany: vi.fn() },
    userProfile: { delete: vi.fn() },
  };
  return {
    tx,
    prisma: {
      userProfile: { findUnique: vi.fn() },
      mediaAsset: { findMany: vi.fn() },
      commerceOrder: { findMany: vi.fn() },
      $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
    },
    removeMedia: vi.fn(),
    hardDeleteUser: vi.fn(),
  };
});

vi.mock('../../lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../media/storage', () => ({ mediaStorageProvider: () => ({ remove: mocks.removeMedia }) }));
vi.mock('../../services/moderation', () => ({ hardDeleteUser: mocks.hardDeleteUser }));
vi.mock('./ProfileService', () => ({ upsertProfile: vi.fn() }));

import { deleteOwnAccount } from './AccountService';

describe('deleteOwnAccount ownership boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.userProfile.findUnique.mockResolvedValue({ shopId: 'shop-1' });
    mocks.prisma.mediaAsset.findMany.mockResolvedValue([{ storageKey: 'images/account-photo.jpg' }]);
    mocks.prisma.commerceOrder.findMany.mockResolvedValue([{ shipmentGroupId: 'shipment-1' }]);
    mocks.tx.chatMessage.findMany.mockResolvedValue([{ id: 'message-1' }]);
  });

  it('anonymizes retained records, deletes the profile root, and removes owned media', async () => {
    const result = await deleteOwnAccount('user-1', 'user-1');

    expect(mocks.tx.chatMessageAttachment.deleteMany).toHaveBeenCalledWith({
      where: { messageId: { in: ['message-1'] } },
    });
    expect(mocks.tx.commerceOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { buyerId: 'user-1' },
      data: expect.objectContaining({ shippingJson: {}, addressMergeKey: null }),
    }));
    expect(mocks.tx.userProfile.delete).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(mocks.removeMedia).toHaveBeenCalledWith('images/account-photo.jpg');
    expect(mocks.hardDeleteUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1' }));
    expect(result.ok).toBe(true);
  });
});
