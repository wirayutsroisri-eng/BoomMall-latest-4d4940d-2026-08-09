import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export const DEFAULT_EVENT_WEIGHTS = {
  CONTENT_VIEWED: 0.15, PRODUCT_VIEWED: 0.2, SECONDHAND_VIEWED: 0.22, JOB_VIEWED: 0.22,
  SERVICE_VIEWED: 0.22, CONTENT_LIKED: 0.45, LISTING_SAVED: 0.7, USER_SEARCHED: 0.8,
  CONTENT_SHARED: 0.55, SELLER_CONTACTED: 0.9, JOB_APPLIED: 1.0, PRODUCT_PURCHASED: 1.25,
  PRODUCT_LISTED: 0.75, CONTENT_SKIPPED: -0.15, CONTENT_HIDDEN: -0.8,
  CREATOR_BLOCKED: -1.2, CONTENT_REPORTED: -1.0, REPEATED_IMPRESSION_IGNORED: -0.25,
} as const;

export const DEFAULT_CONFIG = {
  interestWeight: 0.30, recentBehaviorWeight: 0.25, searchIntentWeight: 0.20,
  locationWeight: 0.10, freshnessWeight: 0.10, popularityWeight: 0.05,
  negativeSignalWeight: 1, decayHalfLifeDays: 30,
};

export async function getRecommendationConfig() {
  return prisma.recommendationConfig.upsert({
    where: { id: 'GLOBAL_RECOMMENDATION' },
    create: { id: 'GLOBAL_RECOMMENDATION', ...DEFAULT_CONFIG, eventWeightsJson: DEFAULT_EVENT_WEIGHTS },
    update: {},
  });
}

export async function saveRecommendationConfig(input: Record<string, unknown>, actor: string) {
  const keys = ['interestWeight', 'recentBehaviorWeight', 'searchIntentWeight', 'locationWeight', 'freshnessWeight', 'popularityWeight'] as const;
  const weights = Object.fromEntries(keys.map((key) => [key, Number(input[key])])) as Record<(typeof keys)[number], number>;
  if (keys.some((key) => !Number.isFinite(weights[key]) || weights[key] < 0)) throw new AppError('VALIDATION', 'weight ต้องเป็นเลขตั้งแต่ 0 ขึ้นไป', 400);
  const sum = keys.reduce((total, key) => total + weights[key], 0);
  if (Math.abs(sum - 1) > 0.001) throw new AppError('VALIDATION', 'algorithm weights ต้องรวมกันเป็น 1.0', 400);
  const negativeSignalWeight = Number(input.negativeSignalWeight);
  const decayHalfLifeDays = Number(input.decayHalfLifeDays);
  if (!Number.isFinite(negativeSignalWeight) || negativeSignalWeight < 0 || !Number.isFinite(decayHalfLifeDays) || decayHalfLifeDays <= 0) {
    throw new AppError('VALIDATION', 'negativeSignalWeight/decayHalfLifeDays ไม่ถูกต้อง', 400);
  }
  return prisma.recommendationConfig.upsert({ where: { id: 'GLOBAL_RECOMMENDATION' }, create: {
    id: 'GLOBAL_RECOMMENDATION', ...weights, negativeSignalWeight, decayHalfLifeDays,
    eventWeightsJson: (input.eventWeights ?? DEFAULT_EVENT_WEIGHTS) as any, updatedBy: actor,
  }, update: { ...weights, negativeSignalWeight, decayHalfLifeDays,
    eventWeightsJson: input.eventWeights as any ?? undefined, updatedBy: actor } });
}

export async function resetRecommendationConfig(actor: string) {
  return prisma.recommendationConfig.upsert({ where: { id: 'GLOBAL_RECOMMENDATION' },
    create: { id: 'GLOBAL_RECOMMENDATION', ...DEFAULT_CONFIG, eventWeightsJson: DEFAULT_EVENT_WEIGHTS, updatedBy: actor },
    update: { ...DEFAULT_CONFIG, eventWeightsJson: DEFAULT_EVENT_WEIGHTS, updatedBy: actor } });
}
