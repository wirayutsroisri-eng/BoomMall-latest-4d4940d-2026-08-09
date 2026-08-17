/**
 * Inventory engine: reserve on paid, deduct on packed, restore on cancel/return.
 * Ledger rows make every mutation idempotent per order × SKU × warehouse.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { notifySeller } from '../ProductPromotionService';
import {
  applyCommitSale,
  applyRelease,
  applyReserve,
  applyReturn,
  availableOf,
  DEFAULT_LOW_STOCK_THRESHOLD,
  stockStatusOf,
} from './stockMath';

type Db = Prisma.TransactionClient | typeof prisma;

export type StockLine = {
  variantId: string;
  warehouseId: string;
  qty: number;
  title?: string;
  sku?: string;
};

export type StockAction = 'reserve' | 'commit' | 'release' | 'return';

const LEDGER_TYPE: Record<StockAction, string> = {
  reserve: 'ORDER_RESERVE',
  commit: 'SALE',
  release: 'ORDER_CANCEL',
  return: 'RETURN',
};

function asLines(value: unknown): StockLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      return {
        variantId: String(row.variantId ?? '').trim(),
        warehouseId: String(row.warehouseId ?? 'WH-CTI-MAIN').trim() || 'WH-CTI-MAIN',
        qty: Math.max(0, Math.trunc(Number(row.qty ?? 0))),
        title: typeof row.title === 'string' ? row.title : undefined,
        sku: typeof row.sku === 'string' ? row.sku : undefined,
      };
    })
    .filter((line) => line.variantId && line.qty > 0);
}

function ledgerKey(orderId: string, type: string, skuId: string, warehouseId: string) {
  return `${orderId}:${type}:${skuId}:${warehouseId}`;
}

async function hasLedger(db: Db, key: string) {
  const row = await db.commerceStockLedger.findUnique({ where: { idempotencyKey: key } });
  return Boolean(row);
}

async function writeLedger(
  db: Db,
  input: {
    skuId: string;
    warehouseId: string;
    type: string;
    qty: number;
    onHandAfter: number;
    reservedAfter: number;
    orderId: string;
    reason?: string;
  },
) {
  await db.commerceStockLedger.create({
    data: {
      skuId: input.skuId,
      warehouseId: input.warehouseId,
      type: input.type,
      qty: input.qty,
      onHandAfter: input.onHandAfter,
      reservedAfter: input.reservedAfter,
      availableAfter: availableOf({ onHand: input.onHandAfter, reserved: input.reservedAfter }),
      orderId: input.orderId,
      reason: input.reason,
      idempotencyKey: ledgerKey(input.orderId, input.type, input.skuId, input.warehouseId),
    },
  });
}

async function mutateLine(db: Db, action: StockAction, orderId: string, line: StockLine) {
  const type = LEDGER_TYPE[action];
  if (await hasLedger(db, ledgerKey(orderId, type, line.variantId, line.warehouseId))) {
    return { skipped: true as const };
  }

  const reservedKey = ledgerKey(orderId, 'ORDER_RESERVE', line.variantId, line.warehouseId);
  const saleKey = ledgerKey(orderId, 'SALE', line.variantId, line.warehouseId);
  const alreadyReserved = await hasLedger(db, reservedKey);
  const alreadySold = await hasLedger(db, saleKey);

  if (action === 'commit' && alreadySold) return { skipped: true as const };
  if (action === 'commit' && !alreadyReserved) {
    // Legacy pay-time deduct: on-hand already gone, reserved is 0.
    return { skipped: true as const };
  }
  if (action === 'release' && alreadySold) {
    return mutateLine(db, 'return', orderId, line);
  }
  if (action === 'release' && !alreadyReserved) return { skipped: true as const };
  if (action === 'return' && !alreadySold && alreadyReserved) {
    return mutateLine(db, 'release', orderId, line);
  }
  if (action === 'return' && !alreadySold) return { skipped: true as const };

  const row = await db.commerceStock.findUnique({
    where: { skuId_warehouseId: { skuId: line.variantId, warehouseId: line.warehouseId } },
  });
  if (!row) throw new AppError('NOT_FOUND', `${line.title ?? line.sku ?? line.variantId} ไม่มีแถวสต็อก`, 404);

  const math =
    action === 'reserve'
      ? applyReserve(row, line.qty)
      : action === 'commit'
        ? applyCommitSale(row, line.qty)
        : action === 'release'
          ? applyRelease(row, line.qty)
          : applyReturn(row, line.qty);
  if (!math.ok) {
    throw new AppError(
      math.reason === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'VALIDATION',
      math.reason === 'INSUFFICIENT'
        ? `${line.title ?? line.sku ?? line.variantId} สต็อกไม่พอ`
        : 'invalid stock qty',
      math.reason === 'INSUFFICIENT' ? 409 : 400,
    );
  }

  const next = await db.commerceStock.update({
    where: { id: row.id },
    data: { onHand: math.next.onHand, reserved: math.next.reserved, revision: { increment: 1 } },
  });
  await writeLedger(db, {
    skuId: line.variantId,
    warehouseId: line.warehouseId,
    type,
    qty: line.qty,
    onHandAfter: next.onHand,
    reservedAfter: next.reserved,
    orderId,
    reason: action,
  });
  return { skipped: false as const, next, skuId: line.variantId, title: line.title, sku: line.sku };
}

async function maybeAlertLowStock(input: {
  merchantId?: string | null;
  skuId: string;
  title?: string;
  sku?: string;
  onHand: number;
  reserved: number;
}) {
  if (!input.merchantId) return;
  const sku = await prisma.commerceSku.findUnique({
    where: { id: input.skuId },
    select: { sku: true, label: true, payloadJson: true, product: { select: { title: true, merchantId: true } } },
  });
  const payload = sku?.payloadJson && typeof sku.payloadJson === 'object' ? (sku.payloadJson as Record<string, unknown>) : {};
  const threshold = Math.max(0, Math.trunc(Number(payload.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD)));
  const available = availableOf({ onHand: input.onHand, reserved: input.reserved });
  const status = stockStatusOf(available, threshold || DEFAULT_LOW_STOCK_THRESHOLD);
  if (status === 'ready') return;

  const since = new Date(Date.now() - 12 * 3600_000);
  const recent = await prisma.sellerNotification.findFirst({
    where: {
      userId: input.merchantId,
      kind: 'low_stock',
      refId: input.skuId,
      createdAt: { gte: since },
    },
  });
  if (recent) return;

  const name = input.title ?? sku?.product.title ?? input.sku ?? sku?.sku ?? 'สินค้า';
  const code = input.sku ?? sku?.sku ?? '';
  await notifySeller({
    userId: input.merchantId,
    title: status === 'out' ? 'สินค้าหมดสต็อก' : 'สินค้าใกล้หมดสต็อก',
    body: status === 'out'
      ? `${name}${code ? ` · ${code}` : ''} เหลือ 0 ชิ้น — เติมของก่อนรับออเดอร์ใหม่`
      : `${name}${code ? ` · ${code}` : ''} เหลือขายได้ ${available} ชิ้น (เกณฑ์ ${threshold || DEFAULT_LOW_STOCK_THRESHOLD})`,
    kind: 'low_stock',
    refId: input.skuId,
  });
}

export async function applyOrderStock(
  action: StockAction,
  order: { id: string; merchantId?: string | null; linesJson: unknown },
  tx?: Prisma.TransactionClient,
) {
  const lines = asLines(order.linesJson);
  if (!lines.length) return { ok: true as const, mutated: 0 };
  const run = async (db: Db) => {
    let mutated = 0;
    const alerts: Array<{ skuId: string; title?: string; sku?: string; onHand: number; reserved: number }> = [];
    for (const line of lines) {
      const result = await mutateLine(db, action, order.id, line);
      if (!result.skipped && result.next) {
        mutated += 1;
        alerts.push({
          skuId: result.skuId,
          title: result.title,
          sku: result.sku,
          onHand: result.next.onHand,
          reserved: result.next.reserved,
        });
      }
    }
    return { mutated, alerts };
  };

  const { mutated, alerts } = tx ? await run(tx) : await prisma.$transaction((inner) => run(inner));
  if (action === 'reserve' || action === 'commit') {
    for (const alert of alerts) {
      try {
        await maybeAlertLowStock({ merchantId: order.merchantId, ...alert });
      } catch {
        /* inbox best-effort */
      }
    }
  }
  return { ok: true as const, mutated };
}

export async function reservePaidOrder(
  order: { id: string; merchantId?: string | null; linesJson: unknown },
  tx?: Prisma.TransactionClient,
) {
  return applyOrderStock('reserve', order, tx);
}

export async function commitPackedOrder(
  order: { id: string; merchantId?: string | null; linesJson: unknown },
  tx?: Prisma.TransactionClient,
) {
  return applyOrderStock('commit', order, tx);
}

export async function releaseCancelledOrder(
  order: { id: string; merchantId?: string | null; linesJson: unknown },
  tx?: Prisma.TransactionClient,
) {
  return applyOrderStock('release', order, tx);
}

export async function restoreReturnedOrder(
  order: { id: string; merchantId?: string | null; linesJson: unknown },
  tx?: Prisma.TransactionClient,
) {
  return applyOrderStock('return', order, tx);
}

export async function commitPackedOrderIds(orderIds: string[], tx?: Prisma.TransactionClient) {
  if (!orderIds.length) return;
  const run = async (db: Db) => {
    const rows = await db.commerceOrder.findMany({ where: { id: { in: orderIds } } });
    for (const row of rows) {
      await commitPackedOrder(row, db);
    }
  };
  if (tx) {
    await run(tx);
    return;
  }
  await prisma.$transaction((inner) => run(inner));
}
