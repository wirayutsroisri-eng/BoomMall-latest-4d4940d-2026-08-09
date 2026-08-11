import { describe, expect, it } from 'vitest';
import { MOCK_MUSIC_TRACKS } from '../data/mockTracks';
import {
  buildRadioQueue,
  recommendedTracks,
  searchTracksSmart,
  topGenres,
} from './music-recommend';

const baseStats = {
  playCountById: {} as Record<string, number>,
  recentPlayIds: [] as string[],
  genrePlayCount: {} as Record<string, number>,
  pinnedIds: [] as string[],
  viewCountById: {} as Record<string, number>,
};

describe('music-recommend', () => {
  it('ranks preferred genre higher after plays', () => {
    const stats = {
      ...baseStats,
      playCountById: { 'trk-lofi-01': 5, 'trk-lofi-02': 3 },
      recentPlayIds: ['trk-lofi-01', 'trk-lofi-02'],
      genrePlayCount: { lofi: 8, chill: 1 },
    };
    const top = topGenres(stats, 1);
    expect(top[0]?.genre).toBe('lofi');
    const rec = recommendedTracks(MOCK_MUSIC_TRACKS, stats, 6);
    expect(rec.some((t) => t.genre === 'lofi')).toBe(true);
    expect(rec[0]?.genre).toBe('lofi');
  });

  it('builds radio queue starting from seed genre', () => {
    const seed = MOCK_MUSIC_TRACKS.find((t) => t.id === 'trk-nature-01')!;
    const queue = buildRadioQueue(MOCK_MUSIC_TRACKS, baseStats, { seed, limit: 10 });
    expect(queue[0]?.id).toBe(seed.id);
    expect(queue.filter((t) => t.genre === 'nature').length).toBeGreaterThan(0);
  });

  it('search understands Thai genre aliases', () => {
    const hits = searchTracksSmart(MOCK_MUSIC_TRACKS, 'ชิลล์');
    expect(hits.every((t) => t.genre === 'chill')).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
  });
});
