import { describe, expect, it } from 'vitest';
import {
  hashBucket,
  isInRollout,
  normalizeVariants,
  pickVariant,
} from '../feedAssignment';

describe('feed assignment', () => {
  it('gives the same viewer the same bucket every time', () => {
    const a = hashBucket('salt-1', 'user-42');
    const b = hashBucket('salt-1', 'user-42');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(10_000);
  });

  it('separates viewers across salts so two experiments do not overlap', () => {
    const sameSalt = hashBucket('salt-1', 'user-42');
    const otherSalt = hashBucket('salt-2', 'user-42');
    expect(sameSalt).not.toBe(otherSalt);
  });

  it('respects rollout boundaries', () => {
    expect(isInRollout(0, 'feed_v2', 'user-1')).toBe(false);
    expect(isInRollout(100, 'feed_v2', 'user-1')).toBe(true);
  });

  it('rolls out roughly the requested share of viewers', () => {
    const viewers = Array.from({ length: 2000 }, (_, i) => `user-${i}`);
    const included = viewers.filter((v) => isInRollout(25, 'feed_v2', v)).length;
    expect(included / viewers.length).toBeGreaterThan(0.2);
    expect(included / viewers.length).toBeLessThan(0.3);
  });

  it('drops malformed variants instead of serving a broken experiment', () => {
    const variants = normalizeVariants([
      { key: 'A', weight: 1, configVersion: 3 },
      { key: '', weight: 5 },
      null,
      { key: 'B' },
    ]);
    expect(variants.map((v) => v.key)).toEqual(['A', 'B']);
    expect(variants[1]?.weight).toBe(1);
    expect(variants[1]?.configVersion).toBeNull();
  });

  it('returns null when there is nothing to assign', () => {
    expect(pickVariant([], 'salt', 'user-1')).toBeNull();
  });

  it('splits traffic by weight', () => {
    const variants = normalizeVariants([
      { key: 'control', weight: 3 },
      { key: 'test', weight: 1 },
    ]);
    const counts = { control: 0, test: 0 } as Record<string, number>;
    for (let i = 0; i < 4000; i += 1) {
      const variant = pickVariant(variants, 'exp-salt', `user-${i}`);
      counts[variant!.key] += 1;
    }
    const controlShare = counts.control / 4000;
    expect(controlShare).toBeGreaterThan(0.7);
    expect(controlShare).toBeLessThan(0.8);
  });

  it('keeps a viewer in the same variant across calls', () => {
    const variants = normalizeVariants([{ key: 'A', weight: 1 }, { key: 'B', weight: 1 }]);
    const first = pickVariant(variants, 'exp-salt', 'user-777');
    const second = pickVariant(variants, 'exp-salt', 'user-777');
    expect(first?.key).toBe(second?.key);
  });
});
