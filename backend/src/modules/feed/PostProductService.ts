/**
 * Shoppable posts — pinning real catalog products to a post ("ปักตะกร้า").
 *
 * A pin stores only a reference. Title, price and stock are read live from the
 * commerce tables on every request, so a post can never keep advertising a price
 * or a stock level the shop has moved on from.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export type PostProductInput = {
  productId: string;
  skuId?: string | null;
  mediaId?: string | null;
  x?: number | null;
  y?: number | null;
};

export type PostProductDto = {
  productId: string;
  skuId: string | null;
  sellerId: string;
  shopName: string;
  title: string;
  /** Live price in THB — the pinned SKU's price, else the product's base price. */
  priceThb: number;
  currency: string;
  /** Live availability across warehouses. */
  available: number;
  inStock: boolean;
  /** False when the product was hidden or deleted after it was pinned. */
  active: boolean;
  mediaId: string | null;
  x: number | null;
  y: number | null;
  sortOrder: number;
};

const MAX_PINS_PER_POST = 10;

function clampCoord(value: unknown): number | null {
  // Only a real number is a coordinate. Number(null) is 0, which would silently
  // park an unplaced pin in the top-left corner of the media.
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

export function normalizePostProductInput(input: unknown): PostProductInput[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: PostProductInput[] = [];
  for (const entry of input.slice(0, MAX_PINS_PER_POST * 2)) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const productId = typeof row.productId === 'string' ? row.productId.trim() : '';
    if (!productId || seen.has(productId)) continue;
    seen.add(productId);
    out.push({
      productId,
      skuId: typeof row.skuId === 'string' && row.skuId.trim() ? row.skuId.trim() : null,
      mediaId: typeof row.mediaId === 'string' && row.mediaId.trim() ? row.mediaId.trim() : null,
      x: clampCoord(row.x),
      y: clampCoord(row.y),
    });
    if (out.length >= MAX_PINS_PER_POST) break;
  }
  return out;
}

/**
 * Writes the pins for a post.
 *
 * Only products the author actually owns can be pinned — otherwise anyone could
 * attach their post to someone else's shop and, once commissions exist, to
 * someone else's money.
 */
export async function attachProductsToPost(input: {
  postId: string;
  authorId: string;
  products: PostProductInput[];
  tx?: Pick<typeof prisma, 'commerceProduct' | 'postProduct' | 'socialPost'>;
}): Promise<number> {
  const products = input.products.slice(0, MAX_PINS_PER_POST);
  if (!products.length) return 0;
  const db = input.tx ?? prisma;

  const owned = await db.commerceProduct.findMany({
    where: {
      id: { in: products.map((p) => p.productId) },
      ownerUserId: input.authorId,
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));
  const rows = products
    .filter((product) => ownedIds.has(product.productId))
    .map((product, index) => ({
      id: randomUUID(),
      postId: input.postId,
      productId: product.productId,
      skuId: product.skuId,
      sellerId: input.authorId,
      mediaId: product.mediaId,
      x: product.x,
      y: product.y,
      sortOrder: index,
    }));

  if (!rows.length) return 0;
  await db.postProduct.createMany({ data: rows, skipDuplicates: true });
  await db.socialPost.update({
    where: { id: input.postId },
    data: { productCount: rows.length },
  });
  return rows.length;
}

function availableOf(stock: Array<{ onHand: number; reserved: number }>): number {
  return stock.reduce((sum, row) => sum + Math.max(0, row.onHand - row.reserved), 0);
}

/** Reads pins with live catalog data. Returns [] rather than throwing. */
export async function listPostProducts(postId: string): Promise<PostProductDto[]> {
  let pins: Array<{
    productId: string;
    skuId: string | null;
    sellerId: string;
    mediaId: string | null;
    x: number | null;
    y: number | null;
    sortOrder: number;
  }>;
  try {
    pins = await prisma.postProduct.findMany({
      where: { postId },
      orderBy: { sortOrder: 'asc' },
      select: { productId: true, skuId: true, sellerId: true, mediaId: true, x: true, y: true, sortOrder: true },
    });
  } catch {
    return [];
  }
  if (!pins.length) return [];

  const products = await prisma.commerceProduct.findMany({
    where: { id: { in: pins.map((pin) => pin.productId) } },
    include: { variants: { include: { stock: true } } },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  return pins.map((pin) => {
    const product = byId.get(pin.productId);
    if (!product) {
      // Pinned then deleted: the app shows "สินค้านี้ไม่พร้อมขาย" instead of a dead link.
      return {
        productId: pin.productId,
        skuId: pin.skuId,
        sellerId: pin.sellerId,
        shopName: '',
        title: '',
        priceThb: 0,
        currency: 'THB',
        available: 0,
        inStock: false,
        active: false,
        mediaId: pin.mediaId,
        x: pin.x,
        y: pin.y,
        sortOrder: pin.sortOrder,
      };
    }
    const sku = pin.skuId ? product.variants.find((variant) => variant.id === pin.skuId) : undefined;
    const stock = sku ? sku.stock : product.variants.flatMap((variant) => variant.stock);
    const available = availableOf(stock);
    return {
      productId: product.id,
      skuId: sku?.id ?? null,
      sellerId: pin.sellerId,
      shopName: product.shopName,
      title: product.title,
      priceThb: sku?.priceThb ?? product.basePrice,
      currency: product.currency,
      available,
      inStock: available > 0,
      active: product.status === 'ACTIVE',
      mediaId: pin.mediaId,
      x: pin.x,
      y: pin.y,
      sortOrder: pin.sortOrder,
    };
  });
}

/** Bulk variant for feed pages — one query per table instead of one per post. */
export async function listPostProductsForPosts(
  postIds: string[],
): Promise<Map<string, PostProductDto[]>> {
  const out = new Map<string, PostProductDto[]>();
  if (!postIds.length) return out;
  let pins: Array<{ postId: string; productId: string; skuId: string | null; sellerId: string; mediaId: string | null; x: number | null; y: number | null; sortOrder: number }>;
  try {
    pins = await prisma.postProduct.findMany({
      where: { postId: { in: postIds } },
      orderBy: { sortOrder: 'asc' },
      select: { postId: true, productId: true, skuId: true, sellerId: true, mediaId: true, x: true, y: true, sortOrder: true },
    });
  } catch {
    return out;
  }
  if (!pins.length) return out;

  const products = await prisma.commerceProduct.findMany({
    where: { id: { in: [...new Set(pins.map((pin) => pin.productId))] } },
    include: { variants: { include: { stock: true } } },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  for (const pin of pins) {
    const product = byId.get(pin.productId);
    const sku = pin.skuId && product ? product.variants.find((variant) => variant.id === pin.skuId) : undefined;
    const stock = product ? (sku ? sku.stock : product.variants.flatMap((variant) => variant.stock)) : [];
    const available = availableOf(stock);
    const dto: PostProductDto = {
      productId: pin.productId,
      skuId: sku?.id ?? null,
      sellerId: pin.sellerId,
      shopName: product?.shopName ?? '',
      title: product?.title ?? '',
      priceThb: sku?.priceThb ?? product?.basePrice ?? 0,
      currency: product?.currency ?? 'THB',
      available,
      inStock: available > 0,
      active: Boolean(product && product.status === 'ACTIVE'),
      mediaId: pin.mediaId,
      x: pin.x,
      y: pin.y,
      sortOrder: pin.sortOrder,
    };
    const list = out.get(pin.postId) ?? [];
    list.push(dto);
    out.set(pin.postId, list);
  }
  return out;
}

export async function detachProductFromPost(input: {
  postId: string;
  productId: string;
  authorId: string;
}) {
  const post = await prisma.socialPost.findUnique({ where: { id: input.postId }, select: { authorId: true } });
  if (!post || post.authorId !== input.authorId) {
    throw new AppError('FORBIDDEN', 'ไม่มีสิทธิ์แก้ไขโพสต์นี้', 403);
  }
  await prisma.postProduct.deleteMany({ where: { postId: input.postId, productId: input.productId } });
  const remaining = await prisma.postProduct.count({ where: { postId: input.postId } });
  await prisma.socialPost.update({ where: { id: input.postId }, data: { productCount: remaining } });
  return { ok: true as const, remaining };
}
