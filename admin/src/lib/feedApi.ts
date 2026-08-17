import { getActor, getApiKey } from './api';

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  headers.set('X-Admin-Actor', getActor());
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export type FeedConfig = {
  id: string;
  interestMatchWeight: number;
  watchTimeWeight: number;
  freshnessWeight: number;
  creatorDiversityWeight: number;
  systemSignalsWeight: number;
  boostNewCreators: boolean;
  exploreNewInterests: boolean;
  reduceRepeatedContent: boolean;
  reduceLowQuality: boolean;
  geoProximityBoost: boolean;
  downrankReported: boolean;
  prioritizeEnergyPush: boolean;
  hideOutOfStock: boolean;
  updatedAt: string;
  updatedBy?: string | null;
  cacheFlush?: { memoryCleared: number; redis: string; detail?: string };
};

export type FeedPreset = {
  id: string;
  name: string;
  configJson: FeedConfig;
  isActive: boolean;
};

export type RankedPreviewItem = {
  id: string;
  authorHandle: string;
  caption: string;
  score: number;
  rank: number;
  flags: string[];
  contentType?: string;
  productName?: string;
  shopName?: string;
  locationLabel?: string;
  location?: string;
  priceThb?: number;
  energyPush: boolean;
  inStock: boolean;
  reportCount?: number;
  breakdown: {
    interest: number;
    engagement: number;
    engagementMode: 'watch' | 'dwell_ctr';
    freshness: number;
    creatorDiversity: number;
    personalizationScore: number;
    systemMultiplier: number;
    safetyFactor: number;
    geoMultiplier: number;
  };
};

export type FeedUiWeights = {
  interestMatch: number;
  watchTime: number;
  freshness: number;
  creatorDiversity: number;
  systemSignals: number;
};

export type FeedUiToggles = {
  boostNewCreators: boolean;
  exploreNewInterests: boolean;
  reduceRepeated: boolean;
  reduceLowQuality: boolean;
  geoProximityBoost: boolean;
  downrankReported: boolean;
  prioritizeEnergyPush: boolean;
  hideOutOfStock: boolean;
};

export type PersonalUiKey = 'interestMatch' | 'watchTime' | 'freshness' | 'creatorDiversity';

const PERSONALIZATION_PCT = 75;
const SYSTEM_PCT = 25;

const UI_TO_API: Record<PersonalUiKey, string> = {
  interestMatch: 'interestMatchWeight',
  watchTime: 'watchTimeWeight',
  freshness: 'freshnessWeight',
  creatorDiversity: 'creatorDiversityWeight',
};

/** Client-side mirror of backend normalize (locked slider rebalances others to 75%) */
export function rebalanceUiWeights(
  weights: FeedUiWeights,
  locked: PersonalUiKey,
  nextValue: number,
): FeedUiWeights {
  const lockedVal = Math.max(0, Math.min(PERSONALIZATION_PCT, Math.round(nextValue)));
  const keys: PersonalUiKey[] = ['interestMatch', 'watchTime', 'freshness', 'creatorDiversity'];
  const unlocked = keys.filter((k) => k !== locked);
  const remaining = PERSONALIZATION_PCT - lockedVal;
  const unlockedSum = unlocked.reduce((s, k) => s + weights[k], 0);
  const next: FeedUiWeights = {
    ...weights,
    [locked]: lockedVal,
    systemSignals: SYSTEM_PCT,
  };
  if (unlockedSum <= 0) {
    const each = Math.floor(remaining / unlocked.length);
    unlocked.forEach((k, i) => {
      next[k] = i === unlocked.length - 1 ? remaining - each * (unlocked.length - 1) : each;
    });
  } else {
    let used = 0;
    unlocked.forEach((k, i) => {
      if (i === unlocked.length - 1) {
        next[k] = Math.max(0, remaining - used);
      } else {
        const v = Math.round((weights[k] / unlockedSum) * remaining);
        next[k] = v;
        used += v;
      }
    });
  }
  return next;
}

export function configToUi(c: FeedConfig): { weights: FeedUiWeights; toggles: FeedUiToggles } {
  return {
    weights: {
      interestMatch: Math.round(c.interestMatchWeight * 100),
      watchTime: Math.round(c.watchTimeWeight * 100),
      freshness: Math.round(c.freshnessWeight * 100),
      creatorDiversity: Math.round(c.creatorDiversityWeight * 100),
      systemSignals: SYSTEM_PCT,
    },
    toggles: {
      boostNewCreators: c.boostNewCreators,
      exploreNewInterests: c.exploreNewInterests,
      reduceRepeated: c.reduceRepeatedContent,
      reduceLowQuality: c.reduceLowQuality,
      geoProximityBoost: c.geoProximityBoost,
      downrankReported: c.downrankReported,
      prioritizeEnergyPush: c.prioritizeEnergyPush,
      hideOutOfStock: c.hideOutOfStock,
    },
  };
}

export function uiToConfigPayload(
  weights: FeedUiWeights,
  toggles: FeedUiToggles,
  locked?: PersonalUiKey,
): Partial<FeedConfig> & { lockedKey?: string } {
  return {
    interestMatchWeight: weights.interestMatch / 100,
    watchTimeWeight: weights.watchTime / 100,
    freshnessWeight: weights.freshness / 100,
    creatorDiversityWeight: weights.creatorDiversity / 100,
    systemSignalsWeight: SYSTEM_PCT / 100,
    boostNewCreators: toggles.boostNewCreators,
    exploreNewInterests: toggles.exploreNewInterests,
    reduceRepeatedContent: toggles.reduceRepeated,
    reduceLowQuality: toggles.reduceLowQuality,
    geoProximityBoost: toggles.geoProximityBoost,
    downrankReported: toggles.downrankReported,
    prioritizeEnergyPush: toggles.prioritizeEnergyPush,
    hideOutOfStock: toggles.hideOutOfStock,
    lockedKey: locked ? UI_TO_API[locked] : undefined,
  };
}

export function fetchFeedConfig() {
  return req<{ ok: true; data: FeedConfig }>('/api/v1/admin/feed-config');
}

export function saveFeedConfig(payload: Partial<FeedConfig> & { lockedKey?: string }) {
  return req<{ ok: true; data: FeedConfig }>('/api/v1/admin/feed-config', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function fetchFeedPresets() {
  return req<{ ok: true; data: FeedPreset[] }>('/api/v1/admin/feed-config/presets');
}

export function applyFeedPreset(id: string) {
  return req<{ ok: true; data: { config: FeedConfig; preset: FeedPreset } }>(
    `/api/v1/admin/feed-config/preset/${encodeURIComponent(id)}`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function previewFeed(payload: {
  config?: Partial<FeedConfig>;
  lockedKey?: string;
  userId?: string;
  sampleLocation?: string;
  limit?: number;
}) {
  return req<{
    ok: true;
    data: { items: RankedPreviewItem[]; meta: Record<string, unknown> };
  }>('/api/v1/admin/feed-config/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
