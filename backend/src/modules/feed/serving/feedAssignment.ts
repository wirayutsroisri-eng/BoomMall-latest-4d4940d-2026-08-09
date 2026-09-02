/**
 * Deterministic assignment helpers — pure so they can be reasoned about and tested
 * without a database. The same viewer must always land in the same bucket, on every
 * instance, for the whole life of an experiment.
 */

import { createHash } from 'node:crypto';

export type ExperimentVariant = {
  key: string;
  /** Relative weight; the set is normalized, so 1/1 and 50/50 behave the same. */
  weight: number;
  configVersion?: number | null;
};

/** Stable 0–9999 bucket from (salt, viewerKey). */
export function hashBucket(salt: string, viewerKey: string, buckets = 10_000): number {
  const digest = createHash('sha256').update(`${salt}:${viewerKey}`).digest();
  // 32 bits is plenty and keeps the maths inside Number's safe range.
  const value = digest.readUInt32BE(0);
  return value % buckets;
}

/** Percentage rollout for a feature flag. 0 = nobody, 100 = everybody. */
export function isInRollout(rolloutPct: number, flagKey: string, viewerKey: string): boolean {
  if (!Number.isFinite(rolloutPct) || rolloutPct <= 0) return false;
  if (rolloutPct >= 100) return true;
  return hashBucket(flagKey, viewerKey, 100) < Math.round(rolloutPct);
}

export function normalizeVariants(input: unknown): ExperimentVariant[] {
  if (!Array.isArray(input)) return [];
  const variants: ExperimentVariant[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    if (!key) continue;
    const weight = Number(row.weight);
    variants.push({
      key,
      weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
      configVersion:
        row.configVersion == null || !Number.isFinite(Number(row.configVersion))
          ? null
          : Number(row.configVersion),
    });
  }
  return variants;
}

/**
 * Picks one variant by weight. Returns null when the experiment has no usable
 * variants — callers then serve the published config, never a broken page.
 */
export function pickVariant(
  variants: ExperimentVariant[],
  salt: string,
  viewerKey: string,
): ExperimentVariant | null {
  const usable = variants.filter((v) => v.weight > 0);
  if (!usable.length) return null;
  const total = usable.reduce((sum, v) => sum + v.weight, 0);
  const bucket = hashBucket(salt, viewerKey);
  const target = (bucket / 10_000) * total;
  let cursor = 0;
  for (const variant of usable) {
    cursor += variant.weight;
    if (target < cursor) return variant;
  }
  return usable[usable.length - 1] ?? null;
}
