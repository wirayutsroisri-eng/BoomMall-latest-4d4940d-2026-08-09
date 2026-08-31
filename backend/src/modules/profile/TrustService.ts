/**
 * Trust Identity — คำนวณสถานะความน่าเชื่อถือของเจ้าของโปรไฟล์จากข้อมูลจริงในระบบ
 * (ร้านค้า/องค์กร/คลังสินค้า/ยอดขาย/ผู้ติดตาม/คอนเทนต์) โดยไม่ต้องให้ผู้ใช้กรอกเอง
 */
import { prisma } from '../../lib/prisma';

export type TrustBadgeKind = 'factory' | 'store' | 'creator' | 'verified' | null;

export type TrustInfo = {
  /** 0 ผู้ใช้ทั่วไป, 1 ผู้ขายหน้าใหม่, 2 ร้านค้าประจำ, 3 ยืนยันตัวตน, 4 องค์กร/โรงงาน */
  level: 0 | 1 | 2 | 3 | 4;
  badge: TrustBadgeKind;
  label: string;
};

export const DEFAULT_TRUST: TrustInfo = { level: 0, badge: null, label: 'ผู้ใช้ทั่วไป' };

/** จำนวนผู้ติดตามขั้นต่ำก่อนนับเป็น Creator ที่น่าเชื่อถือ */
const CREATOR_FOLLOWER_THRESHOLD = 100;
const SUCCESS_ORDER_STATUSES = ['COMPLETED', 'DELIVERED'];

/**
 * คำนวณ Trust แบบ batch (หลาย userId ในคราวเดียว) เพื่อประหยัด query
 * — คืน Map<userId, TrustInfo> เสมอ และไม่มีทาง throw (ล้มแล้วใช้ค่า default)
 */
export async function computeTrusts(userIds: string[]): Promise<Map<string, TrustInfo>> {
  const map = new Map<string, TrustInfo>();
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id && typeof id === 'string')))];
  if (ids.length === 0) return map;
  for (const id of ids) map.set(id, DEFAULT_TRUST);

  try {
    const profiles = await prisma.userProfile.findMany({
      where: { userId: { in: ids } },
      select: { userId: true, role: true, shopId: true },
    });
    const shopIds = [...new Set(profiles.map((p) => p.shopId).filter((id): id is string => Boolean(id)))];

    const stores = shopIds.length
      ? await prisma.store.findMany({ where: { id: { in: shopIds } }, select: { id: true, isCorporate: true, taxId: true } })
      : [];
    const storeByShopId = new Map(stores.map((s) => [s.id, s]));

    const productCounts = await prisma.commerceProduct.groupBy({
      by: ['ownerUserId'],
      where: { ownerUserId: { in: ids }, status: 'ACTIVE' },
      _count: { _all: true },
    });
    const productsByOwner = new Map(productCounts.map((r) => [r.ownerUserId, r._count._all]));

    // นับคลังสินค้าต่อเจ้าของ (product -> sku -> stock)
    const skuRows = await prisma.commerceSku.findMany({
      where: { product: { ownerUserId: { in: ids } } },
      select: { id: true, product: { select: { ownerUserId: true } } },
    });
    const ownerBySku = new Map(skuRows.map((s) => [s.id, s.product.ownerUserId]));
    const stockRows = skuRows.length
      ? await prisma.commerceStock.findMany({ where: { skuId: { in: skuRows.map((s) => s.id) } }, select: { skuId: true, warehouseId: true } })
      : [];
    const warehousesByUser = new Map<string, Set<string>>();
    for (const stock of stockRows) {
      const owner = ownerBySku.get(stock.skuId);
      if (!owner) continue;
      if (!warehousesByUser.has(owner)) warehousesByUser.set(owner, new Set());
      warehousesByUser.get(owner)!.add(stock.warehouseId);
    }

    const orderCounts = shopIds.length
      ? await prisma.commerceOrder.groupBy({
          by: ['merchantId'],
          where: { merchantId: { in: shopIds }, status: { in: SUCCESS_ORDER_STATUSES } },
          _count: { _all: true },
        })
      : [];
    const ordersByMerchant = new Map(orderCounts.map((r) => [r.merchantId, r._count._all]));

    const followerCounts = await prisma.follow.groupBy({
      by: ['followingId'],
      where: { followingId: { in: ids } },
      _count: { _all: true },
    });
    const followersByUser = new Map(followerCounts.map((r) => [r.followingId, r._count._all]));

    const postCounts = await prisma.socialPost.groupBy({
      by: ['authorId'],
      where: { authorId: { in: ids }, status: 'ACTIVE' },
      _count: { _all: true },
    });
    const postsByAuthor = new Map(postCounts.map((r) => [r.authorId, r._count._all]));

    for (const profile of profiles) {
      const store = profile.shopId ? storeByShopId.get(profile.shopId) : undefined;
      const productCount = productsByOwner.get(profile.userId) ?? 0;
      const orderCount = ordersByMerchant.get(profile.shopId ?? '') ?? 0;
      const followerCount = followersByUser.get(profile.userId) ?? 0;
      const postCount = postsByAuthor.get(profile.userId) ?? 0;
      const warehouseCount = warehousesByUser.get(profile.userId)?.size ?? 0;
      const isCorporate = store?.isCorporate ?? false;
      const hasTaxId = Boolean(store?.taxId);
      const isSeller = productCount > 0 || profile.role === 'SELLER';

      let badge: TrustBadgeKind = null;
      let level: 0 | 1 | 2 | 3 | 4 = 0;

      if (isCorporate && hasTaxId) {
        badge = 'factory';
        level = 4;
      } else if (isSeller && hasTaxId) {
        badge = 'store';
        level = 3;
      } else if (isSeller && orderCount > 0) {
        badge = 'store';
        level = 2;
      } else if (isSeller) {
        level = 1;
      } else if (followerCount >= CREATOR_FOLLOWER_THRESHOLD && postCount > 0) {
        badge = 'creator';
        level = 3;
      } else if (hasTaxId) {
        badge = 'verified';
        level = 3;
      } else if (followerCount > 0) {
        level = 1;
      }

      map.set(profile.userId, { level, badge, label: trustLabel(badge, level, warehouseCount) });
    }
  } catch (error) {
    // Trust ไม่ควรทำ core flow พัง — ล้มแล้วใช้ค่า default
    console.warn('[TrustService] computeTrusts failed — falling back to defaults', error);
  }
  return map;
}

export async function computeTrust(userId: string): Promise<TrustInfo> {
  const map = await computeTrusts([userId]);
  return map.get(userId) ?? DEFAULT_TRUST;
}

function trustLabel(badge: TrustBadgeKind, level: number, warehouseCount: number): string {
  if (badge === 'factory') return warehouseCount > 0 ? 'องค์กร / โรงงาน · ยืนยันแล้ว' : 'องค์กร · ยืนยันแล้ว';
  if (badge === 'store') return level >= 3 ? 'ร้านค้ายืนยันแล้ว' : 'ร้านค้าที่มียอดขาย';
  if (badge === 'creator') return 'Creator · ยืนยันแล้ว';
  if (badge === 'verified') return 'ยืนยันตัวตนแล้ว';
  if (level === 1) return 'ผู้ขาย / ผู้สร้างคอนเทนต์';
  return 'ผู้ใช้ทั่วไป';
}

