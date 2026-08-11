import {
  PrismaClient,
  TopUpStatus,
  TxType,
  WalletKind,
  type Prisma,
} from '@prisma/client';
import { AppError } from '../lib/errors';
import { toCoin } from '../lib/money';
import { mintCoins } from './ledger';

type ApproveInput = {
  topUpId: string;
  idempotencyKey: string;
  reviewedBy: string;
  reviewNote?: string;
};

/**
 * Admin approve seller top-up:
 * 1) Verify pending request + proof exists
 * 2) Mint Boom Coin (= THB) into Seller wallet via double-entry
 * 3) Increase SystemSupply.totalMinted + totalRevenueThb
 * Idempotent via Idempotency-Key header / body.
 */
export async function approveSellerTopUp(prisma: PrismaClient, input: ApproveInput) {
  const key = input.idempotencyKey.trim();
  if (!key) throw new AppError('IDEMPOTENCY_REQUIRED', 'Idempotency-Key is required', 400);

  const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });
  if (existing) {
    const topUp = await prisma.sellerTopUpRequest.findFirst({
      where: { walletTransactionId: existing.transactionId },
      include: { sellerWallet: true, walletTransaction: true },
    });
    return {
      replay: true as const,
      topUp,
      transactionId: existing.transactionId,
      response: existing.responseJson,
    };
  }

  return prisma.$transaction(async (tx) => {
    const topUp = await tx.sellerTopUpRequest.findUnique({
      where: { id: input.topUpId },
      include: { sellerWallet: true },
    });
    if (!topUp) throw new AppError('TOPUP_NOT_FOUND', 'Top-up request not found', 404);
    if (topUp.status === TopUpStatus.APPROVED) {
      throw new AppError('TOPUP_ALREADY_APPROVED', 'Already approved', 409);
    }
    if (topUp.status !== TopUpStatus.PENDING) {
      throw new AppError('TOPUP_NOT_PENDING', `Status is ${topUp.status}`, 409);
    }
    if (topUp.sellerWallet.kind !== WalletKind.SELLER) {
      throw new AppError('INVALID_SELLER_WALLET', 'Wallet is not a seller wallet', 400);
    }
    if (!topUp.proofUrl?.trim()) {
      throw new AppError('PROOF_REQUIRED', 'Proof of payment is required', 400);
    }

    const amountCoin = toCoin(topUp.amountCoin);
    const amountThb = toCoin(topUp.amountThb);
    if (amountCoin !== amountThb) {
      throw new AppError('AMOUNT_MISMATCH', 'amountCoin must equal amountThb (1:1)', 400);
    }

    const { transaction, replay } = await mintCoins(tx, {
      requestId: `topup-${topUp.id}`,
      idempotencyKey: key,
      type: TxType.SELLER_TOPUP_MINT,
      destination: { walletId: topUp.sellerWalletId, amount: amountCoin },
      referenceId: topUp.id,
      metadata: {
        topUpId: topUp.id,
        amountThb: amountThb.toString(),
        proofUrl: topUp.proofUrl,
        reviewedBy: input.reviewedBy,
      },
    });

    if (replay) {
      // Should be rare inside fresh transaction; return stored shape
      return {
        replay: true as const,
        topUp,
        transactionId: transaction.id,
        response: { transactionId: transaction.id },
      };
    }

    await tx.systemSupply.update({
      where: { id: 1 },
      data: { totalRevenueThb: { increment: amountThb } },
    });

    const updated = await tx.sellerTopUpRequest.update({
      where: { id: topUp.id },
      data: {
        status: TopUpStatus.APPROVED,
        reviewedBy: input.reviewedBy,
        reviewNote: input.reviewNote,
        reviewedAt: new Date(),
        idempotencyKey: key,
        walletTransactionId: transaction.id,
      },
      include: { sellerWallet: true, walletTransaction: true },
    });

    await tx.adminAuditLog.create({
      data: {
        actor: input.reviewedBy,
        action: 'TOPUP_APPROVE',
        entityType: 'SellerTopUpRequest',
        entityId: topUp.id,
        detailJson: {
          amountCoin: amountCoin.toString(),
          amountThb: amountThb.toString(),
          transactionId: transaction.id,
          idempotencyKey: key,
        } as Prisma.InputJsonValue,
      },
    });

    const response = {
      topUpId: updated.id,
      transactionId: transaction.id,
      mintedCoin: amountCoin.toString(),
      revenueThb: amountThb.toString(),
      sellerWalletId: updated.sellerWalletId,
      status: updated.status,
    };

    // Idempotency record already created in mintCoins — enrich responseJson
    await tx.idempotencyRecord.update({
      where: { key },
      data: { responseJson: response },
    });

    return {
      replay: false as const,
      topUp: updated,
      transactionId: transaction.id,
      response,
    };
  });
}

export async function listTopUps(
  prisma: PrismaClient,
  status?: TopUpStatus,
) {
  return prisma.sellerTopUpRequest.findMany({
    where: status ? { status } : undefined,
    include: {
      sellerWallet: true,
      walletTransaction: { select: { id: true, amount: true, type: true, confirmedAt: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createTopUpRequest(
  prisma: PrismaClient,
  input: {
    sellerOwnerRef: string;
    amountThb: number;
    proofUrl: string;
    proofNote?: string;
    submittedBy: string;
  },
) {
  const amount = toCoin(input.amountThb);
  if (amount <= 0n) throw new AppError('INVALID_AMOUNT', 'amountThb must be > 0');

  const seller = await prisma.wallet.findUnique({
    where: {
      kind_ownerRef: { kind: WalletKind.SELLER, ownerRef: input.sellerOwnerRef },
    },
  });
  if (!seller) throw new AppError('SELLER_NOT_FOUND', 'Seller wallet not found', 404);

  return prisma.sellerTopUpRequest.create({
    data: {
      sellerWalletId: seller.id,
      amountThb: amount,
      amountCoin: amount,
      proofUrl: input.proofUrl,
      proofNote: input.proofNote,
      submittedBy: input.submittedBy,
      status: TopUpStatus.PENDING,
    },
    include: { sellerWallet: true },
  });
}
