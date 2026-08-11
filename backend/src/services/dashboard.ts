import { AccountBucket, PrismaClient, TopUpStatus, WalletKind } from '@prisma/client';
import { reconcileLedger } from './reconcile';

export async function getDashboardStats(prisma: PrismaClient) {
  const supply = await prisma.systemSupply.findUniqueOrThrow({ where: { id: 1 } });
  const accounts = await prisma.walletAccount.findMany({
    where: { bucket: AccountBucket.AVAILABLE },
    include: { wallet: true },
  });

  let userBalance = 0n;
  let sellerBalance = 0n;
  let treasuryBalance = 0n;
  let rewardPoolBalance = 0n;

  for (const a of accounts) {
    switch (a.wallet.kind) {
      case WalletKind.USER:
        userBalance += a.balance;
        break;
      case WalletKind.SELLER:
        sellerBalance += a.balance;
        break;
      case WalletKind.TREASURY:
        treasuryBalance += a.balance;
        break;
      case WalletKind.REWARD_POOL:
        rewardPoolBalance += a.balance;
        break;
      default:
        break;
    }
  }

  const circulating = userBalance + sellerBalance;
  const pendingTopUps = await prisma.sellerTopUpRequest.count({
    where: { status: TopUpStatus.PENDING },
  });
  const approvedTopUps = await prisma.sellerTopUpRequest.aggregate({
    where: { status: TopUpStatus.APPROVED },
    _sum: { amountThb: true, amountCoin: true },
    _count: true,
  });

  const reconcile = await reconcileLedger(prisma);

  return {
    totalMintedSupply: supply.totalMinted.toString(),
    circulatingSupply: circulating.toString(),
    userBalance: userBalance.toString(),
    sellerBalance: sellerBalance.toString(),
    treasuryBalance: treasuryBalance.toString(),
    rewardPoolBalance: rewardPoolBalance.toString(),
    treasuryAndRewardPool: (treasuryBalance + rewardPoolBalance).toString(),
    totalCompanyRevenueThb: supply.totalRevenueThb.toString(),
    pendingTopUpCount: pendingTopUps,
    approvedTopUpCount: approvedTopUps._count,
    approvedTopUpCoinSum: (approvedTopUps._sum.amountCoin ?? 0n).toString(),
    ledgerHealthy: reconcile.ok,
    reconcile,
    generatedAt: new Date().toISOString(),
  };
}
