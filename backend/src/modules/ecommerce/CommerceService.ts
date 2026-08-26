/**
 * Unified commerce — Product, SKU, shared warehouse stock, orders.
 * Cart never reserves. Paid orders reserve stock; packing commits (deducts) on-hand.
 */

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { getPaymentGateway } from './PspGateway';
import { notifySeller } from './ProductPromotionService';
import { quoteOrderGp, recordPaidOrderGp } from './GpLedgerService';
import {
  confirmOrder as confirmSettlement,
  getMerchantLedger,
  recordPaidOrderBooks,
  requestReturn as requestSettlementReturn,
  resolveReturn as resolveSettlementReturn,
} from './SettlementService';
import { holdEscrowOnPayment } from '../finance/services/EscrowService';
import { parseShippingJson, snapshotMergeKey, type ShippingSnapshot } from './shipping/addressMerge';
import { commitPackedOrder, reservePaidOrder } from './inventory/StockService';

export type StockRow = {
  variantId: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
  revision: number;
};

export type CatalogBundle = {
  product: Record<string, unknown>;
  variants: Array<Record<string, unknown>>;
  stock: StockRow[];
};

export type OrderLine = {
  variantId: string;
  warehouseId: string;
  qty: number;
  unitPrice: number;
  productId?: string;
  title?: string;
  sku?: string;
  label?: string;
  color?: string;
  variant?: string;
  image?: string;
};

export type OrderDto = {
  id: string;
  buyerId: string;
  merchantId: string | null;
  status: string;
  merchandiseThb: number;
  currency: string;
  lines: OrderLine[];
  gpBps: number | null;
  gpAmountThb: number;
  netToMerchantThb: number | null;
  pspRef: string | null;
  paidAt: string | null;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  shippingFeeThb: number;
  shippingStatus: string | null;
  courierEvent: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  settlementStatus: string;
  buyerConfirmedAt: string | null;
  sellerConfirmedAt: string | null;
  completedAt: string | null;
  returnStatus: string;
  releaseEligibleAt: string | null;
  payoutBatchId: string | null;
  shipping: ShippingSnapshot;
  addressMergeKey: string | null;
  shipmentGroupId: string | null;
  createdAt: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function availableOf(row: { onHand: number; reserved: number }) {
  return Math.max(0, row.onHand - row.reserved);
}

function toBundle(row: {
  id: string;
  merchantId: string;
  payloadJson: unknown;
  variants: Array<{
    id: string;
    payloadJson: unknown;
    stock: Array<{ skuId: string; warehouseId: string; onHand: number; reserved: number; revision: number }>;
  }>;
}): CatalogBundle {
  const product = { ...asRecord(row.payloadJson), id: row.id, ownerShopId: row.merchantId };
  const variants = row.variants.map((v) => ({ ...asRecord(v.payloadJson), id: v.id }));
  const stock: StockRow[] = row.variants.flatMap((v) =>
    v.stock.map((s) => ({
      variantId: v.id,
      warehouseId: s.warehouseId,
      onHand: s.onHand,
      reserved: s.reserved,
      revision: s.revision,
    })),
  );
  return { product, variants, stock };
}

export async function upsertCatalogBundle(
  input: CatalogBundle,
  owner?: { userId: string; shopId: string },
): Promise<CatalogBundle> {
  const product = asRecord(input.product);
  const id = String(product.id ?? '').trim();
  if (!id) throw new AppError('VALIDATION', 'product.id required', 400);
  const title = String(product.title ?? '').trim();
  if (!title) throw new AppError('VALIDATION', 'product.title required', 400);
  const merchantId = owner?.shopId ?? String(product.ownerShopId ?? product.shopName ?? 'shop').trim();
  const ownerUserId = owner?.userId?.trim();
  if (!ownerUserId) throw new AppError('OWNER_REQUIRED', 'authenticated product owner required', 401);
  const shopName = String(product.shopName ?? merchantId);
  const variants = Array.isArray(input.variants) ? input.variants : [];
  if (!variants.length) throw new AppError('VALIDATION', 'at least one SKU required', 400);

  const stockByVariant = new Map<string, StockRow[]>();
  for (const row of input.stock ?? []) {
    if (!row?.variantId || !row?.warehouseId) continue;
    const list = stockByVariant.get(row.variantId) ?? [];
    list.push(row);
    stockByVariant.set(row.variantId, list);
  }

  await prisma.$transaction(async (tx) => {
    const existingProduct = await tx.commerceProduct.findUnique({
      where: { id },
      select: { ownerUserId: true },
    });
    if (existingProduct && existingProduct.ownerUserId !== ownerUserId) {
      throw new AppError('PRODUCT_FORBIDDEN', 'product belongs to another account', 403);
    }
    await tx.commerceProduct.upsert({
      where: { id },
      create: {
        id,
        ownerUserId,
        merchantId,
        shopName,
        title,
        masterSku: String(product.masterSku ?? id),
        channel: String(product.channel ?? 'B2C'),
        basePrice: Number(product.basePrice ?? 0) || 0,
        currency: String(product.currency ?? 'THB'),
        status: 'ACTIVE',
        isPromoted: Boolean(product.isPromoted),
        payloadJson: product as Prisma.InputJsonValue,
      },
      update: {
        // Ownership is immutable. Never move a product between accounts.
        merchantId,
        shopName,
        title,
        masterSku: String(product.masterSku ?? id),
        channel: String(product.channel ?? 'B2C'),
        basePrice: Number(product.basePrice ?? 0) || 0,
        currency: String(product.currency ?? 'THB'),
        isPromoted: Boolean(product.isPromoted),
        payloadJson: product as Prisma.InputJsonValue,
        status: 'ACTIVE',
      },
    });

    const keepIds = new Set<string>();
    for (const raw of variants) {
      const variant = asRecord(raw);
      const variantId = String(variant.id ?? '').trim();
      if (!variantId) continue;
      const existingSku = await tx.commerceSku.findUnique({
        where: { id: variantId },
        select: { product: { select: { ownerUserId: true } } },
      });
      if (existingSku && existingSku.product.ownerUserId !== ownerUserId) {
        throw new AppError('SKU_FORBIDDEN', 'SKU belongs to another account', 403);
      }
      keepIds.add(variantId);
      await tx.commerceSku.upsert({
        where: { id: variantId },
        create: {
          id: variantId,
          productId: id,
          sku: String(variant.sku ?? variantId),
          label: String(variant.label ?? 'มาตรฐาน'),
          priceThb: Number(variant.price ?? 0) || 0,
          status: String(variant.status ?? 'active'),
          payloadJson: { ...variant, masterSkuId: id } as Prisma.InputJsonValue,
        },
        update: {
          productId: id,
          sku: String(variant.sku ?? variantId),
          label: String(variant.label ?? 'มาตรฐาน'),
          priceThb: Number(variant.price ?? 0) || 0,
          status: String(variant.status ?? 'active'),
          payloadJson: { ...variant, masterSkuId: id } as Prisma.InputJsonValue,
        },
      });

      const rows = stockByVariant.get(variantId) ?? [];
      for (const row of rows) {
        const existing = await tx.commerceStock.findUnique({
          where: { skuId_warehouseId: { skuId: variantId, warehouseId: row.warehouseId } },
        });
        const incomingOnHand = Math.max(0, Math.trunc(row.onHand ?? 0));
        const reserved = existing?.reserved ?? Math.max(0, Math.trunc(row.reserved ?? 0));
        await tx.commerceStock.upsert({
          where: { skuId_warehouseId: { skuId: variantId, warehouseId: row.warehouseId } },
          create: {
            skuId: variantId,
            warehouseId: row.warehouseId,
            onHand: incomingOnHand,
            reserved,
            revision: Math.max(1, Math.trunc(row.revision ?? 1)),
          },
          update: {
            onHand: Math.max(reserved, incomingOnHand),
            revision: { increment: 1 },
          },
        });
      }
    }

    const existing = await tx.commerceSku.findMany({ where: { productId: id }, select: { id: true } });
    const stale = existing.filter((row) => !keepIds.has(row.id)).map((row) => row.id);
    if (stale.length) {
      await tx.commerceSku.deleteMany({ where: { id: { in: stale } } });
    }
  });

  const saved = await getCatalogBundle(id);
  if (!saved) throw new AppError('INTERNAL', 'upsert failed', 500);
  return saved;
}

export async function syncCatalogBundles(
  bundles: CatalogBundle[],
  owner: { userId: string; shopId: string },
) {
  const out: CatalogBundle[] = [];
  for (const bundle of bundles) {
    out.push(await upsertCatalogBundle(bundle, owner));
  }
  return out;
}

export async function listCatalogBundles(opts?: {
  ownerUserId?: string;
  merchantId?: string;
  includeHidden?: boolean;
  limit?: number;
}) {
  const limit = Math.min(opts?.limit ?? 200, 500);
  const rows = await prisma.commerceProduct.findMany({
    where: {
      ...(opts?.ownerUserId ? { ownerUserId: opts.ownerUserId } : {}),
      ...(opts?.merchantId ? { merchantId: opts.merchantId } : {}),
      ...(opts?.includeHidden ? {} : { status: 'ACTIVE' }),
    },
    include: { variants: { include: { stock: true } } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return rows.map(toBundle);
}

export async function getCatalogBundle(id: string) {
  const row = await prisma.commerceProduct.findUnique({
    where: { id },
    include: { variants: { include: { stock: true } } },
  });
  return row ? toBundle(row) : null;
}

export async function deleteCatalogProduct(id: string, ownerUserId: string) {
  const result = await prisma.commerceProduct.updateMany({
    where: { id, ownerUserId },
    data: { status: 'HIDDEN' },
  });
  if (!result.count) throw new AppError('PRODUCT_NOT_FOUND', 'product not found or forbidden', 404);
  return { ok: true as const, id };
}

export async function applyStockSale(input: {
  variantId: string;
  warehouseId: string;
  qty: number;
  orderRef?: string;
}) {
  const qty = Math.trunc(input.qty);
  if (qty < 1) throw new AppError('VALIDATION', 'qty must be >= 1', 400);
  return prisma.$transaction(async (tx) => {
    const row = await tx.commerceStock.findUnique({
      where: { skuId_warehouseId: { skuId: input.variantId, warehouseId: input.warehouseId } },
    });
    if (!row) throw new AppError('NOT_FOUND', 'stock row not found', 404);
    const available = availableOf(row);
    if (qty > available) {
      throw new AppError('INSUFFICIENT', `stock ${available}, need ${qty}`, 409);
    }
    const next = await tx.commerceStock.update({
      where: { id: row.id },
      data: { onHand: row.onHand - qty, revision: { increment: 1 } },
    });
    return {
      ok: true as const,
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      onHand: next.onHand,
      reserved: next.reserved,
      revision: next.revision,
      available: availableOf(next),
      orderRef: input.orderRef,
    };
  });
}

export async function createOrder(input: {
  buyerId: string;
  lines: OrderLine[];
  shippingFeeThb?: number;
  shipping?: ShippingSnapshot;
  paymentMethod?: string;
  idempotencyKey?: string;
}) {
  const buyerId = input.buyerId.trim();
  if (!buyerId) throw new AppError('VALIDATION', 'buyerId required', 400);
  const lines = input.lines.filter((l) => l.qty > 0 && l.unitPrice >= 0);
  if (!lines.length) throw new AppError('VALIDATION', 'order lines required', 400);

  if (input.idempotencyKey) {
    const existing = await prisma.commerceOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return mapOrder(existing);
  }

  for (const line of lines) {
    const row = await prisma.commerceStock.findUnique({
      where: { skuId_warehouseId: { skuId: line.variantId, warehouseId: line.warehouseId } },
    });
    const available = row ? availableOf(row) : 0;
    if (!row || line.qty > available) {
      throw new AppError('INSUFFICIENT', `${line.title ?? line.sku ?? line.variantId} สต็อกไม่พอ`, 409);
    }
  }

  const merchandiseThb = lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
  const shippingFeeThb = Math.max(0, Math.round(input.shippingFeeThb ?? 0));
  const firstProductId = String(lines[0]?.productId ?? '');
  const product = firstProductId
    ? await prisma.commerceProduct.findUnique({
        where: { id: firstProductId },
        select: { merchantId: true },
      })
    : null;
  const merchantId = product?.merchantId ?? null;
  const shipping: ShippingSnapshot = {
    name: input.shipping?.name?.trim() ?? '',
    phone: input.shipping?.phone?.trim() ?? '',
    line1: input.shipping?.line1?.trim() ?? '',
    district: input.shipping?.district?.trim() || undefined,
    amphoe: input.shipping?.amphoe?.trim() || undefined,
    province: input.shipping?.province?.trim() || undefined,
    postcode: input.shipping?.postcode?.trim() || undefined,
    paymentMethod: (input.paymentMethod ?? input.shipping?.paymentMethod ?? '').trim() || undefined,
    codAmountThb:
      (input.paymentMethod ?? input.shipping?.paymentMethod) === 'cod'
        ? merchandiseThb + shippingFeeThb
        : input.shipping?.codAmountThb,
  };
  const addressKey = merchantId ? snapshotMergeKey(merchantId, shipping) : '';
  const row = await prisma.commerceOrder.create({
    data: {
      id: randomUUID(),
      buyerId,
      merchantId,
      status: 'PENDING_PAYMENT',
      merchandiseThb,
      shippingFeeThb,
      linesJson: lines as Prisma.InputJsonValue,
      shippingJson: shipping as Prisma.InputJsonValue,
      addressMergeKey: addressKey || null,
      idempotencyKey: input.idempotencyKey ?? `ord_${buyerId}_${Date.now()}`,
    },
  });
  return mapOrder(row);
}

export async function payOrder(input: {
  orderId: string;
  actor: string;
  idempotencyKey?: string;
  sourceToken?: string;
}) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  if (order.status === 'PAID') return mapOrder(order);
  if (order.status !== 'PENDING_PAYMENT') {
    throw new AppError('VALIDATION', `cannot pay order in ${order.status}`, 400);
  }

  const lines = (Array.isArray(order.linesJson) ? order.linesJson : []) as OrderLine[];
  const firstProductId = String(asRecord(lines[0] ?? {}).productId ?? '');
  const product = firstProductId
    ? await prisma.commerceProduct.findUnique({
        where: { id: firstProductId },
        select: { merchantId: true, channel: true },
      })
    : null;
  const merchantId = order.merchantId ?? product?.merchantId ?? undefined;
  const quote = await quoteOrderGp({
    amountThb: order.merchandiseThb,
    merchantId,
    channel: product?.channel,
  });

  const gateway = getPaymentGateway();
  const capture = await gateway.capture({
    orderId: order.id,
    amountThb: BigInt(order.merchandiseThb),
    currency: 'THB',
    buyerRef: order.buyerId,
    merchantRef: merchantId ?? String(asRecord(lines[0] ?? {}).productId ?? 'shop'),
    idempotencyKey: input.idempotencyKey ?? `pay_${order.id}`,
    description: `BoomMall order ${order.id} · GP ${quote.gpBps}bps`,
    sourceToken: input.sourceToken,
  });

  await prisma.$transaction(async (tx) => {
    await reservePaidOrder(
      { id: order.id, merchantId: merchantId ?? order.merchantId, linesJson: lines },
      tx,
    );
    await tx.commerceOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        merchantId: merchantId ?? null,
        pspRef: capture.pspRef,
        paidAt: new Date(),
        gpBps: quote.gpBps,
        gpAmountThb: Number(quote.gpAmountThb),
        netToMerchantThb: Number(quote.netToMerchantThb),
        settlementStatus: 'HELD',
        returnStatus: 'NONE',
      },
    });
  });

  try {
    await recordPaidOrderBooks({
      orderId: order.id,
      merchantId,
      merchandiseThb: order.merchandiseThb,
      gpAmountThb: Number(quote.gpAmountThb),
      netToMerchantThb: Number(quote.netToMerchantThb),
    });
  } catch {
    /* books best-effort after capture */
  }

  if (merchantId) {
    try {
      await holdEscrowOnPayment({
        orderId: order.id,
        storeId: merchantId,
        merchandiseThb: order.merchandiseThb,
        shippingFeeThb: order.shippingFeeThb,
      });
    } catch {
      /* wallet escrow best-effort — settleOrder is idempotent */
    }
  }

  try {
    await recordPaidOrderGp({
      orderId: order.id,
      actor: input.actor,
      merchantId,
      channel: product?.channel,
      quote,
      pspRef: capture.pspRef,
    });
  } catch {
    /* audit best-effort */
  }

  if (merchantId) {
    try {
      const net = Number(quote.netToMerchantThb);
      const gp = Number(quote.gpAmountThb);
      await notifySeller({
        userId: merchantId,
        title: 'มีออเดอร์ใหม่',
        body:
          gp > 0
            ? `ลูกค้าชำระ ${order.merchandiseThb.toLocaleString('th-TH')} บาท · หัก GP ${gp.toLocaleString('th-TH')} บาท · ร้านได้รับ ${net.toLocaleString('th-TH')} บาท`
            : `ชำระแล้ว ${order.merchandiseThb.toLocaleString('th-TH')} บาท`,
        kind: 'order_paid',
        refId: order.id,
      });
    } catch {
      /* inbox best-effort */
    }
  }

  const paid = await prisma.commerceOrder.findUnique({ where: { id: order.id } });
  return mapOrder(paid!);
}

export async function listOrders(opts?: {
  buyerId?: string;
  merchantId?: string;
  status?: string;
  limit?: number;
}) {
  const rows = await prisma.commerceOrder.findMany({
    where: {
      ...(opts?.buyerId ? { buyerId: opts.buyerId } : {}),
      ...(opts?.merchantId ? { merchantId: opts.merchantId } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts?.limit ?? 80, 200),
  });
  return rows.map(mapOrder);
}

export async function listSellers() {
  const rows = await prisma.commerceProduct.groupBy({
    by: ['merchantId', 'shopName'],
    _count: { id: true },
    where: { status: 'ACTIVE' },
  });
  return rows.map((row) => ({
    merchantId: row.merchantId,
    shopName: row.shopName,
    productCount: row._count.id,
  }));
}

function mapOrder(row: {
  id: string;
  buyerId: string;
  merchantId?: string | null;
  status: string;
  merchandiseThb: number;
  currency: string;
  linesJson: unknown;
  gpBps?: number | null;
  gpAmountThb?: number | null;
  netToMerchantThb?: number | null;
  pspRef: string | null;
  paidAt: Date | null;
  trackingNumber?: string | null;
  shippingCarrier?: string | null;
  shippingFeeThb?: number;
  shippingStatus?: string | null;
  courierEvent?: string | null;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  settlementStatus?: string | null;
  buyerConfirmedAt?: Date | null;
  sellerConfirmedAt?: Date | null;
  completedAt?: Date | null;
  returnStatus?: string | null;
  releaseEligibleAt?: Date | null;
  payoutBatchId?: string | null;
  shippingJson?: unknown;
  addressMergeKey?: string | null;
  shipmentGroupId?: string | null;
  createdAt: Date;
}): OrderDto {
  return {
    id: row.id,
    buyerId: row.buyerId,
    merchantId: row.merchantId ?? null,
    status: row.status,
    merchandiseThb: row.merchandiseThb,
    shippingFeeThb: row.shippingFeeThb ?? 0,
    currency: row.currency,
    lines: (Array.isArray(row.linesJson) ? row.linesJson : []) as OrderLine[],
    gpBps: row.gpBps ?? null,
    gpAmountThb: row.gpAmountThb ?? 0,
    netToMerchantThb: row.netToMerchantThb ?? null,
    pspRef: row.pspRef,
    paidAt: row.paidAt?.toISOString() ?? null,
    trackingNumber: row.trackingNumber ?? null,
    shippingCarrier: row.shippingCarrier ?? null,
    shippingStatus: row.shippingStatus ?? null,
    courierEvent: row.courierEvent ?? null,
    shippedAt: row.shippedAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    settlementStatus: row.settlementStatus ?? 'HELD',
    buyerConfirmedAt: row.buyerConfirmedAt?.toISOString() ?? null,
    sellerConfirmedAt: row.sellerConfirmedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    returnStatus: row.returnStatus ?? 'NONE',
    releaseEligibleAt: row.releaseEligibleAt?.toISOString() ?? null,
    payoutBatchId: row.payoutBatchId ?? null,
    shipping: parseShippingJson(row.shippingJson),
    addressMergeKey: row.addressMergeKey ?? null,
    shipmentGroupId: row.shipmentGroupId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateOrderShipping(input: {
  orderId: string;
  actor: string;
  trackingNumber?: string;
  shippingCarrier?: string;
  shippingStatus?: string;
}) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  const status = input.shippingStatus?.trim().toUpperCase();
  const allowed = new Set(['PENDING', 'PACKED', 'SHIPPED', 'DELIVERED']);
  if (status && !allowed.has(status)) {
    throw new AppError('VALIDATION', 'shippingStatus must be PENDING | PACKED | SHIPPED | DELIVERED', 400);
  }
  const shippedAt =
    status === 'SHIPPED' || status === 'DELIVERED' ? order.shippedAt ?? new Date() : order.shippedAt;
  const deliveredAt = status === 'DELIVERED' ? order.deliveredAt ?? new Date() : order.deliveredAt;
  const orderStatus =
    status === 'SHIPPED' && (order.status === 'PAID' || order.status === 'SHIPPED')
      ? 'SHIPPED'
      : status === 'DELIVERED' && order.status !== 'COMPLETED' && order.status !== 'REFUNDED'
        ? 'DELIVERED'
        : order.status;
  const nextShipping = status || order.shippingStatus || 'PACKED';
  if (nextShipping === 'PACKED') {
    await commitPackedOrder(order);
  }
  const row = await prisma.commerceOrder.update({
    where: { id: input.orderId },
    data: {
      trackingNumber: input.trackingNumber?.trim() || order.trackingNumber,
      shippingCarrier: input.shippingCarrier?.trim() || order.shippingCarrier,
      shippingStatus: nextShipping,
      shippedAt,
      deliveredAt,
      status: orderStatus,
    },
  });
  return mapOrder(row);
}

export async function confirmPaidOrder(input: {
  orderId: string;
  actor: string;
  role: 'buyer' | 'seller' | 'admin';
}) {
  return mapOrder(await confirmSettlement(input));
}

export async function requestOrderReturn(input: { orderId: string; actor: string }) {
  return mapOrder(await requestSettlementReturn(input));
}

export async function resolveOrderReturn(input: {
  orderId: string;
  actor: string;
  decision: 'accept' | 'reject';
}) {
  return mapOrder(await resolveSettlementReturn(input));
}

export { getMerchantLedger };

export function commerceOpsStatus() {
  return {
    domain: 'commerce-core',
    product: true,
    sku: true,
    sharedWarehouse: true,
    order: true,
    cartReservesStock: false,
    reserveOn: 'paid_order_via_psp',
    deductOn: 'packed_label_or_mark_packed',
    lowStockAlert: true,
    courierWebhook: true,
    gpOnPaid: true,
    settlement: 'hold_then_weekly_payout',
    autoMergeSameAddressLabels: true,
    thermalLabel: '100x150mm',
  };
}
