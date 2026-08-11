import {
  AccountBucket,
  EntrySide,
  Prisma,
  TxStatus,
  TxType,
  WalletKind,
  type PrismaClient,
} from '@prisma/client';
import { GENESIS_HASH, hashLedgerRecord } from '../lib/hash';
import { AppError } from '../lib/errors';

export type MintLeg = {
  walletId: string;
  bucket?: AccountBucket;
  amount: bigint;
};

type TxClient = Prisma.TransactionClient;

/**
 * Double-entry mint:
 *   DEBIT  SYSTEM_MINT.AVAILABLE  (source of new supply — excluded from circulating)
 *   CREDIT destination.AVAILABLE  (receives coins)
 *
 * Also bumps SystemSupply.totalMinted. Never edits balances outside this path.
 */
export async function mintCoins(
  db: TxClient,
  input: {
    requestId: string;
    idempotencyKey: string;
    type: TxType;
    destination: MintLeg;
    metadata?: Record<string, unknown>;
    referenceId?: string;
  },
) {
  const existing = await db.idempotencyRecord.findUnique({
    where: { key: input.idempotencyKey },
  });
  if (existing) {
    const tx = await db.walletTransaction.findUniqueOrThrow({
      where: { id: existing.transactionId },
      include: { entries: true },
    });
    return { transaction: tx, replay: true as const };
  }

  const amount = input.destination.amount;
  if (amount <= 0n) throw new AppError('INVALID_MINT', 'Mint amount must be > 0');

  const mintWallet = await db.wallet.findFirst({
    where: { kind: WalletKind.SYSTEM_MINT, ownerRef: 'SYSTEM_MINT' },
  });
  if (!mintWallet) throw new AppError('SYSTEM_NOT_BOOTSTRAPPED', 'Mint wallet missing', 500);

  const destBucket = input.destination.bucket ?? AccountBucket.AVAILABLE;
  const mintAccount = await ensureAccount(db, mintWallet.id, AccountBucket.AVAILABLE);
  const destAccount = await ensureAccount(db, input.destination.walletId, destBucket);

  const last = await db.walletTransaction.findFirst({
    where: { status: TxStatus.COMMITTED },
    orderBy: { createdAt: 'desc' },
    select: { recordHash: true },
  });
  const previousHash = last?.recordHash ?? GENESIS_HASH;
  const createdAt = new Date();
  const recordHash = hashLedgerRecord({
    previousHash,
    requestId: input.requestId,
    type: input.type,
    amount: amount.toString(),
    createdAt: createdAt.toISOString(),
  });

  const transaction = await db.walletTransaction.create({
    data: {
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      status: TxStatus.COMMITTED,
      amount,
      referenceId: input.referenceId,
      metadataJson: (input.metadata ?? {}) as Prisma.InputJsonValue,
      previousHash,
      recordHash,
      createdAt,
      confirmedAt: createdAt,
      entries: {
        create: [
          {
            walletAccountId: mintAccount.id,
            side: EntrySide.DEBIT,
            amount,
          },
          {
            walletAccountId: destAccount.id,
            side: EntrySide.CREDIT,
            amount,
          },
        ],
      },
    },
    include: { entries: true },
  });

  // SYSTEM_MINT debit increases "issued from mint" tracking balance (not circulating)
  await db.walletAccount.update({
    where: { id: mintAccount.id },
    data: { balance: { increment: amount }, version: { increment: 1 } },
  });
  await db.walletAccount.update({
    where: { id: destAccount.id },
    data: { balance: { increment: amount }, version: { increment: 1 } },
  });

  await db.systemSupply.upsert({
    where: { id: 1 },
    create: { id: 1, totalMinted: amount, totalRevenueThb: 0n },
    update: { totalMinted: { increment: amount } },
  });

  const responseJson = {
    transactionId: transaction.id,
    amount: amount.toString(),
    type: input.type,
  };

  await db.idempotencyRecord.create({
    data: {
      key: input.idempotencyKey,
      transactionId: transaction.id,
      responseJson,
    },
  });

  return { transaction, replay: false as const };
}

export async function ensureAccount(
  db: TxClient | PrismaClient,
  walletId: string,
  bucket: AccountBucket,
) {
  return db.walletAccount.upsert({
    where: { walletId_bucket: { walletId, bucket } },
    create: { walletId, bucket, balance: 0n },
    update: {},
  });
}

/** Sum DEBIT must equal sum CREDIT for a committed transaction. */
export async function assertTxBalanced(db: TxClient | PrismaClient, transactionId: string) {
  const entries = await db.ledgerEntry.findMany({ where: { transactionId } });
  let debit = 0n;
  let credit = 0n;
  for (const e of entries) {
    if (e.side === EntrySide.DEBIT) debit += e.amount;
    else credit += e.amount;
  }
  if (debit !== credit) {
    throw new AppError('LEDGER_UNBALANCED', `Tx ${transactionId} debit≠credit`, 500);
  }
}
