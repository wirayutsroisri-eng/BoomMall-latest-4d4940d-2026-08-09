/**
 * Public Shop Identity — source of truth is the existing `UserProfile` row.
 *
 * In BoomMall every account owns one shop (UserProfile.shopId) and products are
 * `CommerceProduct(ownerUserId, merchantId = shopId)`. This service exposes only
 * the PUBLIC shop fields (id/slug/displayName/avatarUrl) with no schema change:
 * no new Shop model, no denormalized copy, no mock/hardcoded identity.
 */

import { prisma } from '../../lib/prisma';
import { currentMediaUrl } from '../media/publicMediaUrl';
import { AppError } from '../../lib/errors';
import { paginate } from '../../lib/cursorPagination';

export type PublicShopDto = {
  /** merchantId / UserProfile.shopId */
  id: string;
  /** canonical, URL-safe identifier — handle without "@" (or shopId when no handle). */
  slug: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type ShopProfileRow = {
  userId: string;
  shopId: string | null;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

const SHOP_PROFILE_SELECT = {
  userId: true,
  shopId: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
} as const;

export function normalizeShopKey(value?: string | null): string {
  return (value ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function shopSlugOf(row: { handle?: string | null; shopId?: string | null }): string {
  const handle = row.handle?.trim() || '';
  return handle ? normalizeShopKey(handle) : String(row.shopId ?? '');
}

export function toPublicShop(row: ShopProfileRow): PublicShopDto | null {
  if (!row.shopId) return null;
  return {
    id: row.shopId,
    slug: shopSlugOf(row),
    displayName: row.displayName?.trim() || null,
    avatarUrl: currentMediaUrl(row.avatarUrl) ?? null,
  };
}

export async function getShopById(shopId: string): Promise<PublicShopDto | null> {
  const id = shopId?.trim();
  if (!id) return null;
  const row = await prisma.userProfile.findFirst({
    where: { shopId: id },
    select: SHOP_PROFILE_SELECT,
  });
  return row ? toPublicShop(row) : null;
}

/** Batch lookup by merchantId — prevents N+1 when enriching catalog lists. */
export async function getShopsByMerchantIds(
  shopIds: string[],
): Promise<Map<string, PublicShopDto>> {
  const ids = [...new Set((shopIds ?? []).map((id) => id?.trim()).filter(Boolean))];
  const shops = new Map<string, PublicShopDto>();
  if (!ids.length) return shops;
  const rows = await prisma.userProfile.findMany({
    where: { shopId: { in: ids } },
    select: SHOP_PROFILE_SELECT,
  });
  for (const row of rows) {
    const dto = toPublicShop(row);
    if (dto) shops.set(dto.id, dto);
  }
  return shops;
}

/**
 * Public shop directory — powers the web storefront's browse/SEO pages.
 * Excludes accounts with `privacyJson.privateAccount = true`: a directory is
 * a discovery surface, unlike a direct lookup by a handle the requester
 * already knows (getShopByKey / requirePublicShop, left unchanged).
 */
export async function listPublicShops(opts: {
  q?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: PublicShopDto[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 24, 1), 60);
  const q = opts.q?.trim();

  let cursorClause: Record<string, unknown> | undefined;
  if (opts.cursor) {
    const cursorRow = await prisma.userProfile.findFirst({
      where: { shopId: opts.cursor },
      select: { userId: true, createdAt: true },
    });
    if (cursorRow) {
      // Same (createdAt, id) keyset shape as cursorWhere() in lib/cursorPagination —
      // written inline because UserProfile's primary key column is `userId`, not `id`.
      cursorClause = {
        OR: [
          { createdAt: { lt: cursorRow.createdAt } },
          { createdAt: cursorRow.createdAt, userId: { lt: cursorRow.userId } },
        ],
      };
    }
  }

  const rows = await prisma.userProfile.findMany({
    where: {
      shopId: { not: null },
      privacyJson: { path: ['privateAccount'], not: true },
      ...(q
        ? {
            OR: [
              { handle: { contains: q, mode: 'insensitive' as const } },
              { displayName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(cursorClause ?? {}),
    },
    select: { ...SHOP_PROFILE_SELECT, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }],
    take: limit + 1,
  });

  const { items, nextCursor } = paginate(rows, limit, (row) => row.shopId ?? row.userId);
  return { items: items.map(toPublicShop).filter((s): s is PublicShopDto => s !== null), nextCursor };
}

/**
 * Resolve a shop by its canonical key: merchantId (shopId) OR slug/handle.
 * Accepts "@" prefixes and is case-insensitive on handles.
 */
export async function getShopByKey(key: string): Promise<PublicShopDto | null> {
  const raw = key?.trim() || '';
  if (!raw) return null;

  // Prefer an exact merchantId match so a shopId can never collide with a handle.
  const byShopId = await prisma.userProfile.findFirst({
    where: { shopId: raw },
    select: SHOP_PROFILE_SELECT,
  });
  if (byShopId) return toPublicShop(byShopId);

  const normalized = normalizeShopKey(raw);
  const byHandle = await prisma.userProfile.findFirst({
    where: {
      OR: [
        { handle: normalized },
        ...(normalized !== raw && normalized ? [{ handle: raw }] : []),
      ],
    },
    select: SHOP_PROFILE_SELECT,
  });
  return byHandle ? toPublicShop(byHandle) : null;
}

/** Same as getShopByKey but throws a 404 for HTTP routes. */
export async function requirePublicShop(key: string): Promise<PublicShopDto> {
  const shop = await getShopByKey(key);
  if (!shop) throw new AppError('SHOP_NOT_FOUND', 'ไม่พบร้านค้านี้', 404);
  return shop;
}
