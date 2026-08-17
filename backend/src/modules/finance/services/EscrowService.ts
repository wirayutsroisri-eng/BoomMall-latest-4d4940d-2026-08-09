/**
 * Marketplace Escrow — เงินลูกค้าเข้าแพลตฟอร์ม พักไว้ แล้วปล่อยให้ร้าน
 * ปล่อยเมื่อผู้ซื้อกดรับ หรือครบ autoCompleteDays หลัง DELIVERED และไม่มี dispute
 */

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { getPaymentGateway } from '../../ecommerce/PspGateway';
import { quoteEscrow, toSatang, toThb } from '../domain/escrowMath';
import { assertBankCoolingOff, assertWithdrawPin, bankCoolingRemainingMs, remainingLockMs } from './PaymentPinService';
import { getPlatformSettings } from './PlatformSettingsService';
import {
  decidePayoutRoute,
  getSellerPayoutGateway,
} from './PayoutGatewayService';
import { releaseCancelledOrder, restoreReturnedOrder } from '../../ecommerce/inventory/StockService';

type Tx = Prisma.TransactionClient;

const ESCROW = {
  HELD: 'HELD',
  RELEASED: 'RELEASED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;

const LEDGER = {
  ESCROW_HOLD: 'ESCROW_HOLD',
  ESCROW_RELEASE: 'ESCROW_RELEASE',
  WITHDRAWAL: 'WITHDRAWAL',
  REFUND_DEDUCT: 'REFUND_DEDUCT',
} as const;

export async function ensureStore(storeId: string, name?: string) {
  const id = storeId.trim();
  if (!id) throw new AppError('VALIDATION', 'storeId required', 400);
  return prisma.store.upsert({
    where: { id },
    create: { id, name: name ?? id, updatedAt: new Date() },
    update: name ? { name } : {},
  });
}

export async function resolveStoreGpPercent(storeId: string) {
  const [settings, store] = await Promise.all([
    getPlatformSettings(),
    prisma.store.findUnique({ where: { id: storeId } }),
  ]);
  return store?.customGpPercent ?? settings.defaultGpPercent;
}

async function writeLedger(
  tx: Tx,
  input: {
    storeId: string;
    orderId?: string;
    type: string;
    amount: number;
    gpAmount?: number;
    grossAmount?: number;
    gpPercent?: number;
    memo: string;
    availableAfter: number;
  },
) {
  const wallet = await tx.sellerWallet.upsert({
    where: { sellerId: input.storeId },
    create: {
      id: randomUUID(),
      sellerId: input.storeId,
      availableBalance: 0,
      pendingBalance: 0,
      updatedAt: new Date(),
    },
    update: {},
  });
  await tx.financeWalletTransaction.create({
    data: {
      id: randomUUID(),
      walletId: wallet.id,
      sellerId: input.storeId,
      orderId: input.orderId,
      type: input.type,
      grossAmount: input.grossAmount ?? 0,
      gpFee: input.gpAmount ?? 0,
      vatAmount: 0,
      whtAmount: 0,
      netAmount: input.amount,
      gpRateBps: Math.round((input.gpPercent ?? 0) * 100),
      balanceAfter: input.availableAfter,
      memo: input.memo,
    },
  });
}

/**
 * A. PSP จับเงินสำเร็จ → PAID + สร้าง OrderEscrow HELD + เพิ่ม pending ของร้าน
 */
export async function holdEscrowOnPayment(input: {
  orderId: string;
  storeId: string;
  merchandiseThb: number;
  shippingFeeThb?: number;
  storeName?: string;
}) {
  const existing = await prisma.orderEscrow.findUnique({ where: { orderId: input.orderId } });
  if (existing) return existing;

  const settings = await getPlatformSettings();
  await ensureStore(input.storeId, input.storeName);
  const gpPercent = await resolveStoreGpPercent(input.storeId);
  const quote = quoteEscrow({
    merchandiseThb: input.merchandiseThb,
    shippingFeeThb: input.shippingFeeThb,
    gpPercent,
  });
  const due = new Date(Date.now() + settings.autoCompleteDays * 24 * 3600_000);

  return prisma.$transaction(async (tx) => {
    const dup = await tx.orderEscrow.findUnique({ where: { orderId: input.orderId } });
    if (dup) return dup;

    const escrow = await tx.orderEscrow.create({
      data: {
        id: randomUUID(),
        orderId: input.orderId,
        storeId: input.storeId,
        grossAmount: quote.satang.gross,
        shippingFee: quote.satang.shipping,
        gpPercent: quote.gpPercent,
        gpAmount: quote.satang.gpAmount,
        netMerchantAmount: quote.satang.netMerchantAmount,
        releaseDueDate: due,
        releaseStatus: ESCROW.HELD,
      },
    });

    const store = await tx.store.update({
      where: { id: input.storeId },
      data: { pendingBalance: { increment: quote.satang.netMerchantAmount } },
    });
    await tx.sellerWallet.upsert({
      where: { sellerId: input.storeId },
      create: {
        id: randomUUID(),
        sellerId: input.storeId,
        pendingBalance: quote.satang.netMerchantAmount,
        updatedAt: new Date(),
      },
      update: { pendingBalance: { increment: quote.satang.netMerchantAmount } },
    });
    await writeLedger(tx, {
      storeId: input.storeId,
      orderId: input.orderId,
      type: LEDGER.ESCROW_HOLD,
      amount: quote.satang.netMerchantAmount,
      gpAmount: quote.satang.gpAmount,
      grossAmount: quote.satang.gross,
      gpPercent: quote.gpPercent,
      memo: 'hold · รอผู้ซื้อรับของหรือครบโฮลด์',
      availableAfter: store.availableBalance,
    });
    return escrow;
  });
}

async function releaseHeldEscrow(orderId: string, reason: string) {
  const escrow = await prisma.orderEscrow.findUnique({ where: { orderId } });
  if (!escrow) throw new AppError('NOT_FOUND', 'escrow not found', 404);
  if (escrow.releaseStatus === ESCROW.RELEASED) return escrow;
  if (escrow.releaseStatus !== ESCROW.HELD) {
    throw new AppError('VALIDATION', `cannot release escrow in ${escrow.releaseStatus}`, 400);
  }

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.orderEscrow.findUniqueOrThrow({ where: { id: escrow.id } });
    if (fresh.releaseStatus !== ESCROW.HELD) return fresh;

    const store = await tx.store.findUniqueOrThrow({ where: { id: fresh.storeId } });
    if (store.pendingBalance < fresh.netMerchantAmount) {
      throw new AppError('CONFLICT', 'pending balance lower than escrow net', 409);
    }

    const nextStore = await tx.store.update({
      where: { id: store.id },
      data: {
        pendingBalance: { decrement: fresh.netMerchantAmount },
        availableBalance: { increment: fresh.netMerchantAmount },
      },
    });
    await tx.sellerWallet.updateMany({
      where: { sellerId: store.id },
      data: {
        pendingBalance: { decrement: fresh.netMerchantAmount },
        availableBalance: { increment: fresh.netMerchantAmount },
      },
    });
    await writeLedger(tx, {
      storeId: store.id,
      orderId,
      type: LEDGER.ESCROW_RELEASE,
      amount: fresh.netMerchantAmount,
      gpAmount: fresh.gpAmount,
      grossAmount: fresh.grossAmount,
      gpPercent: fresh.gpPercent,
      memo: reason,
      availableAfter: nextStore.availableBalance,
    });
    await tx.commerceOrder.update({
      where: { id: orderId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        settlementStatus: 'RELEASE_ELIGIBLE',
      },
    });
    return tx.orderEscrow.update({
      where: { id: fresh.id },
      data: { releaseStatus: ESCROW.RELEASED, releasedAt: new Date() },
    });
  });
}

/**
 * B. ผู้ซื้อกดรับสินค้า → ปล่อย escrow ทันที (pending → available)
 */
export async function confirmOrderReceived(orderId: string, buyerId: string) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  if (buyerId !== 'admin' && order.buyerId !== buyerId) {
    throw new AppError('FORBIDDEN', 'only the buyer can confirm receipt', 403);
  }
  if (order.disputedAt || order.returnStatus === 'REQUESTED' || order.returnStatus === 'ACCEPTED') {
    throw new AppError('VALIDATION', 'order has an open dispute/return', 409);
  }
  const shipOk = order.status === 'DELIVERED' || order.shippingStatus === 'DELIVERED';
  if (!shipOk && order.status !== 'PAID' && order.status !== 'SHIPPED') {
    throw new AppError('VALIDATION', 'confirm only after the order is paid and delivered', 400);
  }

  await prisma.commerceOrder.update({
    where: { id: orderId },
    data: {
      buyerConfirmedAt: order.buyerConfirmedAt ?? new Date(),
      shippingStatus: order.shippingStatus ?? 'DELIVERED',
      deliveredAt: order.deliveredAt ?? new Date(),
      status: 'DELIVERED',
    },
  });
  return releaseHeldEscrow(orderId, 'buyer_confirm · ESCROW_RELEASE');
}

/**
 * B. Cron ทุกชั่วโมง: DELIVERED เกิน N วัน และไม่มี dispute → ปล่อยอัตโนมัติ
 */
export async function autoCompleteDeliveredOrdersCronJob() {
  const settings = await getPlatformSettings();
  const cutoff = new Date(Date.now() - settings.autoCompleteDays * 24 * 3600_000);
  const due = await prisma.commerceOrder.findMany({
    where: {
      status: { in: ['DELIVERED', 'SHIPPED', 'PAID'] },
      shippingStatus: 'DELIVERED',
      deliveredAt: { lte: cutoff },
      disputedAt: null,
      returnStatus: { in: ['NONE', 'REJECTED'] },
      completedAt: null,
    },
    take: 200,
  });

  let released = 0;
  for (const order of due) {
    try {
      await releaseHeldEscrow(order.id, `auto_complete_${settings.autoCompleteDays}d`);
      released += 1;
    } catch {
      /* ออเดอร์ที่ยังไม่มี escrow / ปล่อยแล้ว ข้าม */
    }
  }
  return { scanned: due.length, released, autoCompleteDays: settings.autoCompleteDays };
}

function notShipped(order: { status: string; shippingStatus: string | null }) {
  const ship = order.shippingStatus ?? '';
  return ship !== 'SHIPPED' && ship !== 'DELIVERED' && order.status !== 'SHIPPED' && order.status !== 'DELIVERED';
}

async function refundViaPsp(order: { id: string; pspRef: string | null; merchandiseThb: number; shippingFeeThb: number }) {
  const gateway = getPaymentGateway();
  if (!gateway.refund) {
    throw new AppError('PSP_NOT_CONFIGURED', 'PSP refund is not configured', 503);
  }
  if (!order.pspRef) {
    throw new AppError('VALIDATION', 'order has no pspRef to refund', 400);
  }
  return gateway.refund({
    pspRef: order.pspRef,
    amountThb: BigInt(order.merchandiseThb + (order.shippingFeeThb ?? 0)),
    idempotencyKey: `refund_${order.id}`,
    reason: 'BoomMall order refund',
  });
}

/**
 * C. ยกเลิกก่อนส่งของ — คืนลูกค้าเต็ม ไม่หัก GP ยกเลิก escrow
 */
export async function cancelOrderBeforeShip(orderId: string) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  if (order.status === 'CANCELLED' || order.status === 'REFUNDED') return order;
  if (!notShipped(order)) {
    throw new AppError('VALIDATION', 'shipped orders must use return/refund', 400);
  }

  const refund = order.status === 'PENDING_PAYMENT' ? null : await refundViaPsp(order);
  const escrow = await prisma.orderEscrow.findUnique({ where: { orderId } });

  await prisma.$transaction(async (tx) => {
    if (escrow && escrow.releaseStatus === ESCROW.HELD) {
      const store = await tx.store.update({
        where: { id: escrow.storeId },
        data: { pendingBalance: { decrement: escrow.netMerchantAmount } },
      });
      await tx.sellerWallet.updateMany({
        where: { sellerId: escrow.storeId },
        data: { pendingBalance: { decrement: escrow.netMerchantAmount } },
      });
      await writeLedger(tx, {
        storeId: escrow.storeId,
        orderId,
        type: LEDGER.REFUND_DEDUCT,
        amount: escrow.netMerchantAmount,
        gpAmount: 0,
        grossAmount: escrow.grossAmount,
        gpPercent: 0,
        memo: 'cancel_before_ship · ไม่หัก GP',
        availableAfter: store.availableBalance,
      });
      await tx.orderEscrow.update({
        where: { id: escrow.id },
        data: { releaseStatus: ESCROW.CANCELLED },
      });
    }
    await tx.commerceOrder.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        settlementStatus: 'REFUNDED',
        gpAmountThb: 0,
        netToMerchantThb: 0,
      },
    });
    await releaseCancelledOrder(order, tx);
  });

  return { orderId, status: 'CANCELLED', refundRef: refund?.refundRef ?? null };
}

/**
 * C. ร้านยืนยันรับของคืน — คืนลูกค้า ลด pending ไม่เก็บ GP
 */
export async function processRefundAfterReturn(orderId: string) {
  const order = await prisma.commerceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('NOT_FOUND', 'order not found', 404);
  const escrow = await prisma.orderEscrow.findUnique({ where: { orderId } });
  if (escrow?.releaseStatus === ESCROW.RELEASED) {
    throw new AppError('VALIDATION', 'escrow already released — open a dispute', 409);
  }

  const refund = await refundViaPsp(order);

  await prisma.$transaction(async (tx) => {
    if (escrow && escrow.releaseStatus === ESCROW.HELD) {
      const store = await tx.store.update({
        where: { id: escrow.storeId },
        data: { pendingBalance: { decrement: escrow.netMerchantAmount } },
      });
      await tx.sellerWallet.updateMany({
        where: { sellerId: escrow.storeId },
        data: { pendingBalance: { decrement: escrow.netMerchantAmount } },
      });
      await writeLedger(tx, {
        storeId: escrow.storeId,
        orderId,
        type: LEDGER.REFUND_DEDUCT,
        amount: escrow.netMerchantAmount,
        gpAmount: 0,
        grossAmount: escrow.grossAmount,
        gpPercent: 0,
        memo: 'return_refund · ไม่หัก GP',
        availableAfter: store.availableBalance,
      });
      await tx.orderEscrow.update({
        where: { id: escrow.id },
        data: { releaseStatus: ESCROW.REFUNDED },
      });
    }
    await tx.commerceOrder.update({
      where: { id: orderId },
      data: {
        status: 'REFUNDED',
        returnStatus: 'REFUNDED',
        settlementStatus: 'REFUNDED',
        gpAmountThb: 0,
        netToMerchantThb: 0,
      },
    });
    await restoreReturnedOrder(order, tx);
  });

  return { orderId, status: 'REFUNDED', refundRef: refund.refundRef };
}

export async function markOrderDisputed(orderId: string) {
  return prisma.commerceOrder.update({
    where: { id: orderId },
    data: { disputedAt: new Date(), returnStatus: 'REQUESTED', settlementStatus: 'DISPUTED' },
  });
}

export async function getPlatformRevenue() {
  const [held, released, settings] = await Promise.all([
    prisma.orderEscrow.aggregate({
      where: { releaseStatus: { in: [ESCROW.HELD, ESCROW.RELEASED] } },
      _sum: { gpAmount: true, grossAmount: true, netMerchantAmount: true },
      _count: true,
    }),
    prisma.orderEscrow.aggregate({
      where: { releaseStatus: ESCROW.RELEASED },
      _sum: { gpAmount: true },
      _count: true,
    }),
    getPlatformSettings(),
  ]);
  return {
    currency: 'THB',
    defaultGpPercent: settings.defaultGpPercent,
    ordersInEscrow: held._count,
    gmvHeldOrReleased: toThb(held._sum.grossAmount ?? 0),
    commissionEarned: toThb(held._sum.gpAmount ?? 0),
    commissionReleased: toThb(released._sum.gpAmount ?? 0),
    netToMerchants: toThb(held._sum.netMerchantAmount ?? 0),
  };
}

export async function setStoreGpPercent(storeId: string, customGpPercent: number | null, name?: string) {
  await ensureStore(storeId, name);
  const value =
    customGpPercent == null ? null : Math.max(0, Math.min(100, Number(customGpPercent)));
  return prisma.store.update({
    where: { id: storeId },
    data: { customGpPercent: value },
  });
}

export async function getSellerFinanceDashboard(storeId: string) {
  const store = await ensureStore(storeId);
  const [escrows, withdrawals] = await Promise.all([
    prisma.orderEscrow.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
    prisma.withdrawalRequest.findMany({
      where: { sellerId: storeId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
  ]);

  /** ยอดถอนสะสมสำเร็จ = คำขอที่โอนแล้ว + ออเดอร์ที่แอดมินโอนตรงพร้อมหลักฐาน */
  const withdrawnPaid = withdrawals
    .filter((w) => w.status === 'TRANSFERRED')
    .reduce((s, w) => s + w.amount, 0);
  const escrowPaid = escrows.filter((e) => e.paidOutAt).reduce((s, e) => s + e.netMerchantAmount, 0);

  return {
    storeId: store.id,
    name: store.name,
    customGpPercent: store.customGpPercent,
    availableBalance: toThb(store.availableBalance),
    pendingBalance: toThb(store.pendingBalance),
    totalPaidOut: toThb(withdrawnPaid + escrowPaid),
    autoCompleteDays: 7,
    security: {
      pinSet: Boolean(store.paymentPinHash),
      pinLockedUntil: store.pinLockedUntil?.toISOString() ?? null,
      pinLockRemainingMs: remainingLockMs(store.pinLockedUntil),
      bankUpdatedAt: store.bankUpdatedAt?.toISOString() ?? null,
      bankCoolingRemainingMs: bankCoolingRemainingMs(store.bankUpdatedAt),
    },
    taxProfile: {
      taxId: store.taxId,
      address: store.address,
      isCorporate: store.isCorporate,
    },
    bankAccount: store.bankAccountNo
      ? {
          bankName: store.bankName,
          bankAccountNo: store.bankAccountNo,
          bankAccountName: store.bankAccountName,
          bankCode: store.bankCode,
        }
      : null,
    orders: escrows.map((e) => ({
      orderId: e.orderId,
      grossAmount: toThb(e.grossAmount),
      shippingFee: toThb(e.shippingFee),
      gpPercent: e.gpPercent,
      gpAmount: toThb(e.gpAmount),
      netMerchantAmount: toThb(e.netMerchantAmount),
      releaseStatus: e.releaseStatus,
      releaseDueDate: e.releaseDueDate?.toISOString() ?? null,
      paidOutAt: e.paidOutAt?.toISOString() ?? null,
      payoutProof: e.payoutProof,
      createdAt: e.createdAt.toISOString(),
    })),
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: toThb(w.amount),
      status: w.status,
      payoutChannel: w.payoutChannel === 'AUTO' ? 'AUTO' : 'MANUAL',
      bankName: w.bankName,
      bankAccountNo: w.bankAccountNo,
      bankAccountName: w.bankAccountName,
      proofOfTransfer: w.proofOfTransfer,
      transferredAt: w.transferredAt?.toISOString() ?? null,
      createdAt: w.createdAt.toISOString(),
    })),
  };
}

export async function saveStoreBankAccount(
  storeId: string,
  input: {
    bankName: string;
    bankAccountNo: string;
    bankAccountName: string;
    bankCode?: string;
    isCorporate?: boolean;
    storeName?: string;
    taxId?: string;
    address?: string;
  },
) {
  const store = await ensureStore(storeId, input.storeName);
  const bankName = input.bankName.trim();
  const bankAccountNo = input.bankAccountNo.replace(/\s+/g, '');
  const bankAccountName = input.bankAccountName.trim();
  if (!bankName || !bankAccountNo || !bankAccountName) {
    throw new AppError('VALIDATION', 'bankName, bankAccountNo, bankAccountName required', 400);
  }
  const taxIdRaw = input.taxId !== undefined ? input.taxId.replace(/\D/g, '') : undefined;
  if (taxIdRaw !== undefined && taxIdRaw.length > 0 && taxIdRaw.length !== 13) {
    throw new AppError('VALIDATION', 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก', 400);
  }
  const bankChanged =
    store.bankAccountNo !== bankAccountNo ||
    store.bankName !== bankName ||
    store.bankAccountName !== bankAccountName ||
    (input.bankCode != null && input.bankCode.trim() !== (store.bankCode ?? ''));
  const [row] = await prisma.$transaction([
    prisma.store.update({
      where: { id: store.id },
      data: {
        bankName,
        bankAccountNo,
        bankAccountName,
        bankCode: input.bankCode?.trim() || store.bankCode,
        isCorporate: input.isCorporate ?? store.isCorporate,
        taxId: taxIdRaw !== undefined ? taxIdRaw || null : store.taxId,
        address:
          input.address !== undefined ? input.address.trim() || null : store.address,
        ...(bankChanged || !store.bankAccountNo ? { bankUpdatedAt: new Date() } : {}),
      },
    }),
    prisma.sellerWallet.upsert({
      where: { sellerId: storeId },
      create: {
        id: randomUUID(),
        sellerId: storeId,
        bankName,
        bankAccountNo,
        bankAccountName,
        bankCode: input.bankCode?.trim() || null,
        isCorporate: input.isCorporate ?? false,
        updatedAt: new Date(),
      },
      update: {
        bankName,
        bankAccountNo,
        bankAccountName,
        bankCode: input.bankCode?.trim() || undefined,
        isCorporate: input.isCorporate,
      },
    }),
  ]);
  return {
    storeId: row.id,
    taxProfile: {
      taxId: row.taxId,
      address: row.address,
      isCorporate: row.isCorporate,
    },
    bankAccount: {
      bankName: row.bankName,
      bankAccountNo: row.bankAccountNo,
      bankAccountName: row.bankAccountName,
      bankCode: row.bankCode,
    },
    bankUpdatedAt: row.bankUpdatedAt?.toISOString() ?? null,
    coolingOffHours: bankChanged || !store.bankAccountNo ? 24 : 0,
  };
}

/**
 * ถอนเงิน — storeId จาก JWT เท่านั้น
 * Hybrid: AUTO (gateway) หรือ MANUAL (คิวแอดมิน) ตาม Platform Settings
 */
export async function requestWithdrawal(storeId: string, amountThb: number, pin: string) {
  const amount = toSatang(amountThb);
  if (amount <= 0) throw new AppError('VALIDATION', 'amount must be > 0', 400);
  if (!storeId.trim()) throw new AppError('UNAUTHORIZED', 'กรุณาเข้าสู่ระบบก่อนใช้งาน', 401);

  await assertWithdrawPin(storeId, pin);

  const store = await ensureStore(storeId);
  assertBankCoolingOff(store.bankUpdatedAt);
  if (!store.bankAccountNo) throw new AppError('VALIDATION', 'ผูกบัญชีธนาคารก่อนถอน', 400);

  const settings = await getPlatformSettings();
  const gateway = getSellerPayoutGateway();
  const route = decidePayoutRoute({
    payoutMode: settings.payoutMode,
    amountSatang: amount,
    autoPayoutMaxLimitSatang: settings.autoPayoutMaxLimitSatang,
    bankCoolingRemainingMs: bankCoolingRemainingMs(store.bankUpdatedAt),
    gatewayConfigured: gateway.configured,
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT id FROM stores WHERE id = $1 FOR UPDATE`, storeId);
    const fresh = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    if (fresh.availableBalance < amount) {
      throw new AppError('VALIDATION', 'ยอดพร้อมถอนไม่พอ', 400);
    }
    const next = await tx.store.update({
      where: { id: storeId },
      data: { availableBalance: { decrement: amount } },
    });
    const wallet = await tx.sellerWallet.upsert({
      where: { sellerId: storeId },
      create: {
        id: randomUUID(),
        sellerId: storeId,
        availableBalance: next.availableBalance,
        updatedAt: new Date(),
      },
      update: { availableBalance: { decrement: amount } },
    });
    const wd = await tx.withdrawalRequest.create({
      data: {
        id: randomUUID(),
        walletId: wallet.id,
        sellerId: storeId,
        amount,
        status: 'PENDING',
        payoutChannel: route.route === 'AUTO' ? 'AUTO' : 'MANUAL',
        manualReason: route.route === 'MANUAL' ? route.reason : null,
        bankName: fresh.bankName,
        bankAccountNo: fresh.bankAccountNo,
        bankAccountName: fresh.bankAccountName,
      },
    });
    await writeLedger(tx, {
      storeId,
      type: LEDGER.WITHDRAWAL,
      amount,
      memo: `withdraw_request ${wd.id}`,
      availableAfter: next.availableBalance,
    });
    return {
      id: wd.id,
      amount: wd.amount,
      bankName: fresh.bankName ?? '',
      bankAccountNo: fresh.bankAccountNo ?? '',
      bankAccountName: fresh.bankAccountName ?? '',
      bankCode: fresh.bankCode,
      createdAt: wd.createdAt,
      payoutChannel: wd.payoutChannel,
      manualReason: wd.manualReason,
    };
  });

  if (route.route !== 'AUTO') {
    return {
      id: created.id,
      amount: toThb(created.amount),
      status: 'PENDING' as const,
      payoutChannel: 'MANUAL' as const,
      manualReason: route.reason,
      createdAt: created.createdAt.toISOString(),
      message: 'ส่งคำขอถอนแล้ว — รอแอดมินโอนพร้อมหลักฐาน',
    };
  }

  try {
    const paid = await gateway.transfer({
      withdrawalId: created.id,
      sellerId: storeId,
      amountThb: toThb(created.amount),
      bankName: created.bankName,
      bankAccountNo: created.bankAccountNo,
      bankAccountName: created.bankAccountName,
      bankCode: created.bankCode,
      idempotencyKey: `wd_${created.id}`,
    });
    const updated = await prisma.withdrawalRequest.update({
      where: { id: created.id },
      data: {
        status: 'TRANSFERRED',
        payoutChannel: 'AUTO',
        payoutProvider: paid.provider,
        payoutRef: paid.transferRef,
        proofOfTransfer: paid.transferRef,
        reviewedBy: `auto:${paid.provider}`,
        reviewedAt: new Date(),
        transferredAt: new Date(),
        manualReason: null,
        note: 'auto_payout',
      },
    });
    return {
      id: updated.id,
      amount: toThb(updated.amount),
      status: 'TRANSFERRED' as const,
      payoutChannel: 'AUTO' as const,
      payoutRef: paid.transferRef,
      createdAt: updated.createdAt.toISOString(),
      message: 'ระบบโอนออโต้สำเร็จแล้ว',
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'auto_failed';
    await prisma.withdrawalRequest.update({
      where: { id: created.id },
      data: {
        payoutChannel: 'MANUAL',
        manualReason: `auto_failed:${reason.slice(0, 180)}`,
        note: 'auto_fallback_manual',
      },
    });
    return {
      id: created.id,
      amount: toThb(created.amount),
      status: 'PENDING' as const,
      payoutChannel: 'MANUAL' as const,
      manualReason: 'auto_failed',
      createdAt: created.createdAt.toISOString(),
      message: 'โอนออโต้ไม่สำเร็จ — ส่งเข้าคิวแอดมินแล้ว',
    };
  }
}

/**
 * แอดมินยืนยันว่าโอนจริงแล้ว พร้อมหลักฐาน — ไม่สร้างความสำเร็จเองถ้าไม่มี proof
 */
export async function adminApproveWithdrawal(withdrawalId: string, proofOfTransfer: string, actor: string) {
  const proof = proofOfTransfer.trim();
  if (!proof) {
    throw new AppError('VALIDATION', 'proofOfTransfer required — do not mark transferred without evidence', 400);
  }
  const row = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
  if (!row) throw new AppError('NOT_FOUND', 'withdrawal not found', 404);
  if (row.status !== 'PENDING' && row.status !== 'APPROVED') {
    throw new AppError('VALIDATION', `cannot transfer ${row.status}`, 400);
  }
  const updated = await prisma.withdrawalRequest.update({
    where: { id: withdrawalId },
    data: {
      status: 'TRANSFERRED',
      payoutChannel: 'MANUAL',
      proofOfTransfer: proof,
      reviewedBy: actor,
      reviewedAt: new Date(),
      transferredAt: new Date(),
    },
  });
  return {
    id: updated.id,
    status: updated.status,
    amount: toThb(updated.amount),
    proofOfTransfer: updated.proofOfTransfer,
    transferredAt: updated.transferredAt?.toISOString() ?? null,
  };
}

export function tabForEscrow(row: { releaseStatus: string; paidOutAt: Date | null }) {
  if (row.paidOutAt) return 'completed' as const;
  if (row.releaseStatus === ESCROW.RELEASED) return 'ready' as const;
  if (row.releaseStatus === ESCROW.HELD) return 'hold' as const;
  return 'other' as const;
}

export async function listAdminEscrows() {
  const rows = await prisma.orderEscrow.findMany({
    include: { store: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    storeId: row.storeId,
    storeName: row.store.name || row.storeId,
    grossAmount: toThb(row.grossAmount),
    shippingFee: toThb(row.shippingFee),
    gpPercent: row.gpPercent,
    gpAmount: toThb(row.gpAmount),
    netMerchantAmount: toThb(row.netMerchantAmount),
    releaseStatus: row.releaseStatus,
    releaseDueDate: row.releaseDueDate?.toISOString() ?? null,
    releasedAt: row.releasedAt?.toISOString() ?? null,
    payoutProof: row.payoutProof,
    paidOutAt: row.paidOutAt?.toISOString() ?? null,
    tab: tabForEscrow(row),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function markEscrowPaidOut(escrowId: string, proofOfTransfer: string, actor: string) {
  const proof = proofOfTransfer.trim();
  if (!proof) {
    throw new AppError('VALIDATION', 'ต้องมีหลักฐานการโอนก่อนทำเครื่องหมายว่าโอนแล้ว', 400);
  }
  const row = await prisma.orderEscrow.findUnique({ where: { id: escrowId } });
  if (!row) throw new AppError('NOT_FOUND', 'escrow not found', 404);
  if (row.releaseStatus !== ESCROW.RELEASED) {
    throw new AppError('VALIDATION', 'ปล่อยยอดจาก escrow ก่อน จึงจะโอนให้ร้านได้', 400);
  }
  if (row.paidOutAt) {
    return { id: row.id, paidOutAt: row.paidOutAt.toISOString(), payoutProof: row.payoutProof };
  }
  const updated = await prisma.orderEscrow.update({
    where: { id: escrowId },
    data: { payoutProof: proof, paidOutAt: new Date() },
  });
  await prisma.commerceOrder.updateMany({
    where: { id: row.orderId },
    data: { paidOutAt: updated.paidOutAt, settlementStatus: 'PAID_OUT' },
  });
  return {
    id: updated.id,
    paidOutAt: updated.paidOutAt?.toISOString() ?? null,
    payoutProof: updated.payoutProof,
    actor,
  };
}

export function startEscrowAutoCompleteJob(intervalMs = 60 * 60_000) {
  void autoCompleteDeliveredOrdersCronJob().catch((err) => {
    console.error('[escrow] auto-complete', err);
  });
  return setInterval(() => {
    void autoCompleteDeliveredOrdersCronJob().catch((err) => {
      console.error('[escrow] auto-complete', err);
    });
  }, intervalMs);
}
