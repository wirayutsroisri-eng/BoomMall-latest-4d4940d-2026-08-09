import { describe, expect, it } from 'vitest';
import { normalizeFeedEvent, normalizeFeedEventBatch } from '../feedEventSchema';
import { bucketCtr, bucketQuality, foldEventsIntoBuckets } from '../FeedEventService';

const at = new Date('2026-09-02T08:00:00.000Z');

describe('feed event validation', () => {
  it('drops rows without an item or a known type', () => {
    expect(normalizeFeedEvent({ type: 'watch' })).toBeNull();
    expect(normalizeFeedEvent({ itemId: 'p1', type: 'teleport' })).toBeNull();
    expect(normalizeFeedEvent(null)).toBeNull();
  });

  it('drops an engage row whose action is unknown', () => {
    expect(normalizeFeedEvent({ itemId: 'p1', type: 'engage', action: 'wink' })).toBeNull();
    expect(normalizeFeedEvent({ itemId: 'p1', type: 'engage' })).toBeNull();
    expect(normalizeFeedEvent({ itemId: 'p1', type: 'engage', action: 'repost' })?.action).toBe('repost');
  });

  it('refuses a completion the numbers do not support', () => {
    const lying = normalizeFeedEvent({ itemId: 'p1', type: 'watch', watchMs: 500, videoMs: 15000, completed: true });
    expect(lying?.completed).toBe(false);
    const honest = normalizeFeedEvent({ itemId: 'p1', type: 'watch', watchMs: 14500, videoMs: 15000, completed: true });
    expect(honest?.completed).toBe(true);
  });

  it('clamps a stuck timer instead of trusting it', () => {
    const event = normalizeFeedEvent({ itemId: 'p1', type: 'watch', watchMs: 9_999_999_999 });
    expect(event?.watchMs).toBe(6 * 60 * 60 * 1000);
  });

  it('collapses duplicates inside one batch', () => {
    const { events, dropped } = normalizeFeedEventBatch([
      { itemId: 'p1', type: 'impression', seq: 1 },
      { itemId: 'p1', type: 'impression', seq: 1 },
      { itemId: 'p1', type: 'impression', seq: 2 },
    ]);
    expect(events).toHaveLength(2);
    expect(dropped).toBe(1);
  });

  it('caps an oversized batch', () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ itemId: `p${i}`, type: 'impression' }));
    const { events, dropped } = normalizeFeedEventBatch(rows);
    expect(events).toHaveLength(200);
    expect(dropped).toBe(50);
  });
});

describe('rollup folding', () => {
  it('credits a reshare to the original content', () => {
    const buckets = foldEventsIntoBuckets([
      { itemId: 'share-1', rootId: 'post-1', type: 'watch', action: null, watchMs: 4000, completed: false, createdAt: at },
      { itemId: 'share-2', rootId: 'post-1', type: 'watch', action: null, watchMs: 6000, completed: true, createdAt: at },
      { itemId: 'post-1', rootId: null, type: 'impression', action: null, watchMs: 0, completed: false, createdAt: at },
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.postId).toBe('post-1');
    expect(buckets[0]!.watchMsSum).toBe(10_000n);
    expect(buckets[0]!.completes).toBe(1);
    expect(buckets[0]!.impressions).toBe(1);
  });

  it('splits buckets per day', () => {
    const buckets = foldEventsIntoBuckets([
      { itemId: 'p1', rootId: null, type: 'impression', action: null, watchMs: 0, completed: false, createdAt: at },
      { itemId: 'p1', rootId: null, type: 'impression', action: null, watchMs: 0, completed: false, createdAt: new Date('2026-09-03T01:00:00.000Z') },
    ]);
    expect(buckets).toHaveLength(2);
  });

  it('counts every share channel as a share', () => {
    const buckets = foldEventsIntoBuckets(
      ['repost', 'share_chat', 'share_link', 'like'].map((action) => ({
        itemId: 'p1', rootId: null, type: 'engage', action, watchMs: 0, completed: false, createdAt: at,
      })),
    );
    expect(buckets[0]!.shares).toBe(3);
    expect(buckets[0]!.likes).toBe(1);
  });

  it('keeps derived scores inside 0–1', () => {
    const bucket = { impressions: 10, likes: 40, comments: 0, shares: 0 };
    expect(bucketCtr(bucket)).toBe(1);
    expect(bucketCtr({ impressions: 0, likes: 5, comments: 0, shares: 0 })).toBe(0);
    const skipHeavy = foldEventsIntoBuckets(
      Array.from({ length: 5 }, () => ({
        itemId: 'p1', rootId: null, type: 'skip', action: null, watchMs: 0, completed: false, createdAt: at,
      })),
    )[0]!;
    expect(bucketQuality(skipHeavy)).toBe(0);
  });
});
