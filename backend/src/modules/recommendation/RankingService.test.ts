import { describe, expect, it } from 'vitest';
import { calculateMatchScore, rankCandidates } from './RankingService';
import type { InterestProfileDto } from './interestTypes';

const now = new Date('2026-08-25T12:00:00.000Z');
const profile: InterestProfileDto = {
  userId: 'u1', explicitInterests: [{ tag: 'รถไฟฟ้า', normalizedTag: 'รถไฟฟ้า', weight: 1, source: 'PROFILE', lastSeenAt: now.toISOString() }],
  occupation: null, occupationVisible: false, careerField: null, careerFieldVisible: false,
  skills: [], skillsVisible: false, interestsVisible: false, preferredCategories: [], categoriesVisible: false,
  behavioralInterests: [{ tag: 'แบตเตอรี่', normalizedTag: 'แบตเตอรี่', weight: 1, source: 'SAVE', lastSeenAt: now.toISOString() }],
  searchInterests: [{ tag: 'motor', normalizedTag: 'motor', weight: 1, source: 'SEARCH', lastSeenAt: now.toISOString() }],
  locationPreferences: [], personalizationEnabled: true, updatedAt: now.toISOString(),
};
const config = { interestWeight: .3, recentBehaviorWeight: .25, searchIntentWeight: .2, locationWeight: .1, freshnessWeight: .1, popularityWeight: .05, negativeSignalWeight: 1, decayHalfLifeDays: 30 };

describe('recommendation ranking', () => {
  it('ranks a matching listing above unrelated content', () => {
    const matching = { id: 'ev', tags: ['รถไฟฟ้า', 'แบตเตอรี่', 'motor'], createdAt: now, popularity: .5, payload: {} };
    const unrelated = { id: 'camera', tags: ['กล้อง'], createdAt: now, popularity: .5, payload: {} };
    expect(rankCandidates(profile, [unrelated, matching], config)[0].candidate.id).toBe('ev');
  });
  it('returns internal 0-100 scores and honors personalization opt-out', () => {
    const candidate = { id: 'x', tags: ['รถไฟฟ้า'], createdAt: now, popularity: 1, payload: {} };
    expect(calculateMatchScore(profile, candidate, config, now.getTime()).score).toBeGreaterThan(0);
    expect(calculateMatchScore({ ...profile, personalizationEnabled: false }, candidate, config).score).toBe(0);
  });
  it('decays old behavioral signals and applies configurable negative signals', () => {
    const candidate = { id: 'battery', tags: ['แบตเตอรี่'], createdAt: now, popularity: 0, payload: {} };
    const recent = calculateMatchScore(profile, candidate, config, now.getTime()).score;
    const afterTwoHalfLives = calculateMatchScore(profile, candidate, config, now.getTime() + 60 * 86_400_000).score;
    expect(afterTwoHalfLives).toBeLessThan(recent);

    const negativeProfile = {
      ...profile,
      behavioralInterests: [{ tag: 'แบตเตอรี่', normalizedTag: 'แบตเตอรี่', weight: -1, source: 'NEGATIVE', lastSeenAt: now.toISOString() }],
    };
    const weakPenalty = calculateMatchScore(negativeProfile, candidate, { ...config, negativeSignalWeight: 0 }, now.getTime()).score;
    const strongPenalty = calculateMatchScore(negativeProfile, candidate, { ...config, negativeSignalWeight: 2 }, now.getTime()).score;
    expect(strongPenalty).toBeLessThan(weakPenalty);
  });
  it('combines popularity and quality in the five-percent quality signal', () => {
    const lowQuality = { id: 'low', tags: [], createdAt: now, popularity: 1, quality: 0, payload: {} };
    const highQuality = { ...lowQuality, id: 'high', quality: 1 };
    expect(calculateMatchScore(profile, highQuality, config, now.getTime()).score)
      .toBeGreaterThan(calculateMatchScore(profile, lowQuality, config, now.getTime()).score);
  });
});
