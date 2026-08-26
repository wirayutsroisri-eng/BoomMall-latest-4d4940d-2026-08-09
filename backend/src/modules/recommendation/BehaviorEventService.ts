import type { InterestSource } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { DEFAULT_EVENT_WEIGHTS, getRecommendationConfig } from './RecommendationConfigService';
import { invalidateInterestProfile } from './InterestProfileService';
import { normalizeTag, weightedArray, type WeightedInterest } from './interestTypes';

export const BEHAVIOR_EVENTS = Object.keys(DEFAULT_EVENT_WEIGHTS);

const EVENT_SOURCE: Record<string, InterestSource> = {
  USER_SEARCHED: 'SEARCH', CONTENT_VIEWED: 'VIEW', PRODUCT_VIEWED: 'VIEW', SECONDHAND_VIEWED: 'VIEW',
  JOB_VIEWED: 'JOB', SERVICE_VIEWED: 'SERVICE', CONTENT_LIKED: 'LIKE', LISTING_SAVED: 'SAVE',
  CONTENT_SHARED: 'SHARE', SELLER_CONTACTED: 'CHAT', JOB_APPLIED: 'JOB', PRODUCT_PURCHASED: 'PURCHASE',
  PRODUCT_LISTED: 'SELL', CONTENT_SKIPPED: 'NEGATIVE', CONTENT_HIDDEN: 'NEGATIVE',
  CREATOR_BLOCKED: 'NEGATIVE', CONTENT_REPORTED: 'NEGATIVE', REPEATED_IMPRESSION_IGNORED: 'NEGATIVE',
};

function tokenize(text: string) {
  return [...new Set(text.normalize('NFKC').split(/[\s,;#|/]+/).map((v) => v.trim()).filter((v) => v.length > 1))].slice(0, 12);
}

async function contentTags(contentId?: string, contentType?: string) {
  if (!contentId) return [];
  if (contentType === 'PRODUCT' || contentType === 'SERVICE') {
    const row = await prisma.catalogItem.findUnique({ where: { id: contentId }, select: { title: true, description: true, metadataJson: true } });
    if (!row) return [];
    const meta = row.metadataJson as Record<string, unknown>;
    return [...tokenize(`${row.title} ${row.description ?? ''}`), ...((Array.isArray(meta.tags) ? meta.tags : []).map(String))];
  }
  const row = await prisma.socialPost.findUnique({ where: { id: contentId }, select: { body: true, tagsJson: true, locationLabel: true } });
  return row ? [...tokenize(row.body), ...(Array.isArray(row.tagsJson) ? row.tagsJson.map(String) : []), ...(row.locationLabel ? [row.locationLabel] : [])] : [];
}

function mergeInterests(current: WeightedInterest[], tags: string[], delta: number, source: string, halfLifeDays: number, occurredAt: Date) {
  const now = occurredAt.getTime();
  const byTag = new Map(current.map((item) => [item.normalizedTag, { ...item }]));
  for (const item of byTag.values()) {
    const ageDays = Math.max(0, (now - new Date(item.lastSeenAt).getTime()) / 86_400_000);
    item.weight *= Math.pow(0.5, ageDays / halfLifeDays);
  }
  for (const tag of tags) {
    const normalizedTag = normalizeTag(tag);
    if (!normalizedTag) continue;
    const old = byTag.get(normalizedTag);
    byTag.set(normalizedTag, {
      tag: old?.tag ?? tag.trim(), normalizedTag,
      weight: Math.max(-5, Math.min(10, (old?.weight ?? 0) + delta)), source,
      lastSeenAt: occurredAt.toISOString(),
    });
  }
  return [...byTag.values()].filter((v) => Math.abs(v.weight) >= 0.02).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 100);
}

export async function recordBehaviorEvent(userId: string, input: Record<string, unknown>) {
  const eventType = String(input.eventType ?? '').toUpperCase();
  if (!BEHAVIOR_EVENTS.includes(eventType)) throw new AppError('VALIDATION', 'eventType ไม่รองรับ', 400);
  const config = await getRecommendationConfig();
  const configured = config.eventWeightsJson as Record<string, unknown>;
  let delta = Number(configured[eventType] ?? DEFAULT_EVENT_WEIGHTS[eventType as keyof typeof DEFAULT_EVENT_WEIGHTS]);
  const durationMs = input.durationMs == null ? undefined : Math.max(0, Math.min(Number(input.durationMs), 3_600_000));
  if (eventType === 'CONTENT_VIEWED' && durationMs != null) delta *= Math.min(2, Math.max(0.25, durationMs / 10_000));
  if (delta < 0) delta *= config.negativeSignalWeight;
  const occurredAt = input.occurredAt ? new Date(String(input.occurredAt)) : new Date();
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 60_000) throw new AppError('VALIDATION', 'occurredAt ไม่ถูกต้อง', 400);
  const contentId = input.contentId ? String(input.contentId) : undefined;
  const contentType = input.contentType ? String(input.contentType).toUpperCase() : undefined;
  const suppliedTags = Array.isArray(input.tags) ? input.tags.map(String) : [];
  const query = input.query ? String(input.query).trim().slice(0, 200) : undefined;
  const tags = [...new Set([...suppliedTags, ...(query ? tokenize(query) : []), ...(await contentTags(contentId, contentType))])].slice(0, 30);
  const source = EVENT_SOURCE[eventType];
  const metadata = input.metadata && typeof input.metadata === 'object'
    ? input.metadata as Record<string, unknown>
    : {};
  const location = typeof metadata.location === 'string' ? metadata.location.trim() : '';

  const profile = await prisma.userInterestProfile.upsert({ where: { userId }, create: { userId }, update: {} });
  const target = source === 'SEARCH' ? 'searchInterestsJson' : 'behavioralInterestsJson';
  const next = mergeInterests(weightedArray(profile[target]), tags, delta, source, config.decayHalfLifeDays, occurredAt);
  const nextLocations = location
    ? mergeInterests(weightedArray(profile.locationPreferencesJson), [location], Math.max(0.1, Math.abs(delta)), source, config.decayHalfLifeDays, occurredAt)
    : undefined;
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.behaviorEvent.create({ data: {
      userId, eventType, contentId, contentType, tagsJson: tags, query, source, weightDelta: delta,
      durationMs: durationMs == null || !Number.isFinite(durationMs) ? undefined : Math.round(durationMs),
      metadataJson: metadata as any, occurredAt,
    }});
    await tx.userInterestProfile.update({ where: { userId }, data: {
      [target]: next,
      locationPreferencesJson: nextLocations,
      vectorVersion: { increment: 1 },
    } });
    return created;
  });
  invalidateInterestProfile(userId);
  return { id: event.id, accepted: true, eventType, learnedTags: tags.length };
}
