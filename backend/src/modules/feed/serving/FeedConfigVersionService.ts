/**
 * Feed Serving V2 — versioned algorithm config, flags and experiments.
 *
 * The whole algorithm (ranking weights + composer rules + ad rules) is one
 * immutable row. Publishing writes a new version and moves the pointer; rollback
 * is the same move backwards, so a bad tune is undone without a deploy.
 *
 * Nothing here reads live traffic yet — P0·A ships the control plane only.
 */

import { randomUUID } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import {
  defaultConfig,
  getFeedConfig,
  normalizeWeights,
  type FeedPersonalizationConfigDto,
} from '../../../services/feed/FeedRankingService';
import {
  DEFAULT_AD_CONFIG,
  DEFAULT_COMPOSER_CONFIG,
  normalizeAdConfig,
  normalizeComposerConfig,
  type FeedAdConfig,
  type FeedComposerConfig,
} from './feedConfigDefaults';
import { isInRollout, normalizeVariants, pickVariant } from './feedAssignment';

export type FeedConfigVersionDto = {
  id: string;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  note: string | null;
  ranking: FeedPersonalizationConfigDto;
  composer: FeedComposerConfig;
  ad: FeedAdConfig;
  parentVersion: number | null;
  createdBy: string | null;
  createdAt: string;
  publishedAt: string | null;
  publishedBy: string | null;
};

export type ServingConfig = {
  version: number;
  ranking: FeedPersonalizationConfigDto;
  composer: FeedComposerConfig;
  ad: FeedAdConfig;
  experiment: { key: string; variant: string } | null;
  /** true when Postgres was unreachable and built-in defaults are serving. */
  degraded: boolean;
};

const CACHE_TTL_MS = 10_000;

let publishedCache: { at: number; value: FeedConfigVersionDto | null } | null = null;
let flagCache: { at: number; value: Map<string, { enabled: boolean; rolloutPct: number }> } | null = null;

export function invalidateFeedConfigCache() {
  publishedCache = null;
  flagCache = null;
}

async function prismaReady(): Promise<boolean> {
  try {
    await prisma.feedConfigVersion.findFirst({ select: { id: true } });
    return true;
  } catch {
    return false;
  }
}

type ConfigRow = {
  id: string;
  version: number;
  status: string;
  note: string | null;
  rankingJson: unknown;
  composerJson: unknown;
  adJson: unknown;
  parentVersion: number | null;
  createdBy: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  publishedBy: string | null;
};

function mapRow(row: ConfigRow): FeedConfigVersionDto {
  const ranking = row.rankingJson && typeof row.rankingJson === 'object'
    ? (row.rankingJson as FeedPersonalizationConfigDto)
    : defaultConfig();
  return {
    id: row.id,
    version: row.version,
    status: (row.status as FeedConfigVersionDto['status']) ?? 'DRAFT',
    note: row.note,
    ranking: { ...ranking, ...normalizeWeights(ranking) },
    composer: normalizeComposerConfig(row.composerJson),
    ad: normalizeAdConfig(row.adJson),
    parentVersion: row.parentVersion,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedBy: row.publishedBy,
  };
}

async function writeAudit(actor: string, action: string, version: number, detail: Record<string, unknown>) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actor,
        action,
        entityType: 'FeedConfigVersion',
        entityId: String(version),
        detailJson: detail as never,
      },
    });
  } catch {
    // An audit write must never block a rollback.
  }
}

async function nextVersionNumber(): Promise<number> {
  const top = await prisma.feedConfigVersion.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (top?.version ?? 0) + 1;
}

/**
 * Version 1 is seeded from whatever the live FeedPersonalizationConfig holds, so
 * turning versioning on never changes what viewers see.
 */
export async function ensureSeedVersion(actor = 'system'): Promise<FeedConfigVersionDto | null> {
  if (!(await prismaReady())) return null;
  const existing = await prisma.feedConfigVersion.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
  });
  if (existing) return mapRow(existing as ConfigRow);

  const live = await getFeedConfig().catch(() => defaultConfig(actor));
  const created = await prisma.feedConfigVersion.create({
    data: {
      id: randomUUID(),
      version: await nextVersionNumber(),
      status: 'PUBLISHED',
      note: 'Seeded from the live global config',
      rankingJson: live as never,
      composerJson: DEFAULT_COMPOSER_CONFIG as never,
      adJson: DEFAULT_AD_CONFIG as never,
      createdBy: actor,
      publishedAt: new Date(),
      publishedBy: actor,
    },
  });
  invalidateFeedConfigCache();
  await writeAudit(actor, 'FEED_CONFIG_SEED', created.version, {});
  return mapRow(created as ConfigRow);
}

export async function listConfigVersions(limit = 50): Promise<FeedConfigVersionDto[]> {
  if (!(await prismaReady())) return [];
  const rows = await prisma.feedConfigVersion.findMany({
    orderBy: { version: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map((row) => mapRow(row as ConfigRow));
}

export async function getPublishedVersion(): Promise<FeedConfigVersionDto | null> {
  const now = Date.now();
  if (publishedCache && now - publishedCache.at < CACHE_TTL_MS) return publishedCache.value;
  if (!(await prismaReady())) {
    publishedCache = { at: now, value: null };
    return null;
  }
  const row = await prisma.feedConfigVersion.findFirst({
    where: { status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
  });
  const value = row ? mapRow(row as ConfigRow) : await ensureSeedVersion();
  publishedCache = { at: now, value };
  return value;
}

export async function createDraft(input: {
  actor: string;
  fromVersion?: number;
  note?: string;
  ranking?: Partial<FeedPersonalizationConfigDto>;
  composer?: Partial<FeedComposerConfig>;
  ad?: Partial<FeedAdConfig>;
}): Promise<FeedConfigVersionDto> {
  if (!(await prismaReady())) throw new AppError('UNAVAILABLE', 'Feed config storage is not ready', 503);
  const base = input.fromVersion
    ? await prisma.feedConfigVersion.findUnique({ where: { version: input.fromVersion } })
    : await prisma.feedConfigVersion.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
  const parent = base ? mapRow(base as ConfigRow) : await ensureSeedVersion();
  if (!parent) throw new AppError('NOT_FOUND', 'No config version to branch from', 404);

  const ranking = { ...parent.ranking, ...(input.ranking ?? {}) };
  const created = await prisma.feedConfigVersion.create({
    data: {
      id: randomUUID(),
      version: await nextVersionNumber(),
      status: 'DRAFT',
      note: input.note?.trim() || null,
      rankingJson: { ...ranking, ...normalizeWeights(ranking) } as never,
      composerJson: normalizeComposerConfig({ ...parent.composer, ...(input.composer ?? {}) }) as never,
      adJson: normalizeAdConfig({ ...parent.ad, ...(input.ad ?? {}) }) as never,
      parentVersion: parent.version,
      createdBy: input.actor,
    },
  });
  await writeAudit(input.actor, 'FEED_CONFIG_DRAFT_CREATE', created.version, { parentVersion: parent.version });
  return mapRow(created as ConfigRow);
}

export async function updateDraft(input: {
  actor: string;
  version: number;
  note?: string;
  ranking?: Partial<FeedPersonalizationConfigDto>;
  composer?: Partial<FeedComposerConfig>;
  ad?: Partial<FeedAdConfig>;
}): Promise<FeedConfigVersionDto> {
  if (!(await prismaReady())) throw new AppError('UNAVAILABLE', 'Feed config storage is not ready', 503);
  const row = await prisma.feedConfigVersion.findUnique({ where: { version: input.version } });
  if (!row) throw new AppError('NOT_FOUND', 'Config version not found', 404);
  if (row.status !== 'DRAFT') {
    throw new AppError('VALIDATION', 'Only a draft can be edited — publish creates a new version', 400);
  }
  const current = mapRow(row as ConfigRow);
  const ranking = { ...current.ranking, ...(input.ranking ?? {}) };
  const updated = await prisma.feedConfigVersion.update({
    where: { version: input.version },
    data: {
      note: input.note?.trim() ?? current.note,
      rankingJson: { ...ranking, ...normalizeWeights(ranking) } as never,
      composerJson: normalizeComposerConfig({ ...current.composer, ...(input.composer ?? {}) }) as never,
      adJson: normalizeAdConfig({ ...current.ad, ...(input.ad ?? {}) }) as never,
    },
  });
  await writeAudit(input.actor, 'FEED_CONFIG_DRAFT_UPDATE', input.version, {});
  return mapRow(updated as ConfigRow);
}

/** Publishing archives the version that was live, so history stays walkable. */
export async function publishVersion(input: { actor: string; version: number }): Promise<FeedConfigVersionDto> {
  if (!(await prismaReady())) throw new AppError('UNAVAILABLE', 'Feed config storage is not ready', 503);
  const target = await prisma.feedConfigVersion.findUnique({ where: { version: input.version } });
  if (!target) throw new AppError('NOT_FOUND', 'Config version not found', 404);
  if (target.status === 'PUBLISHED') return mapRow(target as ConfigRow);

  const published = await prisma.$transaction(async (tx) => {
    const previous = await tx.feedConfigVersion.findFirst({
      where: { status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
    if (previous) {
      await tx.feedConfigVersion.update({ where: { version: previous.version }, data: { status: 'ARCHIVED' } });
    }
    return tx.feedConfigVersion.update({
      where: { version: input.version },
      data: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: input.actor },
    });
  });

  invalidateFeedConfigCache();
  await writeAudit(input.actor, 'FEED_CONFIG_PUBLISH', input.version, {});
  return mapRow(published as ConfigRow);
}

/** Rollback republishes an older version as-is. It never mutates history. */
export async function rollbackTo(input: { actor: string; version: number }): Promise<FeedConfigVersionDto> {
  if (!(await prismaReady())) throw new AppError('UNAVAILABLE', 'Feed config storage is not ready', 503);
  const target = await prisma.feedConfigVersion.findUnique({ where: { version: input.version } });
  if (!target) throw new AppError('NOT_FOUND', 'Config version not found', 404);
  if (target.status === 'DRAFT') {
    throw new AppError('VALIDATION', 'Cannot roll back to a draft — publish it instead', 400);
  }
  const restored = await publishVersion({ actor: input.actor, version: input.version });
  await writeAudit(input.actor, 'FEED_CONFIG_ROLLBACK', input.version, {});
  return restored;
}

export async function listConfigAudit(limit = 100) {
  if (!(await prismaReady())) return [];
  return prisma.adminAuditLog.findMany({
    where: { entityType: 'FeedConfigVersion' },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });
}

// ─── Flags / kill switches ───────────────────────────────────────────────────

async function loadFlags() {
  const now = Date.now();
  if (flagCache && now - flagCache.at < CACHE_TTL_MS) return flagCache.value;
  const map = new Map<string, { enabled: boolean; rolloutPct: number }>();
  if (await prismaReady()) {
    try {
      const rows = await prisma.feedFlag.findMany();
      for (const row of rows) map.set(row.key, { enabled: row.enabled, rolloutPct: row.rolloutPct });
    } catch {
      // Missing table (pre-migration) behaves exactly like "every flag is off".
    }
  }
  flagCache = { at: now, value: map };
  return map;
}

/**
 * A flag is on for a viewer when it is enabled AND the viewer falls inside the
 * rollout percentage. `rolloutPct` 0 with `enabled` true means staff-only rollouts
 * can be driven purely by percentage later without flipping the switch back.
 */
export async function isFlagEnabled(key: string, viewerKey = 'anonymous'): Promise<boolean> {
  const flags = await loadFlags();
  const flag = flags.get(key);
  if (!flag || !flag.enabled) return false;
  if (flag.rolloutPct >= 100) return true;
  return isInRollout(flag.rolloutPct, key, viewerKey);
}

export async function listFlags() {
  if (!(await prismaReady())) return [];
  return prisma.feedFlag.findMany({ orderBy: { key: 'asc' } });
}

export async function setFlag(input: {
  actor: string;
  key: string;
  enabled: boolean;
  rolloutPct?: number;
  payload?: Record<string, unknown>;
}) {
  if (!(await prismaReady())) throw new AppError('UNAVAILABLE', 'Feed config storage is not ready', 503);
  const rolloutPct = Math.min(100, Math.max(0, Math.round(input.rolloutPct ?? 0)));
  const row = await prisma.feedFlag.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      enabled: input.enabled,
      rolloutPct,
      payloadJson: (input.payload ?? {}) as never,
      updatedBy: input.actor,
    },
    update: {
      enabled: input.enabled,
      rolloutPct,
      ...(input.payload ? { payloadJson: input.payload as never } : {}),
      updatedBy: input.actor,
    },
  });
  invalidateFeedConfigCache();
  await writeAudit(input.actor, 'FEED_FLAG_SET', 0, { key: input.key, enabled: input.enabled, rolloutPct });
  return row;
}

/** One call, one effect: everything under `scope` stops serving immediately. */
export async function killSwitch(input: { actor: string; scope: string }) {
  return setFlag({ actor: input.actor, key: input.scope, enabled: false, rolloutPct: 0 });
}

// ─── Experiments ─────────────────────────────────────────────────────────────

export async function listExperiments() {
  if (!(await prismaReady())) return [];
  return prisma.feedExperiment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
}

export async function upsertExperiment(input: {
  actor: string;
  key: string;
  status?: 'DRAFT' | 'RUNNING' | 'STOPPED';
  salt?: string;
  surface?: string | null;
  variants: unknown;
  startAt?: string | null;
  endAt?: string | null;
}) {
  if (!(await prismaReady())) throw new AppError('UNAVAILABLE', 'Feed config storage is not ready', 503);
  const variants = normalizeVariants(input.variants);
  if (!variants.length) throw new AppError('VALIDATION', 'At least one variant is required', 400);
  const data = {
    status: input.status ?? 'DRAFT',
    salt: input.salt?.trim() || input.key,
    surface: input.surface ?? null,
    variantsJson: variants as never,
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
  };
  const row = await prisma.feedExperiment.upsert({
    where: { key: input.key },
    create: { id: randomUUID(), key: input.key, createdBy: input.actor, ...data },
    update: data,
  });
  await writeAudit(input.actor, 'FEED_EXPERIMENT_UPSERT', 0, { key: input.key, status: data.status });
  return row;
}

/**
 * Resolves the exact config a viewer should be served, including any experiment
 * override. Callers pin the result to the feed session so the algorithm never
 * changes underneath someone mid-scroll.
 */
export async function resolveServingConfig(input: {
  viewerKey: string;
  surface?: string;
  at?: Date;
}): Promise<ServingConfig> {
  const published = await getPublishedVersion();
  const fallbackRanking = defaultConfig();
  const base: ServingConfig = {
    version: published?.version ?? 0,
    ranking: published?.ranking ?? { ...fallbackRanking, ...normalizeWeights(fallbackRanking) },
    composer: published?.composer ?? DEFAULT_COMPOSER_CONFIG,
    ad: published?.ad ?? DEFAULT_AD_CONFIG,
    experiment: null,
    degraded: !published,
  };
  if (!(await prismaReady())) return base;

  const now = input.at ?? new Date();
  let running: Awaited<ReturnType<typeof prisma.feedExperiment.findMany>> = [];
  try {
    running = await prisma.feedExperiment.findMany({ where: { status: 'RUNNING' }, take: 20 });
  } catch {
    return base;
  }

  for (const experiment of running) {
    if (experiment.surface && input.surface && experiment.surface !== input.surface) continue;
    if (experiment.startAt && experiment.startAt > now) continue;
    if (experiment.endAt && experiment.endAt < now) continue;
    const variant = pickVariant(normalizeVariants(experiment.variantsJson), experiment.salt, input.viewerKey);
    if (!variant) continue;

    let overrides: FeedConfigVersionDto | null = null;
    if (variant.configVersion) {
      const row = await prisma.feedConfigVersion.findUnique({ where: { version: variant.configVersion } });
      overrides = row ? mapRow(row as ConfigRow) : null;
    }
    return {
      version: overrides?.version ?? base.version,
      ranking: overrides?.ranking ?? base.ranking,
      composer: overrides?.composer ?? base.composer,
      ad: overrides?.ad ?? base.ad,
      experiment: { key: experiment.key, variant: variant.key },
      degraded: base.degraded,
    };
  }

  return base;
}
