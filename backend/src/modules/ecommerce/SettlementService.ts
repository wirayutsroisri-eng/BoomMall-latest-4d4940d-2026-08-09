/**
 * Marketplace THB settlement and platform accounting books.
 *
 * Buyer pays PSP → platform cash + GP revenue + merchant held.
 * After delivered + buyer/seller OK + no return → holdDays (default 7).
 * Weekly batch queues seller payout. Does not claim a bank transfer succeeded.
 */

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { getGpPolicy } from './GpLedgerService';
import { releaseSettlement, reverseSettlement } from '../finance/FinanceService';

export const SETTLEMENT = {
  HELD: 'HELD',
  RELEASE_ELIGIBLE: 'RELEASE_ELIGIBLE',
  IN_PAYOUT: 'IN_PAYOUT',
  PAID_OUT: 'PAID_OUT',
  REFUNDED: 'REFUNDED',
  DISPUTED: 'DISPUTED',
} as const;

export const RETURN = {
  NONE: 'NONE',
  REQUESTED: 'REQUESTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
} as const;

export const THB_ACCOUNT = {
  PLATFORM_CASH: 'PLATFORM_CASH',
  PLATFORM_GP: 'PLATFORM_GP',
  MERCHANT_HELD: 'MERCHANT_HELD',
  MERCHANT_PAYABLE: 'MERCHANT_PAYABLE',
  MERCHANT_QUEUED: 'MERCHANT_QUEUED',
  BUYER_REFUND: 'BUYER_REFUND',
} as const;

type Tx = Prisma.TransactionClient;

type LedgerLine = {
  account: string;
  side: 'DEBIT' | 'CREDIT';
  amountThb: number;
  merchantId?: string | null;
  orderId?: string | null;
  batchId?: string | null;
  memo: string;
};

async function writeLines(tx: Tx, lines: LedgerLine[]) {
  for (const line of lines) {
    if (line.amountThb <= 0) continue;
    await tx.platformThbLedger.create({
      data: {
        id: randomUUID(),
        account: line.account,
        side: line.side,
        amountThb: line.amountThb,
        merchantId: line.merchantId ?? null,
        orderId: line.orderId ?? null,
        batchId: line.batchId ?? null,
        memo: line.memo,
      },
    });
  }
}

async function pushAudit(input: {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  amountThb?: number;
  gpAmountThb?: number;
  detail?: Record<string, unknown>;
}) {
  try {
    await prisma.marketplaceAuditLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        amountThb: input.amountThb != null ? BigInt(input.amountThb) : null,
        gpAmountThb: input.gpAmountThb != null ? BigInt(input.gpAmountThb) : null,
        detailJson: (input.detail ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch {
    /* audit best-effort */
  }
}

export async function recordPaidOrderBooks(input: {
  orderId: string;
  merchantId?: string | null;
  merchandiseThb: number;
  gpAmountThb: number;
  netToMerchantThb: number;
}) {
  const gmv = Math.max(0, Math.round(input.merchandiseThb));
  const gp = Math.max(0, Math.round(input.gpAmountThb));
  const net = Math.max(0, Math.round(input.netToMerchantThb));
  if (gmv <= 0) return;
  await prisma.$transaction((tx) =>
    writeLines(tx, [
      {
        account: THB_ACCOUNT.PLATFORM_CASH,
        side: 'DEBIT',
        amountThb: gmv,
        orderId: input.orderId,
        merchantId: input.merchantId,
        memo: 'buyer_psp_capture',
      },
      {
        account: THB_ACCOUNT.MERCHANT_HELD,
        side: 'CREDIT',
        amountThb: net,
        orderId: input.orderId,
        merchantId: input.merchantId,
        memo: 'seller_net_held',
      },
      {
        account: THB_ACCOUNT.PLATFORM_GP,
        side: 'CREDIT',
        amountThb: gp,
        orderId: input.orderId,
        merchantId: input.merchantId,
        memo: 'platform_gp',
      },
    ]),
  );
}

function canComplete(row: {
  status: string;
  shippingStatus: string | null;
  buyerConfirmedAt: Date | null;
  sellerConfirmedAt: Date | null;
  returnStatus: string;
  completedAt: Date | null;
}) {
  return (
    row.status === 'PAID' &&
    row.shippingStatus === 'DELIVERED' &&
    Boolean(row.buyerConfirmedAt) &&
    Boolean(row.sellerConfirmedAt) &&
    (row.returnStatus === RETURN.NONE || row.returnStatus === RETURN.REJECTED) &&
    !row.completedAt
  );
}

export async function confirmOrder(input: {
  orderId: string;
  actor: string;
  role: 'buyer' | 'seller' | 'admin';
}) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  if (order.status !== 'PAID') {
    throw new AppError('VALIDATION', 'confirm only after the buyer paid the platform', 400);
  }
  if (order.shippingStatus !== 'DELIVERED') {
    throw new AppError('VALIDATION', 'confirm only after the order is delivered', 400);
  }
  if (order.returnStatus === RETURN.REQUESTED || order.returnStatus === RETURN.ACCEPTED) {
    throw new AppError('VALIDATION', 'order has an open return', 409);
  }
  if (input.role === 'buyer' && input.actor !== 'admin' && input.actor !== order.buyerId) {
    throw new AppError('FORBIDDEN', 'only the buyer can confirm receipt', 403);
  }
  if (
    input.role === 'seller' &&
    input.actor !== 'admin' &&
    order.merchantId &&
    input.actor !== order.merchantId
  ) {
    throw new AppError('FORBIDDEN', 'only the seller can confirm fulfillment', 403);
  }

  const now = new Date();
  const buyerConfirmedAt =
    input.role === 'buyer' || input.role === 'admin' ? order.buyerConfirmedAt ?? now : order.buyerConfirmedAt;
  const sellerConfirmedAt =
    input.role === 'seller' || input.role === 'admin' ? order.sellerConfirmedAt ?? now : order.sellerConfirmedAt;

  const policy = await getGpPolicy();
  const holdDays = Math.max(0, policy.holdDaysAfterComplete);
  const next = {
    ...order,
    buyerConfirmedAt,
    sellerConfirmedAt,
  };
  const complete = canComplete(next);
  const releaseEligibleAt = complete
    ? new Date(now.getTime() + holdDays * 24 * 3600_000)
    : order.releaseEligibleAt;

  const row = await prisma.commerceOrder.update({
    where: { id: order.id },
    data: {
      buyerConfirmedAt,
      sellerConfirmedAt,
      completedAt: complete ? now : order.completedAt,
      releaseEligibleAt,
      settlementStatus: order.settlementStatus || SETTLEMENT.HELD,
    },
  });

  await pushAudit({
    actor: input.actor,
    action: complete ? 'order.complete' : 'order.confirm',
    entityType: 'order',
    entityId: order.id,
    amountThb: row.netToMerchantThb ?? 0,
    detail: { role: input.role, holdDays, releaseEligibleAt },
  });

  return row;
}

export async function requestReturn(input: { orderId: string; actor: string }) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  if (order.status !== 'PAID') throw new AppError('VALIDATION', 'return only on paid orders', 400);
  if (order.settlementStatus === SETTLEMENT.IN_PAYOUT || order.settlementStatus === SETTLEMENT.PAID_OUT) {
    throw new AppError('VALIDATION', 'seller payout already queued — open a dispute', 409);
  }
  if (order.returnStatus === RETURN.REFUNDED) {
    throw new AppError('VALIDATION', 'already refunded', 409);
  }
  const row = await prisma.commerceOrder.update({
    where: { id: order.id },
    data: {
      returnStatus: RETURN.REQUESTED,
      returnRequestedAt: order.returnRequestedAt ?? new Date(),
      completedAt: null,
      releaseEligibleAt: null,
      settlementStatus: SETTLEMENT.DISPUTED,
    },
  });
  await pushAudit({
    actor: input.actor,
    action: 'order.return.request',
    entityType: 'order',
    entityId: order.id,
    amountThb: order.merchandiseThb,
  });
  return row;
}

export async function resolveReturn(input: {
  orderId: string;
  actor: string;
  decision: 'accept' | 'reject';
}) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: input.orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  if (order.returnStatus !== RETURN.REQUESTED) {
    throw new AppError('VALIDATION', 'no open return to resolve', 400);
  }

  if (input.decision === 'reject') {
    const row = await prisma.commerceOrder.update({
      where: { id: order.id },
      data: {
        returnStatus: RETURN.REJECTED,
        settlementStatus: SETTLEMENT.HELD,
      },
    });
    await pushAudit({
      actor: input.actor,
      action: 'order.return.reject',
      entityType: 'order',
      entityId: order.id,
    });
    return row;
  }

  const gmv = order.merchandiseThb;
  const gp = order.gpAmountThb;
  const net = order.netToMerchantThb ?? Math.max(0, gmv - gp);
  const held = !order.completedAt || order.settlementStatus === SETTLEMENT.HELD;

  await prisma.$transaction(async (tx) => {
    await writeLines(tx, [
      {
        account: held ? THB_ACCOUNT.MERCHANT_HELD : THB_ACCOUNT.MERCHANT_PAYABLE,
        side: 'DEBIT',
        amountThb: net,
        orderId: order.id,
        merchantId: order.merchantId,
        memo: 'return_reverse_seller',
      },
      {
        account: THB_ACCOUNT.PLATFORM_GP,
        side: 'DEBIT',
        amountThb: gp,
        orderId: order.id,
        merchantId: order.merchantId,
        memo: 'return_reverse_gp',
      },
      {
        account: THB_ACCOUNT.BUYER_REFUND,
        side: 'CREDIT',
        amountThb: gmv,
        orderId: order.id,
        merchantId: order.merchantId,
        memo: 'buyer_refund_liability',
      },
    ]);
    await tx.commerceOrder.update({
      where: { id: order.id },
      data: {
        returnStatus: RETURN.REFUNDED,
        settlementStatus: SETTLEMENT.REFUNDED,
        completedAt: null,
        releaseEligibleAt: null,
      },
    });
  });

  await reverseSettlement(order.id).catch(() => undefined);

  await pushAudit({
    actor: input.actor,
    action: 'order.return.accept',
    entityType: 'order',
    entityId: order.id,
    amountThb: gmv,
    gpAmountThb: gp,
    detail: { note: 'books a refund liability — PSP refund is a separate step' },
  });

  return prisma.commerceOrder.findUniqueOrThrow({ where: { id: order.id } });
}

export async function releaseDueOrders(now = new Date()) {
  const due = await prisma.commerceOrder.findMany({
    where: {
      status: 'PAID',
      settlementStatus: SETTLEMENT.HELD,
      completedAt: { not: null },
      releaseEligibleAt: { lte: now },
      returnStatus: { in: [RETURN.NONE, RETURN.REJECTED] },
    },
    take: 400,
  });

  for (const order of due) {
    const net = order.netToMerchantThb ?? 0;
    await prisma.$transaction(async (tx) => {
      await writeLines(tx, [
        {
          account: THB_ACCOUNT.MERCHANT_HELD,
          side: 'DEBIT',
          amountThb: net,
          orderId: order.id,
          merchantId: order.merchantId,
          memo: 'release_from_hold',
        },
        {
          account: THB_ACCOUNT.MERCHANT_PAYABLE,
          side: 'CREDIT',
          amountThb: net,
          orderId: order.id,
          merchantId: order.merchantId,
          memo: 'seller_payable',
        },
      ]);
      await tx.commerceOrder.update({
        where: { id: order.id },
        data: { settlementStatus: SETTLEMENT.RELEASE_ELIGIBLE },
      });
    });
    await releaseSettlement(order.id).catch(() => undefined);
  }

  return { released: due.length };
}

function nextMonday(from: Date) {
  const d = new Date(from);
  const day = d.getDay();
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + add);
  d.setHours(9, 0, 0, 0);
  return d;
}

export async function createWeeklyPayoutBatch(input: { actor: string }) {
  await releaseDueOrders();
  const eligible = await prisma.commerceOrder.findMany({
    where: { settlementStatus: SETTLEMENT.RELEASE_ELIGIBLE, status: 'PAID' },
    take: 800,
  });
  if (!eligible.length) {
    throw new AppError('VALIDATION', 'no released orders ready for the weekly payout', 400);
  }

  const merchants = new Set(eligible.map((o) => o.merchantId).filter(Boolean));
  const totalThb = eligible.reduce((n, o) => n + (o.netToMerchantThb ?? 0), 0);
  const policy = await getGpPolicy();
  const scheduledFor = nextMonday(new Date());
  const batchId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await tx.payoutBatch.create({
      data: {
        id: batchId,
        status: 'QUEUED',
        scheduledFor,
        totalThb,
        orderCount: eligible.length,
        merchantCount: merchants.size,
        runBy: input.actor,
        note: `cycle ${policy.payoutCycleDays}d · queued only — PSP transfer not claimed`,
      },
    });
    for (const order of eligible) {
      const net = order.netToMerchantThb ?? 0;
      await writeLines(tx, [
        {
          account: THB_ACCOUNT.MERCHANT_PAYABLE,
          side: 'DEBIT',
          amountThb: net,
          orderId: order.id,
          merchantId: order.merchantId,
          batchId,
          memo: 'payout_batch_queue',
        },
        {
          account: THB_ACCOUNT.MERCHANT_QUEUED,
          side: 'CREDIT',
          amountThb: net,
          orderId: order.id,
          merchantId: order.merchantId,
          batchId,
          memo: 'awaiting_psp_payout',
        },
      ]);
      await tx.commerceOrder.update({
        where: { id: order.id },
        data: { settlementStatus: SETTLEMENT.IN_PAYOUT, payoutBatchId: batchId },
      });
    }
  });

  await pushAudit({
    actor: input.actor,
    action: 'payout.batch.queue',
    entityType: 'payout_batch',
    entityId: batchId,
    amountThb: totalThb,
    detail: { orderCount: eligible.length, merchantCount: merchants.size, scheduledFor },
  });

  return prisma.payoutBatch.findUniqueOrThrow({ where: { id: batchId } });
}

export async function listPayoutBatches(limit = 20) {
  return prisma.payoutBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 50),
  });
}

function signedBalance(rows: Array<{ account: string; side: string; amountThb: number }>, account: string) {
  let debit = 0;
  let credit = 0;
  for (const row of rows) {
    if (row.account !== account) continue;
    if (row.side === 'DEBIT') debit += row.amountThb;
    else credit += row.amountThb;
  }
  return { debit, credit, net: debit - credit };
}

export async function getPlatformBooks() {
  await releaseDueOrders().catch(() => undefined);
  const [lines, settlementGroups, batches] = await Promise.all([
    prisma.platformThbLedger.findMany({
      select: { account: true, side: true, amountThb: true },
    }),
    prisma.commerceOrder.groupBy({
      by: ['settlementStatus'],
      where: { status: 'PAID' },
      _sum: { merchandiseThb: true, gpAmountThb: true, netToMerchantThb: true },
      _count: true,
    }),
    listPayoutBatches(8),
  ]);

  const cash = signedBalance(lines, THB_ACCOUNT.PLATFORM_CASH);
  const gp = signedBalance(lines, THB_ACCOUNT.PLATFORM_GP);
  const held = signedBalance(lines, THB_ACCOUNT.MERCHANT_HELD);
  const payable = signedBalance(lines, THB_ACCOUNT.MERCHANT_PAYABLE);
  const queued = signedBalance(lines, THB_ACCOUNT.MERCHANT_QUEUED);
  const refund = signedBalance(lines, THB_ACCOUNT.BUYER_REFUND);

  return {
    currency: 'THB',
    cashThb: cash.net,
    gpRevenueThb: gp.credit - gp.debit,
    merchantHeldThb: held.credit - held.debit,
    merchantPayableThb: payable.credit - payable.debit,
    merchantQueuedThb: queued.credit - queued.debit,
    buyerRefundLiabilityThb: refund.credit - refund.debit,
    settlement: settlementGroups.map((g) => ({
      status: g.settlementStatus,
      count: g._count,
      gmvThb: g._sum.merchandiseThb ?? 0,
      gpThb: g._sum.gpAmountThb ?? 0,
      netThb: g._sum.netToMerchantThb ?? 0,
    })),
    batches: batches.map((b) => ({
      id: b.id,
      status: b.status,
      scheduledFor: b.scheduledFor.toISOString(),
      totalThb: b.totalThb,
      orderCount: b.orderCount,
      merchantCount: b.merchantCount,
      runBy: b.runBy,
      note: b.note,
      createdAt: b.createdAt.toISOString(),
    })),
  };
}

export async function getMerchantLedger(merchantId: string) {
  await releaseDueOrders().catch(() => undefined);
  const orders = await prisma.commerceOrder.findMany({
    where: { merchantId, status: 'PAID' },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  const held = orders
    .filter((o) => o.settlementStatus === SETTLEMENT.HELD)
    .reduce((n, o) => n + (o.netToMerchantThb ?? 0), 0);
  const payable = orders
    .filter((o) => o.settlementStatus === SETTLEMENT.RELEASE_ELIGIBLE)
    .reduce((n, o) => n + (o.netToMerchantThb ?? 0), 0);
  const queued = orders
    .filter((o) => o.settlementStatus === SETTLEMENT.IN_PAYOUT)
    .reduce((n, o) => n + (o.netToMerchantThb ?? 0), 0);
  const paidOut = orders
    .filter((o) => o.settlementStatus === SETTLEMENT.PAID_OUT)
    .reduce((n, o) => n + (o.netToMerchantThb ?? 0), 0);
  const nextRelease = orders
    .filter((o) => o.settlementStatus === SETTLEMENT.HELD && o.releaseEligibleAt)
    .map((o) => o.releaseEligibleAt!)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    merchantId,
    heldThb: held,
    payableThb: payable,
    queuedThb: queued,
    paidOutThb: paidOut,
    nextReleaseAt: nextRelease?.toISOString() ?? null,
    orders: orders.map((o) => ({
      id: o.id,
      merchandiseThb: o.merchandiseThb,
      gpAmountThb: o.gpAmountThb,
      netToMerchantThb: o.netToMerchantThb,
      shippingStatus: o.shippingStatus,
      settlementStatus: o.settlementStatus,
      returnStatus: o.returnStatus,
      completedAt: o.completedAt?.toISOString() ?? null,
      releaseEligibleAt: o.releaseEligibleAt?.toISOString() ?? null,
      paidAt: o.paidAt?.toISOString() ?? null,
    })),
  };
}
