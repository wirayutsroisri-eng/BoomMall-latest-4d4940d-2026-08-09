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

  const since = new Date(Date.now() - 24 * 3600_000);
  let dau = 0;
  let gmvPaidThb = 0;
  let gpCollectedThb = 0;
  let netToMerchantThb = 0;
  let paidOrderCount = 0;
  let popularPosts: Array<{ id: string; body: string; likeCount: number; commentCount: number }> = [];
  let userCount = 0;
  let postCount = 0;
  try {
    const [dauGroup, paidAgg, posts, users, allPosts] = await Promise.all([
      prisma.analyticsEvent.groupBy({
        by: ['userId'],
        where: { name: 'session.active', createdAt: { gte: since }, userId: { not: null } },
      }),
      prisma.commerceOrder.aggregate({
        where: { status: 'PAID' },
        _sum: { merchandiseThb: true, gpAmountThb: true, netToMerchantThb: true },
        _count: true,
      }),
      prisma.socialPost.findMany({
        where: { status: 'ACTIVE' },
        orderBy: [{ likeCount: 'desc' }, { commentCount: 'desc' }],
        take: 5,
        select: { id: true, body: true, likeCount: true, commentCount: true },
      }),
      prisma.userProfile.count(),
      prisma.socialPost.count({ where: { status: 'ACTIVE' } }),
    ]);
    dau = dauGroup.length;
    gmvPaidThb = paidAgg._sum.merchandiseThb ?? 0;
    gpCollectedThb = paidAgg._sum.gpAmountThb ?? 0;
    netToMerchantThb = paidAgg._sum.netToMerchantThb ?? 0;
    paidOrderCount = paidAgg._count;
    popularPosts = posts;
    userCount = users;
    postCount = allPosts;
  } catch {
    /* tables may not exist yet */
  }

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
    dau24h: dau,
    gmvPaidThb,
    gpCollectedThb,
    netToMerchantThb,
    paidOrderCount,
    userCount,
    postCount,
    popularPosts,
    generatedAt: new Date().toISOString(),
  };
}
