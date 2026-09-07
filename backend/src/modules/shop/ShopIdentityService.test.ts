import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userProfile: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock('../../lib/prisma', () => ({ prisma: db }));

import {
  getShopByKey,
  getShopById,
  getShopsByMerchantIds,
  normalizeShopKey,
  shopSlugOf,
  toPublicShop,
} from './ShopIdentityService';

const shopRow = {
  userId: 'user-alice',
  shopId: 'shop-alice-uuid',
  handle: 'alice_shop',
  displayName: 'Alice Shop',
  avatarUrl: 'https://cdn.boommall.app/avatar.jpg',
};
beforeEach(() => {
  vi.clearAllMocks();
  db.userProfile.findFirst.mockResolvedValue(shopRow);
  db.userProfile.findMany.mockResolvedValue([shopRow]);
});

describe('normalizeShopKey', () => {
  it('strips @ prefix and trims whitespace', () => {
    expect(normalizeShopKey('  @Alice_Shop ')).toBe('alice_shop');
  });
});

describe('toPublicShop / shopSlugOf', () => {
  it('maps only public fields and never leaks user identity', () => {
    const shop = toPublicShop(shopRow);
    expect(shop).toEqual({
      id: 'shop-alice-uuid',
      slug: 'alice_shop',
      displayName: 'Alice Shop',
      avatarUrl: 'https://cdn.boommall.app/avatar.jpg',
    });
    expect(shop).not.toHaveProperty('userId');
    expect(shop).not.toHaveProperty('email');
  });

  it('falls back to shopId as slug when there is no handle', () => {
    expect(shopSlugOf({ handle: null, shopId: 'shop-xyz' })).toBe('shop-xyz');
  });

  it('returns null when the profile has no shopId', () => {
    expect(toPublicShop({ ...shopRow, shopId: null })).toBeNull();
  });
});

describe('getShopById', () => {
  it('queries by merchantId and maps the public shop', async () => {
    await expect(getShopById('shop-alice-uuid')).resolves.toMatchObject({ id: 'shop-alice-uuid' });
    expect(db.userProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: 'shop-alice-uuid' } }),
    );
  });
});

describe('getShopByKey', () => {
  it('resolves by exact merchantId first', async () => {
    const shop = await getShopByKey('shop-alice-uuid');
    expect(shop?.id).toBe('shop-alice-uuid');
    expect(db.userProfile.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { shopId: 'shop-alice-uuid' } }),
    );
  });

  it('falls back to handle lookup (accepts @ and case differences)', async () => {
    db.userProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(shopRow);
    const shop = await getShopByKey('@ALICE_Shop');
    expect(shop?.id).toBe('shop-alice-uuid');
    expect(db.userProfile.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { OR: expect.arrayContaining([{ handle: 'alice_shop' }]) } }),
    );
  });

  it('returns null when the shop is unknown', async () => {
    db.userProfile.findFirst.mockResolvedValue(null);
    await expect(getShopByKey('no-such-shop')).resolves.toBeNull();
  });
});

describe('getShopsByMerchantIds', () => {
  it('batches unique merchant ids into a map (no N+1)', async () => {
    db.userProfile.findMany.mockResolvedValue([
      shopRow,
      { ...shopRow, userId: 'user-bob', shopId: 'shop-bob', handle: 'bob_shop', displayName: 'Bob' },
    ]);
    const map = await getShopsByMerchantIds(['shop-alice-uuid', 'shop-bob', 'shop-alice-uuid']);
    expect(map.size).toBe(2);
    expect(map.get('shop-alice-uuid')?.displayName).toBe('Alice Shop');
    expect(map.get('shop-bob')?.slug).toBe('bob_shop');
    expect(db.userProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId: { in: ['shop-alice-uuid', 'shop-bob'] } } }),
    );
  });

  it('returns an empty map for an empty input without querying', async () => {
    await expect(getShopsByMerchantIds([])).resolves.toEqual(new Map());
    expect(db.userProfile.findMany).not.toHaveBeenCalled();
  });
});
