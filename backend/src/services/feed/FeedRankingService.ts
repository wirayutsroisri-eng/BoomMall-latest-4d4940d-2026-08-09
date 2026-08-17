/**
 * Feed Ranking & Personalization Engine
 *
 * A. Personalization weights always normalize to exactly 0.75 (system 0.25 reserved)
 * B. Video → Watch Time; image/text/product → Dwell Time + CTR
 * C. Final Score = personalizationScore * systemMultiplier * safetyFactor [* geo 1.25]
 *
 * Persistence: Prisma when ready, else data/feed-personalization.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { listContentActions, listReports } from '../moderation';
import { flushFeedRankingCache } from './feedRankingCache';
import { getCachedPromotedProductIds } from '../../modules/ecommerce/ProductPromotionService';

export const PERSONALIZATION_TARGET = 0.75;
export const SYSTEM_SIGNALS_RESERVED = 0.25;

export type FeedPersonalizationConfigDto = {
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
};

export type FeedPresetDto = {
  id: string;
  name: string;
  configJson: FeedPersonalizationConfigDto;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PersonalWeightKey =
  | 'interestMatchWeight'
  | 'watchTimeWeight'
  | 'freshnessWeight'
  | 'creatorDiversityWeight';

export type FeedContentType = 'video' | 'image' | 'text' | 'product';

export type RankableFeedItem = {
  id: string;
  authorId: string;
  authorHandle: string;
  caption: string;
  tags: string[];
  createdAt: string;
  contentType: FeedContentType;
  watchSeconds: number;
  dwellSeconds: number;
  /** Click-through rate 0–1 (static posts) */
  ctr: number;
  reportCount: number;
  likes: number;
  comments: number;
  isNewCreator: boolean;
  qualityScore: number;
  inStock: boolean;
  stockQty: number;
  energyPush: boolean;
  isAd: boolean;
  productId?: string;
  /** Exact location label for geo string match */
  location: string;
  lat?: number;
  lng?: number;
  locationLabel?: string;
  productName?: string;
  shopName?: string;
  priceThb?: number;
};

export type RankedFeedItem = RankableFeedItem & {
  score: number;
  rank: number;
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
  flags: string[];
};

export type ViewerContext = {
  userId?: string;
  interests?: string[];
  location?: string;
  sampleLocation?: string;
  lat?: number;
  lng?: number;
  seenAuthorIds?: string[];
  seenContentIds?: string[];
};

type StoreShape = {
  config: FeedPersonalizationConfigDto;
  presets: FeedPresetDto[];
};

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'feed-personalization.json');
const GLOBAL_ID = 'GLOBAL_CONFIG';

const PERSONAL_KEYS: PersonalWeightKey[] = [
  'interestMatchWeight',
  'watchTimeWeight',
  'freshnessWeight',
  'creatorDiversityWeight',
];

/** Chanthaburi city center — default geo reference */
export const CHANTHABURI = { lat: 12.6113, lng: 102.1039 };

function iso(d: Date | string = new Date()) {
  return typeof d === 'string' ? d : d.toISOString();
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

export function defaultConfig(actor = 'system'): FeedPersonalizationConfigDto {
  return {
    id: GLOBAL_ID,
    interestMatchWeight: 0.35,
    watchTimeWeight: 0.25,
    freshnessWeight: 0.1,
    creatorDiversityWeight: 0.05,
    systemSignalsWeight: SYSTEM_SIGNALS_RESERVED,
    boostNewCreators: true,
    exploreNewInterests: true,
    reduceRepeatedContent: true,
    reduceLowQuality: true,
    geoProximityBoost: true,
    downrankReported: true,
    prioritizeEnergyPush: true,
    hideOutOfStock: true,
    updatedAt: iso(),
    updatedBy: actor,
  };
}

/**
 * A. Slider Normalization — personalization sums to exactly 0.75; system reserved 0.25.
 * When lockedKey is set, that slider stays and the other three re-balance into the remainder.
 */
export function normalizeWeights(
  input: Partial<FeedPersonalizationConfigDto>,
  lockedKey?: PersonalWeightKey,
): Pick<
  FeedPersonalizationConfigDto,
  | 'interestMatchWeight'
  | 'watchTimeWeight'
  | 'freshnessWeight'
  | 'creatorDiversityWeight'
  | 'systemSignalsWeight'
> {
  const base = defaultConfig();
  const values: Record<PersonalWeightKey, number> = {
    interestMatchWeight: clamp01(input.interestMatchWeight ?? base.interestMatchWeight),
    watchTimeWeight: clamp01(input.watchTimeWeight ?? base.watchTimeWeight),
    freshnessWeight: clamp01(input.freshnessWeight ?? base.freshnessWeight),
    creatorDiversityWeight: clamp01(input.creatorDiversityWeight ?? base.creatorDiversityWeight),
  };

  if (lockedKey) {
    const locked = Math.min(PERSONALIZATION_TARGET, Math.max(0, values[lockedKey]));
    values[lockedKey] = locked;
    const remaining = PERSONALIZATION_TARGET - locked;
    const unlocked = PERSONAL_KEYS.filter((k) => k !== lockedKey);
    const unlockedSum = unlocked.reduce((s, k) => s + values[k], 0);
    if (unlockedSum <= 0) {
      const each = remaining / unlocked.length;
      for (const k of unlocked) values[k] = each;
    } else {
      for (const k of unlocked) values[k] = (values[k] / unlockedSum) * remaining;
    }
  } else {
    const sum = PERSONAL_KEYS.reduce((s, k) => s + values[k], 0);
    if (sum <= 0) {
      values.interestMatchWeight = 0.35;
      values.watchTimeWeight = 0.25;
      values.freshnessWeight = 0.1;
      values.creatorDiversityWeight = 0.05;
    } else {
      const scale = PERSONALIZATION_TARGET / sum;
      for (const k of PERSONAL_KEYS) values[k] *= scale;
    }
  }

  const personalSum = PERSONAL_KEYS.reduce((s, k) => s + values[k], 0);
  values.interestMatchWeight += PERSONALIZATION_TARGET - personalSum;

  return {
    interestMatchWeight: round4(values.interestMatchWeight),
    watchTimeWeight: round4(values.watchTimeWeight),
    freshnessWeight: round4(values.freshnessWeight),
    creatorDiversityWeight: round4(values.creatorDiversityWeight),
    systemSignalsWeight: SYSTEM_SIGNALS_RESERVED,
  };
}

function emptyStore(): StoreShape {
  return { config: defaultConfig(), presets: buildBuiltinPresets() };
}

function buildBuiltinPresets(): FeedPresetDto[] {
  const now = iso();
  const mk = (
    id: string,
    name: string,
    patch: Partial<FeedPersonalizationConfigDto>,
    active = false,
  ): FeedPresetDto => {
    const cfg = {
      ...defaultConfig(),
      ...patch,
      ...normalizeWeights({ ...defaultConfig(), ...patch }),
    };
    return {
      id,
      name,
      configJson: { ...cfg, updatedAt: now },
      isActive: active,
      createdAt: now,
      updatedAt: now,
    };
  };
  return [
    mk('preset_default', 'Default', {}, true),
    mk('preset_creator_boost', 'Creator Boost', {
      creatorDiversityWeight: 0.15,
      interestMatchWeight: 0.3,
      watchTimeWeight: 0.2,
      freshnessWeight: 0.1,
      boostNewCreators: true,
      exploreNewInterests: true,
    }),
    mk('preset_ecommerce', 'E-Commerce Heavy', {
      interestMatchWeight: 0.3,
      watchTimeWeight: 0.2,
      freshnessWeight: 0.1,
      creatorDiversityWeight: 0.05,
      hideOutOfStock: true,
      geoProximityBoost: true,
      prioritizeEnergyPush: true,
    }),
    mk('preset_viral', 'Viral Mode', {
      watchTimeWeight: 0.35,
      freshnessWeight: 0.2,
      interestMatchWeight: 0.15,
      creatorDiversityWeight: 0.05,
      reduceRepeatedContent: true,
      reduceLowQuality: true,
    }),
  ];
}

function readStore(): StoreShape {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const s = emptyStore();
      writeStore(s);
      return s;
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as StoreShape;
    const builtins = buildBuiltinPresets();
    const rawPresets = Array.isArray(raw.presets) ? raw.presets : [];
    // Prefer stable builtin ids; migrate legacy random-uuid presets
    const hasStable = rawPresets.some((p) => p.id.startsWith('preset_'));
    const presets = hasStable
      ? builtins.map((b) => rawPresets.find((p) => p.id === b.id) ?? b)
      : builtins;
    return {
      config: { ...defaultConfig(), ...(raw.config ?? {}), ...normalizeWeights(raw.config ?? {}) },
      presets,
    };
  } catch {
    const s = emptyStore();
    writeStore(s);
    return s;
  }
}

function writeStore(store: StoreShape) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

async function prismaReady(): Promise<boolean> {
  try {
    await prisma.feedPersonalizationConfig.findUnique({ where: { id: GLOBAL_ID } });
    return true;
  } catch {
    return false;
  }
}

function mapPrismaConfig(row: {
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
  updatedAt: Date;
  updatedBy: string | null;
}): FeedPersonalizationConfigDto {
  const w = normalizeWeights({
    interestMatchWeight: row.interestMatchWeight,
    watchTimeWeight: row.watchTimeWeight,
    freshnessWeight: row.freshnessWeight,
    creatorDiversityWeight: row.creatorDiversityWeight,
    systemSignalsWeight: row.systemSignalsWeight,
  });
  return {
    id: row.id,
    ...w,
    boostNewCreators: row.boostNewCreators,
    exploreNewInterests: row.exploreNewInterests,
    reduceRepeatedContent: row.reduceRepeatedContent,
    reduceLowQuality: row.reduceLowQuality,
    geoProximityBoost: row.geoProximityBoost,
    downrankReported: row.downrankReported,
    prioritizeEnergyPush: row.prioritizeEnergyPush,
    hideOutOfStock: row.hideOutOfStock,
    updatedAt: iso(row.updatedAt),
    updatedBy: row.updatedBy,
  };
}

export async function getFeedConfig(): Promise<FeedPersonalizationConfigDto> {
  if (await prismaReady()) {
    let row = await prisma.feedPersonalizationConfig.findUnique({ where: { id: GLOBAL_ID } });
    if (!row) {
      const d = defaultConfig();
      const w = normalizeWeights(d);
      row = await prisma.feedPersonalizationConfig.create({
        data: {
          id: GLOBAL_ID,
          ...w,
          boostNewCreators: d.boostNewCreators,
          exploreNewInterests: d.exploreNewInterests,
          reduceRepeatedContent: d.reduceRepeatedContent,
          reduceLowQuality: d.reduceLowQuality,
          geoProximityBoost: d.geoProximityBoost,
          downrankReported: d.downrankReported,
          prioritizeEnergyPush: d.prioritizeEnergyPush,
          hideOutOfStock: d.hideOutOfStock,
          updatedBy: d.updatedBy,
        },
      });
    }
    return mapPrismaConfig(row);
  }
  return readStore().config;
}

export async function saveFeedConfig(
  input: Partial<FeedPersonalizationConfigDto> & {
    actor: string;
    lockedKey?: PersonalWeightKey;
  },
): Promise<FeedPersonalizationConfigDto & { cacheFlush?: Awaited<ReturnType<typeof flushFeedRankingCache>> }> {
  const current = await getFeedConfig();
  const { actor, lockedKey, ...rest } = input;
  const weights = normalizeWeights({ ...current, ...rest }, lockedKey);
  const merged: FeedPersonalizationConfigDto = {
    ...current,
    ...rest,
    id: GLOBAL_ID,
    ...weights,
    updatedAt: iso(),
    updatedBy: actor,
  };

  if (await prismaReady()) {
    const row = await prisma.feedPersonalizationConfig.upsert({
      where: { id: GLOBAL_ID },
      create: {
        id: GLOBAL_ID,
        interestMatchWeight: merged.interestMatchWeight,
        watchTimeWeight: merged.watchTimeWeight,
        freshnessWeight: merged.freshnessWeight,
        creatorDiversityWeight: merged.creatorDiversityWeight,
        systemSignalsWeight: merged.systemSignalsWeight,
        boostNewCreators: merged.boostNewCreators,
        exploreNewInterests: merged.exploreNewInterests,
        reduceRepeatedContent: merged.reduceRepeatedContent,
        reduceLowQuality: merged.reduceLowQuality,
        geoProximityBoost: merged.geoProximityBoost,
        downrankReported: merged.downrankReported,
        prioritizeEnergyPush: merged.prioritizeEnergyPush,
        hideOutOfStock: merged.hideOutOfStock,
        updatedBy: merged.updatedBy,
      },
      update: {
        interestMatchWeight: merged.interestMatchWeight,
        watchTimeWeight: merged.watchTimeWeight,
        freshnessWeight: merged.freshnessWeight,
        creatorDiversityWeight: merged.creatorDiversityWeight,
        systemSignalsWeight: merged.systemSignalsWeight,
        boostNewCreators: merged.boostNewCreators,
        exploreNewInterests: merged.exploreNewInterests,
        reduceRepeatedContent: merged.reduceRepeatedContent,
        reduceLowQuality: merged.reduceLowQuality,
        geoProximityBoost: merged.geoProximityBoost,
        downrankReported: merged.downrankReported,
        prioritizeEnergyPush: merged.prioritizeEnergyPush,
        hideOutOfStock: merged.hideOutOfStock,
        updatedBy: merged.updatedBy,
      },
    });
    const store = readStore();
    store.config = mapPrismaConfig(row);
    writeStore(store);
    const cacheFlush = await flushFeedRankingCache();
    return { ...mapPrismaConfig(row), cacheFlush };
  }

  const store = readStore();
  store.config = merged;
  writeStore(store);
  const cacheFlush = await flushFeedRankingCache();
  return { ...merged, cacheFlush };
}

export async function listFeedPresets(): Promise<FeedPresetDto[]> {
  if (await prismaReady()) {
    const count = await prisma.feedPreset.count();
    if (count === 0) {
      for (const p of buildBuiltinPresets()) {
        await prisma.feedPreset.create({
          data: {
            id: p.id,
            name: p.name,
            configJson: p.configJson,
            isActive: p.isActive,
          },
        });
      }
    }
    const rows = await prisma.feedPreset.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      configJson: r.configJson as FeedPersonalizationConfigDto,
      isActive: r.isActive,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }));
  }
  return readStore().presets;
}

export async function applyFeedPreset(input: {
  presetId: string;
  actor: string;
}): Promise<{ config: FeedPersonalizationConfigDto; preset: FeedPresetDto }> {
  const presets = await listFeedPresets();
  const preset = presets.find((p) => p.id === input.presetId);
  if (!preset) throw new AppError('NOT_FOUND', 'Preset not found', 404);

  const config = await saveFeedConfig({
    ...preset.configJson,
    actor: input.actor,
  });

  if (await prismaReady()) {
    await prisma.feedPreset.updateMany({ data: { isActive: false } });
    await prisma.feedPreset.update({ where: { id: preset.id }, data: { isActive: true } });
  } else {
    const store = readStore();
    store.presets = store.presets.map((p) => ({ ...p, isActive: p.id === preset.id }));
    writeStore(store);
  }

  return { config, preset: { ...preset, isActive: true, configJson: config } };
}

function reportCountFor(id: string): number {
  return listReports('all').filter(
    (r) => r.targetId === id && r.status !== 'dismissed',
  ).length;
}

/** Demo catalog for admin live preview (Chanthaburi-centric) */
export function buildPreviewCatalog(): RankableFeedItem[] {
  const now = Date.now();
  return [
    {
      id: 'feed_chan_fruit',
      authorId: 'creator_mai',
      authorHandle: '@mai.orchard',
      caption: 'ทุเรียนหมอนทองจันท์ ส่งในวัน',
      tags: ['ทุเรียน', 'จันทบุรี', 'ผลไม้'],
      createdAt: iso(new Date(now - 2 * 3600_000)),
      contentType: 'video',
      watchSeconds: 18,
      dwellSeconds: 12,
      ctr: 0.12,
      reportCount: 0,
      likes: 420,
      comments: 33,
      isNewCreator: false,
      qualityScore: 0.86,
      inStock: true,
      stockQty: 24,
      energyPush: true,
      isAd: false,
      location: 'จันทบุรี',
      lat: CHANTHABURI.lat + 0.02,
      lng: CHANTHABURI.lng - 0.01,
      locationLabel: 'จันทบุรี',
      productName: 'ทุเรียนหมอนทอง',
      shopName: 'สวนใหม่จันท์',
      priceThb: 189,
    },
    {
      id: 'feed_chan_seafood',
      authorId: 'creator_pla',
      authorHandle: '@pla.fresh',
      caption: 'กุ้งกุลาดำสดจากท่าเรือ',
      tags: ['อาหารทะเล', 'จันทบุรี'],
      createdAt: iso(new Date(now - 5 * 3600_000)),
      contentType: 'product',
      watchSeconds: 4,
      dwellSeconds: 16,
      ctr: 0.22,
      reportCount: 0,
      likes: 210,
      comments: 18,
      isNewCreator: true,
      qualityScore: 0.78,
      inStock: true,
      stockQty: 8,
      energyPush: false,
      isAd: false,
      location: 'จันทบุรี',
      lat: CHANTHABURI.lat - 0.03,
      lng: CHANTHABURI.lng + 0.02,
      locationLabel: 'ท่าเรือจันท์',
      productName: 'กุ้งกุลาดำ',
      shopName: 'ปลาเฟรช',
      priceThb: 320,
    },
    {
      id: 'feed_bkk_fashion',
      authorId: 'creator_style',
      authorHandle: '@style.bkk',
      caption: 'เสื้อใหม่จากกรุงเทพ',
      tags: ['แฟชั่น', 'กรุงเทพ'],
      createdAt: iso(new Date(now - 20 * 3600_000)),
      contentType: 'image',
      watchSeconds: 2,
      dwellSeconds: 8,
      ctr: 0.08,
      reportCount: 0,
      likes: 90,
      comments: 4,
      isNewCreator: false,
      qualityScore: 0.55,
      inStock: true,
      stockQty: 40,
      energyPush: false,
      isAd: true,
      location: 'กรุงเทพ',
      lat: 13.7563,
      lng: 100.5018,
      locationLabel: 'กรุงเทพ',
      productName: 'เสื้อคอกลม',
      shopName: 'StyleBKK',
      priceThb: 459,
    },
    {
      id: 'feed_oos_gadget',
      authorId: 'creator_tech',
      authorHandle: '@tech.deal',
      caption: 'หูฟังลดแรง — หมดสต็อกชั่วคราว',
      tags: ['gadget', 'tech'],
      createdAt: iso(new Date(now - 8 * 3600_000)),
      contentType: 'product',
      watchSeconds: 6,
      dwellSeconds: 20,
      ctr: 0.3,
      reportCount: 0,
      likes: 600,
      comments: 50,
      isNewCreator: false,
      qualityScore: 0.7,
      inStock: false,
      stockQty: 0,
      energyPush: true,
      isAd: false,
      location: 'จันทบุรี',
      lat: CHANTHABURI.lat,
      lng: CHANTHABURI.lng,
      locationLabel: 'จันทบุรี',
      productName: 'หูฟังไร้สาย',
      shopName: 'TechDeal',
      priceThb: 990,
    },
    {
      id: 'feed_reported_spam',
      authorId: 'creator_spam',
      authorHandle: '@spam.promo',
      caption: 'โอนเงินนอกระบบ รวยเร็ว!!!',
      tags: ['spam', 'scam'],
      createdAt: iso(new Date(now - 1 * 3600_000)),
      contentType: 'text',
      watchSeconds: 1,
      dwellSeconds: 2,
      ctr: 0.01,
      reportCount: 4,
      likes: 2,
      comments: 0,
      isNewCreator: true,
      qualityScore: 0.15,
      inStock: true,
      stockQty: 99,
      energyPush: false,
      isAd: false,
      location: 'ไม่ระบุ',
      lat: CHANTHABURI.lat + 0.1,
      lng: CHANTHABURI.lng,
      locationLabel: 'ไม่ระบุ',
      productName: 'โปรโมชันปลอม',
      shopName: 'SpamShop',
      priceThb: 1,
    },
    {
      id: 'feed_gem_mine',
      authorId: 'creator_gem',
      authorHandle: '@gem.chan',
      caption: 'พลอยจันท์คัดสวย',
      tags: ['พลอย', 'จันทบุรี', 'ของฝาก'],
      createdAt: iso(new Date(now - 30 * 60_000)),
      contentType: 'image',
      watchSeconds: 3,
      dwellSeconds: 22,
      ctr: 0.18,
      reportCount: 0,
      likes: 150,
      comments: 12,
      isNewCreator: true,
      qualityScore: 0.82,
      inStock: true,
      stockQty: 5,
      energyPush: true,
      isAd: false,
      location: 'จันทบุรี',
      lat: CHANTHABURI.lat + 0.01,
      lng: CHANTHABURI.lng + 0.015,
      locationLabel: 'ตลาดพลอย',
      productName: 'พลอยเขียว',
      shopName: 'GemChan',
      priceThb: 2500,
    },
    {
      id: 'feed_repeat_author',
      authorId: 'creator_mai',
      authorHandle: '@mai.orchard',
      caption: 'มังคุดล็อตใหม่จากสวน',
      tags: ['มังคุด', 'จันทบุรี', 'ผลไม้'],
      createdAt: iso(new Date(now - 45 * 60_000)),
      contentType: 'video',
      watchSeconds: 11,
      dwellSeconds: 8,
      ctr: 0.09,
      reportCount: 0,
      likes: 88,
      comments: 6,
      isNewCreator: false,
      qualityScore: 0.8,
      inStock: true,
      stockQty: 50,
      energyPush: false,
      isAd: false,
      location: 'จันทบุรี',
      lat: CHANTHABURI.lat + 0.025,
      lng: CHANTHABURI.lng,
      locationLabel: 'จันทบุรี',
      productName: 'มังคุด',
      shopName: 'สวนใหม่จันท์',
      priceThb: 89,
    },
    {
      id: 'feed_text_tip',
      authorId: 'creator_tips',
      authorHandle: '@tips.chan',
      caption: 'วิธีเลือกทุเรียนจันท์ให้เนื้อแน่น',
      tags: ['ทุเรียน', 'ทิปส์', 'จันทบุรี'],
      createdAt: iso(new Date(now - 90 * 60_000)),
      contentType: 'text',
      watchSeconds: 0,
      dwellSeconds: 28,
      ctr: 0.14,
      reportCount: 0,
      likes: 70,
      comments: 9,
      isNewCreator: true,
      qualityScore: 0.74,
      inStock: true,
      stockQty: 1,
      energyPush: false,
      isAd: false,
      location: 'จันทบุรี',
      locationLabel: 'จันทบุรี',
      productName: undefined,
      shopName: undefined,
    },
  ];
}

/**
 * B. Content-type adaptation
 * video → Watch Time; image/text/product → Dwell Time blended with CTR
 */
export function engagementSignal(item: RankableFeedItem): {
  value: number;
  mode: 'watch' | 'dwell_ctr';
} {
  if (item.contentType === 'video') {
    return { value: clamp01(item.watchSeconds / 30), mode: 'watch' };
  }
  const dwell = clamp01(item.dwellSeconds / 30);
  const ctr = clamp01(item.ctr);
  return { value: clamp01(dwell * 0.65 + ctr * 0.35), mode: 'dwell_ctr' };
}

/**
 * C. Enhanced ranking
 * Final Score = personalizationScore * systemMultiplier * safetyFactor [* geo 1.25]
 */
export function rankFeed(input: {
  config: FeedPersonalizationConfigDto;
  items?: RankableFeedItem[];
  viewer?: ViewerContext;
  limit?: number;
}): { items: RankedFeedItem[]; meta: Record<string, unknown> } {
  const cfg = { ...input.config, ...normalizeWeights(input.config) };
  const viewerLoc =
    input.viewer?.sampleLocation ?? input.viewer?.location ?? 'จันทบุรี';
  const viewer = input.viewer ?? {
    interests: ['จันทบุรี', 'ผลไม้', 'ทุเรียน'],
    location: viewerLoc,
    sampleLocation: viewerLoc,
    lat: CHANTHABURI.lat,
    lng: CHANTHABURI.lng,
    seenAuthorIds: [],
    seenContentIds: [],
  };
  const interests = (viewer.interests ?? []).map((t) => t.toLowerCase());
  const seenAuthors = new Set(viewer.seenAuthorIds ?? []);
  const seenContent = new Set(viewer.seenContentIds ?? []);
  const authorCounts = new Map<string, number>();
  const userLocation = (viewer.sampleLocation ?? viewer.location ?? '').trim();

  let pool = [...(input.items ?? buildPreviewCatalog())].map((item) => ({
    ...item,
    reportCount: Math.max(item.reportCount, reportCountFor(item.id)),
  }));

  // Also count moderation hidden as reported pressure
  const hidden = new Set(
    listContentActions()
      .filter((c) => c.status === 'hidden' || c.status === 'removed')
      .map((c) => c.contentId),
  );
  for (const item of pool) {
    if (hidden.has(item.id) && item.reportCount === 0) item.reportCount = 1;
  }

  if (cfg.hideOutOfStock) {
    pool = pool.filter((i) => i.inStock && i.stockQty > 0);
  }

  const ranked: RankedFeedItem[] = [];

  for (const item of pool) {
    const flags: string[] = [];
    if (seenContent.has(item.id) && cfg.reduceRepeatedContent) flags.push('seen_content');

    const tagText = `${item.caption} ${item.tags.join(' ')}`.toLowerCase();
    const interestHits = interests.filter((t) => tagText.includes(t)).length;
    const interest =
      interests.length === 0
        ? 0.4
        : Math.min(1, interestHits / Math.max(1, Math.min(3, interests.length)));

    const eng = engagementSignal(item);
    flags.push(eng.mode === 'watch' ? 'eng_watch' : 'eng_dwell_ctr');

    const ageHours = Math.max(0, (Date.now() - new Date(item.createdAt).getTime()) / 3600_000);
    const freshness = Math.max(0, 1 - ageHours / 48);

    const priorSame = authorCounts.get(item.authorId) ?? 0;
    let creatorDiversity = priorSame === 0 ? 1 : Math.max(0.2, 1 - priorSame * 0.35);
    if (cfg.boostNewCreators && item.isNewCreator) {
      creatorDiversity = Math.min(1, creatorDiversity + 0.2);
      flags.push('new_creator_boost');
    }
    if (cfg.reduceRepeatedContent && seenAuthors.has(item.authorId)) {
      creatorDiversity *= 0.6;
      flags.push('author_repeat_penalty');
    }
    if (cfg.reduceLowQuality && item.qualityScore < 0.4) {
      creatorDiversity *= 0.7;
      flags.push('low_quality');
    }
    if (cfg.exploreNewInterests && interestHits === 0 && item.qualityScore > 0.7) {
      flags.push('explore_interest');
    }

    const personalizationScore =
      interest * cfg.interestMatchWeight +
      eng.value * cfg.watchTimeWeight +
      freshness * cfg.freshnessWeight +
      creatorDiversity * cfg.creatorDiversityWeight;

    // System signals multiplier (ads / B-Energy) — base 1.0
    let systemMultiplier = 1;
    const promoted =
      item.isAd ||
      (item.productId != null && getCachedPromotedProductIds().has(item.productId));
    if (promoted) {
      systemMultiplier += 0.12;
      flags.push('ad');
    }
    if (cfg.prioritizeEnergyPush && item.energyPush) {
      systemMultiplier += 0.2;
      flags.push('energy_push');
    }

    // Safety factor
    let safetyFactor = 1;
    if (cfg.downrankReported && item.reportCount > 0) {
      safetyFactor = 0.3;
      flags.push('reported_downrank');
    }

    // Geo exact location match → ×1.25
    let geoMultiplier = 1;
    if (
      cfg.geoProximityBoost &&
      userLocation &&
      item.location &&
      item.location.trim() === userLocation
    ) {
      geoMultiplier = 1.25;
      flags.push('geo_match');
    }

    const score = Math.max(
      0,
      personalizationScore * systemMultiplier * safetyFactor * geoMultiplier,
    );

    authorCounts.set(item.authorId, priorSame + 1);

    ranked.push({
      ...item,
      score: round4(score),
      rank: 0,
      breakdown: {
        interest: round4(interest),
        engagement: round4(eng.value),
        engagementMode: eng.mode,
        freshness: round4(freshness),
        creatorDiversity: round4(creatorDiversity),
        personalizationScore: round4(personalizationScore),
        systemMultiplier: round4(systemMultiplier),
        safetyFactor: round4(safetyFactor),
        geoMultiplier: round4(geoMultiplier),
      },
      flags,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  const limit = input.limit ?? 10;
  const sliced = ranked.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    items: sliced,
    meta: {
      count: sliced.length,
      formula: 'personalizationScore * systemMultiplier * safetyFactor * geoMultiplier',
      personalizationTarget: PERSONALIZATION_TARGET,
      systemSignalsReserved: SYSTEM_SIGNALS_RESERVED,
      filteredOutOfStock: cfg.hideOutOfStock,
      viewer: { ...viewer, location: userLocation },
      weights: {
        personalizationPct: 75,
        systemSignalsPct: 25,
        interestMatchWeight: cfg.interestMatchWeight,
        watchTimeWeight: cfg.watchTimeWeight,
        freshnessWeight: cfg.freshnessWeight,
        creatorDiversityWeight: cfg.creatorDiversityWeight,
      },
      generatedAt: iso(),
    },
  };
}

export async function previewFeed(input: {
  config?: Partial<FeedPersonalizationConfigDto>;
  lockedKey?: PersonalWeightKey;
  viewer?: ViewerContext;
  userId?: string;
  sampleLocation?: string;
  limit?: number;
}) {
  const live = await getFeedConfig();
  const draft = {
    ...live,
    ...(input.config ?? {}),
    ...normalizeWeights({ ...live, ...(input.config ?? {}) }, input.lockedKey),
  };
  const viewer: ViewerContext = {
    interests: ['จันทบุรี', 'ผลไม้', 'ทุเรียน'],
    lat: CHANTHABURI.lat,
    lng: CHANTHABURI.lng,
    ...(input.viewer ?? {}),
    userId: input.userId ?? input.viewer?.userId,
    sampleLocation:
      input.sampleLocation ?? input.viewer?.sampleLocation ?? input.viewer?.location ?? 'จันทบุรี',
    location:
      input.sampleLocation ?? input.viewer?.location ?? input.viewer?.sampleLocation ?? 'จันทบุรี',
  };
  return rankFeed({ config: draft, viewer, limit: input.limit ?? 10 });
}
