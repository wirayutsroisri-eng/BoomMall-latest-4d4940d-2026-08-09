/**
 * Finance & Settlement — กระเป๋าร้าน + escrow + หัก GP/VAT/WHT
 * หน่วยในฐานข้อมูลเป็นสตางค์ (1 บาท = 100) เพื่อเลี่ยงทศนิยมลอยตัว
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { getGpPolicy, resolveGpBps } from '../ecommerce/GpLedgerService';

export const VAT_RATE = 0.07;
export const WHT_RATE = 0.03;
export const DEFAULT_GP_RATE = 0.05;

const TX = {
  SETTLEMENT: 'SETTLEMENT',
  RELEASE: 'RELEASE',
  WITHDRAW: 'WITHDRAW',
  WITHDRAW_REJECT: 'WITHDRAW_REJECT',
  REVERSAL: 'REVERSAL',
} as const;

const WD = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  TRANSFERRED: 'TRANSFERRED',
  REJECTED: 'REJECTED',
} as const;

export type SettlementQuote = {
  grossAmount: number;
  gpRate: number;
  gpRateBps: number;
  isCorporate: boolean;
  gpFee: number;
  vatAmount: number;
  whtAmount: number;
  netAmount: number;
  /** สตางค์ — ใช้ลงสมุด */
  satang: {
    gross: number;
    gpFee: number;
    vat: number;
    wht: number;
    net: number;
  };
};

function toSatang(thb: number) {
  return Math.max(0, Math.round(Number(thb) * 100));
}

function toThb(satang: number) {
  return Math.round(satang) / 100;
}

function rateToBps(gpRate: number) {
  // รับได้ทั้ง 0.05 และ 5 (เปอร์เซ็นต์) และ 500 (bps)
  if (!Number.isFinite(gpRate) || gpRate < 0) return 500;
  if (gpRate <= 1) return Math.round(gpRate * 10_000);
  if (gpRate <= 100) return Math.round(gpRate * 100);
  return Math.min(10_000, Math.round(gpRate));
}

/**
 * คำนวณยอดสุทธิร้านจากยอดขาย
 * - GP = ยอดขาย × อัตรา (เช่น 5%)
 * - VAT 7% คิดจากค่า GP (ภาระร้านในยอดสุทธิ)
 * - WHT 3% หัก ณ ที่จ่าย จากค่า GP เฉพาะนิติบุคคล
 * net = gross − GP − VAT − WHT
 */
export function calculateSettlement(
  grossAmount: number,
  gpRate: number,
  isCorporate: boolean,
): SettlementQuote {
  const gpRateBps = rateToBps(gpRate);
  const gross = toSatang(grossAmount);
  const gpFee = Math.floor((gross * gpRateBps) / 10_000);
  const vatAmount = Math.floor((gpFee * 700) / 10_000);
  const whtAmount = isCorporate ? Math.floor((gpFee * 300) / 10_000) : 0;
  const netAmount = Math.max(0, gross - gpFee - vatAmount - whtAmount);
  return {
    grossAmount: toThb(gross),
    gpRate: gpRateBps / 10_000,
    gpRateBps,
    isCorporate,
    gpFee: toThb(gpFee),
    vatAmount: toThb(vatAmount),
    whtAmount: toThb(whtAmount),
    netAmount: toThb(netAmount),
    satang: { gross, gpFee, vat: vatAmount, wht: whtAmount, net: netAmount },
  };
}

function mapWallet(row: {
  id: string;
  sellerId: string;
  availableBalance: number;
  pendingBalance: number;
  isCorporate: boolean;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  bankCode: string | null;
  updatedAt: Date;
}) {
  return {
    sellerId: row.sellerId,
    availableBalance: toThb(row.availableBalance),
    pendingBalance: toThb(row.pendingBalance),
    isCorporate: row.isCorporate,
    bankAccount: row.bankAccountNo
      ? {
          bankName: row.bankName,
          bankAccountNo: row.bankAccountNo,
          bankAccountName: row.bankAccountName,
          bankCode: row.bankCode,
        }
      : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureSellerWallet(sellerId: string) {
  const id = sellerId.trim();
  if (!id) throw new AppError('VALIDATION', 'sellerId required', 400);
  return prisma.sellerWallet.upsert({
    where: { sellerId: id },
    create: { id: randomUUID(), sellerId: id, updatedAt: new Date() },
    update: {},
  });
}

export async function getSellerWallet(sellerId: string) {
  const wallet = await ensureSellerWallet(sellerId);
  const txs = await prisma.financeWalletTransaction.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  return {
    ...mapWallet(wallet),
    transactions: txs.map((t) => ({
      id: t.id,
      type: t.type,
      orderId: t.orderId,
      grossAmount: toThb(t.grossAmount),
      gpFee: toThb(t.gpFee),
      vatAmount: toThb(t.vatAmount),
      whtAmount: toThb(t.whtAmount),
      netAmount: toThb(t.netAmount),
      memo: t.memo,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/**
 * บันทึกยอดออเดอร์เข้า pending (escrow) — ร้านยังถอนไม่ได้
 * ใช้ prisma.$transaction เพื่อกันลงซ้ำ / ยอดเพี้ยน
 */
export async function settleOrder(orderId: string, sellerId: string, grossAmount: number) {
  const { holdEscrowOnPayment } = await import('./services/EscrowService');
  const escrow = await holdEscrowOnPayment({
    orderId,
    storeId: sellerId,
    merchandiseThb: grossAmount,
  });
  const wallet = await ensureSellerWallet(sellerId);
  return { idempotent: true, escrow, wallet: mapWallet(wallet) };
}

/** ย้าย pending → available หลังครบเงื่อนไขปล่อยยอด (เช่น 7 วัน) */
export async function releaseSettlement(orderId: string) {
  const settled = await prisma.financeWalletTransaction.findUnique({
    where: { orderId_type: { orderId, type: TX.SETTLEMENT } },
  });
  if (!settled) return { skipped: true as const };
  const already = await prisma.financeWalletTransaction.findUnique({
    where: { orderId_type: { orderId, type: TX.RELEASE } },
  });
  if (already) return { skipped: true as const };

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.sellerWallet.findUniqueOrThrow({ where: { id: settled.walletId } });
    if (wallet.pendingBalance < settled.netAmount) {
      throw new AppError('CONFLICT', 'pending balance lower than settlement net', 409);
    }
    await tx.financeWalletTransaction.create({
      data: {
        id: randomUUID(),
        walletId: wallet.id,
        sellerId: settled.sellerId,
        orderId,
        type: TX.RELEASE,
        grossAmount: 0,
        gpFee: 0,
        vatAmount: 0,
        whtAmount: 0,
        netAmount: settled.netAmount,
        gpRateBps: settled.gpRateBps,
        memo: 'release_to_available',
      },
    });
    await tx.sellerWallet.update({
      where: { id: wallet.id },
      data: {
        pendingBalance: { decrement: settled.netAmount },
        availableBalance: { increment: settled.netAmount },
      },
    });
  });
  return { skipped: false as const };
}

/** คืนสินค้า — ดึงยอด pending กลับถ้ายังไม่ปล่อย */
export async function reverseSettlement(orderId: string) {
  const settled = await prisma.financeWalletTransaction.findUnique({
    where: { orderId_type: { orderId, type: TX.SETTLEMENT } },
  });
  if (!settled) return { skipped: true as const };
  const released = await prisma.financeWalletTransaction.findUnique({
    where: { orderId_type: { orderId, type: TX.RELEASE } },
  });
  if (released) {
    throw new AppError('CONFLICT', 'settlement already released — open a dispute', 409);
  }
  const reversed = await prisma.financeWalletTransaction.findUnique({
    where: { orderId_type: { orderId, type: TX.REVERSAL } },
  });
  if (reversed) return { skipped: true as const };

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.sellerWallet.findUniqueOrThrow({ where: { id: settled.walletId } });
    if (wallet.pendingBalance < settled.netAmount) {
      throw new AppError('CONFLICT', 'pending balance lower than settlement net', 409);
    }
    await tx.financeWalletTransaction.create({
      data: {
        id: randomUUID(),
        walletId: wallet.id,
        sellerId: settled.sellerId,
        orderId,
        type: TX.REVERSAL,
        grossAmount: settled.grossAmount,
        gpFee: settled.gpFee,
        vatAmount: settled.vatAmount,
        whtAmount: settled.whtAmount,
        netAmount: settled.netAmount,
        gpRateBps: settled.gpRateBps,
        memo: 'return_reverse_pending',
      },
    });
    await tx.sellerWallet.update({
      where: { id: wallet.id },
      data: { pendingBalance: { decrement: settled.netAmount } },
    });
  });
  return { skipped: false as const };
}

export async function saveBankAccount(
  sellerId: string,
  input: {
    bankName: string;
    bankAccountNo: string;
    bankAccountName: string;
    bankCode?: string;
    isCorporate?: boolean;
  },
) {
  const bankName = input.bankName.trim();
  const bankAccountNo = input.bankAccountNo.replace(/\s+/g, '');
  const bankAccountName = input.bankAccountName.trim();
  if (!bankName || !bankAccountNo || !bankAccountName) {
    throw new AppError('VALIDATION', 'bankName, bankAccountNo, bankAccountName required', 400);
  }
  const wallet = await ensureSellerWallet(sellerId);
  const row = await prisma.sellerWallet.update({
    where: { id: wallet.id },
    data: {
      bankName,
      bankAccountNo,
      bankAccountName,
      bankCode: input.bankCode?.trim() || wallet.bankCode,
      isCorporate: input.isCorporate ?? wallet.isCorporate,
    },
  });
  return mapWallet(row);
}

export async function requestWithdraw(sellerId: string, amountThb: number) {
  const amount = toSatang(amountThb);
  if (amount <= 0) throw new AppError('VALIDATION', 'amount must be > 0', 400);
  const wallet = await ensureSellerWallet(sellerId);
  if (!wallet.bankAccountNo) {
    throw new AppError('VALIDATION', 'ผูกบัญชีธนาคารก่อนถอน', 400);
  }
  if (wallet.availableBalance < amount) {
    throw new AppError('VALIDATION', 'ยอดพร้อมถอนไม่พอ', 400);
  }

  const row = await prisma.$transaction(async (tx) => {
    const fresh = await tx.sellerWallet.findUniqueOrThrow({ where: { id: wallet.id } });
    if (fresh.availableBalance < amount) {
      throw new AppError('VALIDATION', 'ยอดพร้อมถอนไม่พอ', 400);
    }
    const wd = await tx.withdrawalRequest.create({
      data: {
        id: randomUUID(),
        walletId: wallet.id,
        sellerId,
        amount,
        status: WD.PENDING,
        bankName: fresh.bankName,
        bankAccountNo: fresh.bankAccountNo,
        bankAccountName: fresh.bankAccountName,
      },
    });
    await tx.financeWalletTransaction.create({
      data: {
        id: randomUUID(),
        walletId: wallet.id,
        sellerId,
        withdrawalId: wd.id,
        type: TX.WITHDRAW,
        grossAmount: 0,
        gpFee: 0,
        vatAmount: 0,
        whtAmount: 0,
        netAmount: amount,
        gpRateBps: 0,
        memo: 'withdraw_request · สำรองยอด ยังไม่โอน',
      },
    });
    // ล็อกยอดทันทีกันถอนซ้ำ
    await tx.sellerWallet.update({
      where: { id: wallet.id },
      data: { availableBalance: { decrement: amount } },
    });
    return wd;
  });

  return {
    id: row.id,
    amount: toThb(row.amount),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPendingWithdrawals() {
  const [queue, recentAuto] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where: { status: { in: [WD.PENDING, WD.APPROVED] } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    }),
    prisma.withdrawalRequest.findMany({
      where: { status: WD.TRANSFERRED, payoutChannel: 'AUTO' },
      orderBy: { transferredAt: 'desc' },
      take: 40,
    }),
  ]);
  const rows = [...queue, ...recentAuto];
  const storeIds = [...new Set(rows.map((r) => r.sellerId))];
  const stores = storeIds.length
    ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(stores.map((s) => [s.id, s.name]));
  return rows.map((r) => ({
    id: r.id,
    sellerId: r.sellerId,
    storeName: nameById.get(r.sellerId) || r.sellerId,
    amount: toThb(r.amount),
    status: r.status,
    payoutChannel: r.payoutChannel === 'AUTO' ? 'AUTO' : 'MANUAL',
    payoutProvider: r.payoutProvider,
    payoutRef: r.payoutRef,
    manualReason: r.manualReason,
    proofOfTransfer: r.proofOfTransfer,
    bankName: r.bankName,
    bankAccountNo: r.bankAccountNo,
    bankAccountName: r.bankAccountName,
    transferredAt: r.transferredAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    badge:
      r.status === WD.TRANSFERRED && r.payoutChannel === 'AUTO'
        ? ('auto_done' as const)
        : ('manual_pending' as const),
  }));
}

/**
 * บัญชีอนุมัติคำขอ — ยอดถูกสำรองตอนขอแล้ว
 * ไม่เคลมว่าโอนเข้าบัญชีธนาคารสำเร็จ (ต้องมี PSP payout แยก)
 */
export async function approveWithdrawal(id: string, actor: string) {
  const row = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', 'withdrawal not found', 404);
  if (row.status !== WD.PENDING) {
    throw new AppError('VALIDATION', `cannot approve ${row.status}`, 400);
  }
  const updated = await prisma.withdrawalRequest.update({
    where: { id },
    data: { status: WD.APPROVED, reviewedBy: actor, reviewedAt: new Date() },
  });
  return {
    id: updated.id,
    status: updated.status,
    amount: toThb(updated.amount),
    reviewedBy: updated.reviewedBy,
    reviewedAt: updated.reviewedAt?.toISOString() ?? null,
    note: 'อนุมัติคำขอแล้ว — ยังไม่ใช่การโอนสำเร็จ',
  };
}

export async function rejectWithdrawal(id: string, actor: string) {
  const row = await prisma.withdrawalRequest.findUnique({ where: { id } });
  if (!row) throw new AppError('NOT_FOUND', 'withdrawal not found', 404);
  if (row.status !== WD.PENDING) {
    throw new AppError('VALIDATION', `cannot reject ${row.status}`, 400);
  }
  await prisma.$transaction(async (tx) => {
    await tx.withdrawalRequest.update({
      where: { id },
      data: { status: WD.REJECTED, reviewedBy: actor, reviewedAt: new Date() },
    });
    await tx.financeWalletTransaction.create({
      data: {
        id: randomUUID(),
        walletId: row.walletId,
        sellerId: row.sellerId,
        withdrawalId: row.id,
        type: TX.WITHDRAW_REJECT,
        grossAmount: 0,
        gpFee: 0,
        vatAmount: 0,
        whtAmount: 0,
        netAmount: row.amount,
        gpRateBps: 0,
        memo: 'withdraw_rejected · คืนยอด available',
      },
    });
    await tx.sellerWallet.update({
      where: { id: row.walletId },
      data: { availableBalance: { increment: row.amount } },
    });
    await tx.store.updateMany({
      where: { id: row.sellerId },
      data: { availableBalance: { increment: row.amount } },
    });
  });
  return { id, status: WD.REJECTED };
}

export async function getTaxSummary() {
  const [agg, wallets, pendingWd, policy] = await Promise.all([
    prisma.financeWalletTransaction.aggregate({
      where: { type: TX.SETTLEMENT },
      _sum: {
        grossAmount: true,
        gpFee: true,
        vatAmount: true,
        whtAmount: true,
        netAmount: true,
      },
      _count: true,
    }),
    prisma.sellerWallet.aggregate({
      _sum: { availableBalance: true, pendingBalance: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: WD.PENDING },
      _sum: { amount: true },
      _count: true,
    }),
    getGpPolicy(),
  ]);

  return {
    currency: 'THB',
    gpRateDefault: policy.defaultGpBps / 100,
    vatRate: VAT_RATE,
    whtRate: WHT_RATE,
    settledOrders: agg._count,
    grossAmount: toThb(agg._sum.grossAmount ?? 0),
    gpFee: toThb(agg._sum.gpFee ?? 0),
    vatAmount: toThb(agg._sum.vatAmount ?? 0),
    whtAmount: toThb(agg._sum.whtAmount ?? 0),
    netToSellers: toThb(agg._sum.netAmount ?? 0),
    sellerPending: toThb(wallets._sum.pendingBalance ?? 0),
    sellerAvailable: toThb(wallets._sum.availableBalance ?? 0),
    pendingWithdrawals: {
      count: pendingWd._count,
      amount: toThb(pendingWd._sum.amount ?? 0),
    },
  };
}

export function financeDomainStatus() {
  return {
    domain: 'finance-settlement',
    escrow: true,
    sellerWallet: true,
    vatOnGp: VAT_RATE,
    whtOnGpCorporate: WHT_RATE,
    withdrawClaimsPayout: false,
  };
}
