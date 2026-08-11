import {
  AccountBucket,
  PrismaClient,
  TopUpStatus,
  TxType,
  WalletKind,
} from '@prisma/client';
import { mintCoins, ensureAccount } from './ledger';

const SYSTEM_WALLETS: Array<{ kind: WalletKind; ownerRef: string; displayName: string }> = [
  { kind: WalletKind.SYSTEM_MINT, ownerRef: 'SYSTEM_MINT', displayName: 'System Mint Contra' },
  { kind: WalletKind.TREASURY, ownerRef: 'PLATFORM_TREASURY', displayName: 'Platform Treasury' },
  { kind: WalletKind.REWARD_POOL, ownerRef: 'REWARD_POOL', displayName: 'Reward Pool' },
];

export async function bootstrapSystem(prisma: PrismaClient, initialMint: bigint) {
  for (const w of SYSTEM_WALLETS) {
    const wallet = await prisma.wallet.upsert({
      where: { kind_ownerRef: { kind: w.kind, ownerRef: w.ownerRef } },
      create: {
        kind: w.kind,
        ownerRef: w.ownerRef,
        displayName: w.displayName,
      },
      update: { displayName: w.displayName },
    });
    await ensureAccount(prisma, wallet.id, AccountBucket.AVAILABLE);
  }

  await prisma.systemSupply.upsert({
    where: { id: 1 },
    create: { id: 1, totalMinted: 0n, totalRevenueThb: 0n },
    update: {},
  });

  const treasury = await prisma.wallet.findFirstOrThrow({
    where: { kind: WalletKind.TREASURY, ownerRef: 'PLATFORM_TREASURY' },
  });

  const supply = await prisma.systemSupply.findUniqueOrThrow({ where: { id: 1 } });
  if (supply.totalMinted === 0n && initialMint > 0n) {
    await prisma.$transaction(async (tx) => {
      await mintCoins(tx, {
        requestId: 'bootstrap-initial-mint',
        idempotencyKey: 'bootstrap:initial-mint:v1',
        type: TxType.INITIAL_MINT,
        destination: { walletId: treasury.id, amount: initialMint },
        metadata: { reason: 'Initial treasury mint', coins: initialMint.toString() },
      });
    });
  }

  // Demo seller + sample pending top-up for Admin UI
  const demoSeller = await prisma.wallet.upsert({
    where: { kind_ownerRef: { kind: WalletKind.SELLER, ownerRef: 'seller-demo-001' } },
    create: {
      kind: WalletKind.SELLER,
      ownerRef: 'seller-demo-001',
      displayName: 'ร้านเดโม่ BoomMart',
    },
    update: {},
  });
  await ensureAccount(prisma, demoSeller.id, AccountBucket.AVAILABLE);

  const pendingCount = await prisma.sellerTopUpRequest.count({
    where: { status: TopUpStatus.PENDING },
  });
  if (pendingCount === 0) {
    await prisma.sellerTopUpRequest.create({
      data: {
        sellerWalletId: demoSeller.id,
        amountThb: 10000n,
        amountCoin: 10000n,
        proofUrl: 'https://picsum.photos/seed/boom-slip/800/1200',
        proofNote: 'โอนผ่านธนาคารกสิกร 10,000 บาท — สลิปตัวอย่าง',
        submittedBy: 'seller-demo-001',
        status: TopUpStatus.PENDING,
      },
    });
  }

  const treasuryAccount = await prisma.walletAccount.findUniqueOrThrow({
    where: {
      walletId_bucket: { walletId: treasury.id, bucket: AccountBucket.AVAILABLE },
    },
  });
  const supplyAfter = await prisma.systemSupply.findUniqueOrThrow({ where: { id: 1 } });

  return {
    totalMinted: supplyAfter.totalMinted,
    treasuryBalance: treasuryAccount.balance,
    demoSellerWalletId: demoSeller.id,
  };
}
