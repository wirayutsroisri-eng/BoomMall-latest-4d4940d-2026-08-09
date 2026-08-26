import { PrismaClient } from '@prisma/client';

/** Marketplace and community metrics for the admin dashboard. */
export async function getDashboardStats(prisma: PrismaClient) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [dauGroup, paidAgg, popularPosts, userCount, postCount] = await Promise.all([
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
  return {
    dau24h: dauGroup.length,
    gmvPaidThb: paidAgg._sum.merchandiseThb ?? 0,
    gpCollectedThb: paidAgg._sum.gpAmountThb ?? 0,
    netToMerchantThb: paidAgg._sum.netToMerchantThb ?? 0,
    paidOrderCount: paidAgg._count,
    userCount,
    postCount,
    popularPosts,
    generatedAt: new Date().toISOString(),
  };
}
