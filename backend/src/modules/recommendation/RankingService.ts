import { normalizeTag, type InterestProfileDto, type WeightedInterest } from './interestTypes';

export type MatchCandidate = { id: string; tags: string[]; location?: string | null; createdAt: Date; popularity: number; quality?: number; payload: unknown };

function activeMap(items: WeightedInterest[], now: number, halfLifeDays: number) {
  return new Map(items.map((item) => {
    const age = Math.max(0, (now - new Date(item.lastSeenAt).getTime()) / 86_400_000);
    return [item.normalizedTag, item.weight * Math.pow(0.5, age / halfLifeDays)] as const;
  }));
}

function tagScore(tags: string[], weights: Map<string, number>) {
  if (!weights.size) return 0;
  let score = 0;
  for (const tag of tags.map(normalizeTag)) score += weights.get(tag) ?? 0;
  return Math.max(-1, Math.min(1, score / Math.max(1, Math.sqrt(weights.size))));
}

export function calculateMatchScore(profile: InterestProfileDto, candidate: MatchCandidate, config: any, now = Date.now()) {
  if (!profile.personalizationEnabled) return { score: 0, breakdown: { interest: 0, behavior: 0, search: 0, location: 0, freshness: 0, popularity: 0 } };
  const explicit = activeMap(profile.explicitInterests, now, 3650);
  const behavior = activeMap(profile.behavioralInterests, now, config.decayHalfLifeDays);
  const search = activeMap(profile.searchInterests, now, Math.max(1, config.decayHalfLifeDays / 3));
  const interest = Math.max(0, tagScore(candidate.tags, explicit));
  const behaviorRaw = tagScore(candidate.tags, behavior);
  const recentBehavior = Math.max(0, behaviorRaw);
  const negative = Math.max(0, -behaviorRaw) * config.negativeSignalWeight;
  const searchIntent = Math.max(0, tagScore(candidate.tags, search));
  const locations = new Set(profile.locationPreferences.map((v) => v.normalizedTag));
  const location = candidate.location && locations.has(normalizeTag(candidate.location)) ? 1 : 0;
  const ageHours = Math.max(0, (now - candidate.createdAt.getTime()) / 3_600_000);
  const freshness = Math.exp(-ageHours / (24 * 14));
  const popularitySignal = Math.max(0, Math.min(1, candidate.popularity));
  const qualitySignal = candidate.quality == null
    ? popularitySignal
    : Math.max(0, Math.min(1, candidate.quality));
  const popularity = (popularitySignal + qualitySignal) / 2;
  const raw = interest * config.interestWeight + recentBehavior * config.recentBehaviorWeight +
    searchIntent * config.searchIntentWeight + location * config.locationWeight +
    freshness * config.freshnessWeight + popularity * config.popularityWeight -
    negative * config.recentBehaviorWeight;
  return { score: Math.round(Math.max(0, Math.min(1, raw)) * 10_000) / 100,
    breakdown: { interest, behavior: recentBehavior, search: searchIntent, location, freshness, popularity } };
}

export function rankCandidates(profile: InterestProfileDto, candidates: MatchCandidate[], config: any) {
  return candidates.map((candidate) => ({ candidate, match: calculateMatchScore(profile, candidate, config) }))
    .sort((a, b) => b.match.score - a.match.score || b.candidate.createdAt.getTime() - a.candidate.createdAt.getTime());
}
