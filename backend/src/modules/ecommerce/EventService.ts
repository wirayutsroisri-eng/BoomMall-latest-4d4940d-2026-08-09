import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export type AnalyticsEventInput = {
  userId?: string;
  name: string;
  entityType?: string;
  entityId?: string;
  payload?: unknown;
};

export async function recordAnalyticsEvent(input: AnalyticsEventInput) {
  const name = input.name.trim();
  if (!name) return { ok: false as const };
  try {
    const row = await prisma.analyticsEvent.create({
      data: {
        userId: input.userId?.trim() || null,
        name,
        entityType: input.entityType?.trim() || null,
        entityId: input.entityId?.trim() || null,
        payloadJson: (input.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
    return {
      ok: true as const,
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  } catch {
    return { ok: false as const };
  }
}

export async function summarizeAnalytics(hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await prisma.analyticsEvent.groupBy({
    by: ['name'],
    where: { createdAt: { gte: since } },
    _count: { id: true },
  });
  const recent = await prisma.analyticsEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  const total = rows.reduce((n, r) => n + r._count.id, 0);
  return {
    hours,
    total,
    byName: rows
      .map((r) => ({ name: r.name, count: r._count.id }))
      .sort((a, b) => b.count - a.count),
    recent: recent.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      entityType: r.entityType,
      entityId: r.entityId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
