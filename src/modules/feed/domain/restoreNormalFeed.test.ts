import { describe, expect, it } from 'vitest';
import { restoreNormalFeed } from './restoreNormalFeed';
import type { FeedItem } from './types';
const item = (id: string, extra: Partial<FeedItem> = {}) => ({ id, ...extra }) as FeedItem;
describe('restore normal feed', () => {
  it('restores normal order with current likes, saves and edits', () => {
    const current = [item('focus-only'), item('b', { liked: true, saved: true }), item('a', { caption: 'edited' })];
    const result = restoreNormalFeed(current, ['a', 'b']);
    expect(result.map((row) => row.id)).toEqual(['a', 'b']);
    expect(result[0].caption).toBe('edited');
    expect(result[1]).toMatchObject({ liked: true, saved: true });
  });
  it('keeps posts created during focus and does not resurrect deleted posts', () => {
    const current = [item('feed-user-new', { isUserPost: true }), item('published-new', { isUserPost: true }), item('a')];
    expect(restoreNormalFeed(current, ['a', 'deleted']).map((row) => row.id)).toEqual(['feed-user-new', 'published-new', 'a']);
  });
  it('leaves normal feed untouched without a focus baseline', () => {
    const current = [item('a')];
    expect(restoreNormalFeed(current, null)).toBe(current);
  });
});
