/**
 * Feed Serving V2 — signal ingest.
 *
 * Writes raw viewer signals only. The ranker never reads this table; the hourly
 * rollup does. Ingest is idempotent so a client retry after a dropped response
 * can never inflate a post's watch time.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import {
  normalizeFeedEventBatch,
  type NormalizedFeedEvent,
} from './feedEventSchema';

export type IngestResult = { accepted: number; dropped: number; stored: boolean };

async function prismaReady(): Promise<boolean> {
  try {
    await prisma.feedEvent.findFirst({ select: { id: true } });
    return true;
  } catch {
    return false;
  }
}

export async function ingestFeedEvents(input: {
  sessionId: string;
  userId?: string | null;
  events: unknown;
}): Promise<IngestResult> {
  const sessionId = input.sessionId.trim().slice(0, 100);
  if (!sessionId) return { accepted: 0, dropped: 0, stored: false };

  const { events, dropped } = normalizeFeedEventBatch(input.events);
  if (!events.length) return { accepted: 0, dropped, stored: false };
  if (!(await prismaReady())) return { accepted: 0, dropped, stored: false };

  const rows = events.map((event: NormalizedFeedEvent) => ({
    id: randomUUID(),
    sessionId,
    userId: input.userId ?? null,
    itemId: event.itemId,
    rootId: event.rootId,
    itemKind: event.itemKind,
    slot: event.slot,
    type: event.type,
    action: event.action,
    watchMs: event.watchMs,
    videoMs: event.videoMs,
    dwellMs: event.dwellMs,
    completed: event.completed,
    rankToken: event.rankToken,
    configVersion: event.configVersion,
    variant: event.variant,
    seq: event.seq,
  }));

  // skipDuplicates leans on the (sessionId, itemId, type, seq) unique index:
  // a replayed batch lands as a no-op instead of double-counting.
  const result = await prisma.feedEvent.createMany({ data: rows, skipDuplicates: true });
  return { accepted: result.count, dropped, stored: true };
}

// ─── Rollup ──────────────────────────────────────────────────────────────────

function dayKey(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

type Bucket = {
  postId: string;
  day: Date;
  impressions: number;
  watchMsSum: bigint;
  completes: number;
  skips: number;
  likes: number;
  comments: number;
  shares: number;
};

function emptyBucket(postId: string, day: Date): Bucket {
  return {
    postId,
    day,
    impressions: 0,
    watchMsSum: 0n,
    completes: 0,
    skips: 0,
    likes: 0,
    comments: 0,
    shares: 0,
  };
}

/**
 * Folds raw events into per-post, per-day features.
 *
 * Signals are credited to `rootId` when present, so a clip's watch time stays on
 * the original instead of scattering across every reshare of it.
 */
export function foldEventsIntoBuckets(
  events: Array<{
    itemId: string;
    rootId: string | null;
    type: string;
    action: string | null;
    watchMs: number;
    completed: boolean;
    createdAt: Date;
  }>,
): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const event of events) {
    const postId = event.rootId ?? event.itemId;
    const day = dayKey(event.createdAt);
    const key = `${postId}:${day.toISOString()}`;
    const bucket = buckets.get(key) ?? emptyBucket(postId, day);
    if (event.type === 'impression') bucket.impressions += 1;
    if (event.type === 'watch') {
      bucket.watchMsSum += BigInt(Math.max(0, event.watchMs));
      if (event.completed) bucket.completes += 1;
    }
    if (event.type === 'skip') bucket.skips += 1;
    if (event.type === 'engage') {
      if (event.action === 'like') bucket.likes += 1;
      if (event.action === 'comment') bucket.comments += 1;
      if (event.action === 'repost' || event.action === 'share_chat' || event.action === 'share_link') {
        bucket.shares += 1;
      }
    }
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

/**
 * Engagement per impression, clamped to 0–1. Used as the CTR-style term for
 * static posts and as a quality floor for clips.
 */
export function bucketCtr(bucket: Pick<Bucket, 'impressions' | 'likes' | 'comments' | 'shares'>): number {
  if (bucket.impressions <= 0) return 0;
  const engagements = bucket.likes + bucket.comments + bucket.shares;
  return Math.min(1, engagements / bucket.impressions);
}

/** Watch-through rate, or engagement when the post has no video. */
export function bucketQuality(bucket: Bucket): number {
  if (bucket.impressions <= 0) return 0;
  const completionRate = bucket.completes / bucket.impressions;
  const skipRate = bucket.skips / bucket.impressions;
  const score = 0.6 * completionRate + 0.4 * bucketCtr(bucket) - 0.3 * skipRate;
  return Math.min(1, Math.max(0, score));
}

/**
 * Rebuilds the rollup for a time window. Safe to re-run: each bucket is written
 * with the recomputed totals for that day rather than incremented.
 */
export async function runPostMetricsRollup(input?: { since?: Date; batchSize?: number }) {
  if (!(await prismaReady())) return { buckets: 0, events: 0, stored: false };
  const since = input?.since ?? new Date(Date.now() - 2 * 60 * 60 * 1000);
  const take = Math.min(Math.max(input?.batchSize ?? 20_000, 1), 100_000);

  const events = await prisma.feedEvent.findMany({
    where: { createdAt: { gte: since } },
    select: {
      itemId: true,
      rootId: true,
      type: true,
      action: true,
      watchMs: true,
      completed: true,
      createdAt: true,
    },
    take,
    orderBy: { createdAt: 'asc' },
  });
  if (!events.length) return { buckets: 0, events: 0, stored: true };

  const buckets = foldEventsIntoBuckets(events);
  for (const bucket of buckets) {
    const data = {
      impressions: bucket.impressions,
      watchMsSum: bucket.watchMsSum,
      completes: bucket.completes,
      skips: bucket.skips,
      likes: bucket.likes,
      comments: bucket.comments,
      shares: bucket.shares,
      ctr: bucketCtr(bucket),
      qualityScore: bucketQuality(bucket),
    };
    await prisma.postMetricsRollup.upsert({
      where: { postId_day: { postId: bucket.postId, day: bucket.day } },
      create: { postId: bucket.postId, day: bucket.day, ...data },
      update: data,
    });
  }
  return { buckets: buckets.length, events: events.length, stored: true };
}

/** Raw signals are kept for 30 days; the rollup is the permanent record. */
export async function pruneFeedEvents(retentionDays = 30) {
  if (!(await prismaReady())) return { deleted: 0 };
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.feedEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { deleted: result.count };
}
