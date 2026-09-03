/**
 * Feed Serving V2 — default Composer / Ad rules.
 *
 * These live beside the ranking weights inside one FeedConfigVersion so a single
 * publish (and a single rollback) moves the whole algorithm, never half of it.
 */

export type FeedComposerConfig = {
  /** One ad per N organic items. */
  adDensity: number;
  /** Earliest slot an ad may occupy. */
  firstAdSlot: number;
  /** Minimum organic items between two ads. */
  minAdSpacing: number;
  /** Same creator may not repeat within this many slots. */
  creatorSpacing: number;
  maxPerCreatorPerPage: number;
  /** Same root content (original + its reshares) per page. */
  maxPerRootPost: number;
  /** Score multiplier applied to a reshare relative to its original. */
  resharePenalty: number;
  maxMentionsPerPost: number;
  seenTtlHours: number;
};

export type FeedAdConfig = {
  freqCapSession: number;
  freqCapDaily: number;
  freqCapPerCampaign: number;
  /** even = spread the budget across the day · asap = spend as fast as it fills */
  pacing: 'even' | 'asap';
};

export const DEFAULT_COMPOSER_CONFIG: FeedComposerConfig = {
  adDensity: 6,
  firstAdSlot: 3,
  minAdSpacing: 4,
  creatorSpacing: 3,
  maxPerCreatorPerPage: 2,
  maxPerRootPost: 1,
  resharePenalty: 0.85,
  maxMentionsPerPost: 30,
  seenTtlHours: 48,
};

export const DEFAULT_AD_CONFIG: FeedAdConfig = {
  freqCapSession: 3,
  freqCapDaily: 12,
  freqCapPerCampaign: 3,
  pacing: 'even',
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Never trust a stored blob: an out-of-range value must degrade, not break a page. */
export function normalizeComposerConfig(input: unknown): FeedComposerConfig {
  const raw = (input ?? {}) as Partial<Record<keyof FeedComposerConfig, unknown>>;
  const d = DEFAULT_COMPOSER_CONFIG;
  return {
    adDensity: clampInt(raw.adDensity, 2, 50, d.adDensity),
    firstAdSlot: clampInt(raw.firstAdSlot, 1, 50, d.firstAdSlot),
    minAdSpacing: clampInt(raw.minAdSpacing, 1, 50, d.minAdSpacing),
    creatorSpacing: clampInt(raw.creatorSpacing, 0, 20, d.creatorSpacing),
    maxPerCreatorPerPage: clampInt(raw.maxPerCreatorPerPage, 1, 20, d.maxPerCreatorPerPage),
    maxPerRootPost: clampInt(raw.maxPerRootPost, 1, 10, d.maxPerRootPost),
    resharePenalty: clampFloat(raw.resharePenalty, 0.1, 1, d.resharePenalty),
    maxMentionsPerPost: clampInt(raw.maxMentionsPerPost, 1, 100, d.maxMentionsPerPost),
    seenTtlHours: clampInt(raw.seenTtlHours, 1, 720, d.seenTtlHours),
  };
}

export function normalizeAdConfig(input: unknown): FeedAdConfig {
  const raw = (input ?? {}) as Partial<Record<keyof FeedAdConfig, unknown>>;
  const d = DEFAULT_AD_CONFIG;
  return {
    freqCapSession: clampInt(raw.freqCapSession, 0, 50, d.freqCapSession),
    freqCapDaily: clampInt(raw.freqCapDaily, 0, 200, d.freqCapDaily),
    freqCapPerCampaign: clampInt(raw.freqCapPerCampaign, 0, 50, d.freqCapPerCampaign),
    pacing: raw.pacing === 'asap' ? 'asap' : 'even',
  };
}
