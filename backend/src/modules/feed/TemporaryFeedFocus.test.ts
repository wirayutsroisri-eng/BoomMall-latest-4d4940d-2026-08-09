import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const redisState = vi.hoisted(() => ({ configured: false, client: null as any }));
vi.mock('../../lib/redis', () => ({ getRedisUrl: () => redisState.configured ? 'redis://test' : null, getRedisClient: async () => redisState.client }));
import { focusKey, matchesFocusText, mixFeedFocus, readFeedFocus, writeFeedFocus } from './TemporaryFeedFocus';

beforeEach(() => { redisState.configured = false; redisState.client = null; });
afterEach(() => vi.useRealTimers());
describe('temporary Feed Focus', () => {
  it('stores only a temporary override with a fixed target and no expiry', async () => {
    const focus = await writeFeedFocus('user-a', 'session-a', ' ข่าว ');
    expect(focus).toMatchObject({ mode: 'temporary_focus', query: 'ข่าว', targetWeight: 0.75 });
    expect(focus).not.toHaveProperty('expiresAt');
  });
  it('isolates users and sessions and resets only the requested focus', async () => {
    await writeFeedFocus('user-a', 'session-a', 'ข่าว');
    await writeFeedFocus('user-a', 'session-b', 'AI');
    await writeFeedFocus('user-b', 'session-a', 'กีฬา');
    await writeFeedFocus('user-a', 'session-a', null);
    expect(await readFeedFocus('user-a', 'session-a')).toBeNull();
    expect((await readFeedFocus('user-a', 'session-b'))?.query).toBe('AI');
    expect((await readFeedFocus('user-b', 'session-a'))?.query).toBe('กีฬา');
  });
  it('keeps focus regardless of elapsed time until explicitly reset', async () => {
    vi.useFakeTimers();
    await writeFeedFocus('ttl-user', 'ttl-session', 'ข่าว');
    vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000);
    expect((await readFeedFocus('ttl-user', 'ttl-session'))?.query).toBe('ข่าว');
    await writeFeedFocus('ttl-user', 'ttl-session', null);
    expect(await readFeedFocus('ttl-user', 'ttl-session')).toBeNull();
  });
  it('uses scoped Redis keys without a timer and a single-key delete', async () => {
    const values = new Map<string, string>();
    const client = {
      set: vi.fn(async (key, value) => { values.set(key, value); }),
      get: vi.fn(async (key) => values.get(key) ?? null),
      del: vi.fn(async (key) => { values.delete(key); }),
    };
    redisState.configured = true; redisState.client = client;
    await writeFeedFocus('redis-user', 'redis-session', 'ข่าว');
    expect(client.set).toHaveBeenCalledWith('feed:focus:redis-user:redis-session', expect.any(String));
    expect((await readFeedFocus('redis-user', 'redis-session'))?.query).toBe('ข่าว');
    await writeFeedFocus('redis-user', 'redis-session', null);
    expect(client.del).toHaveBeenCalledExactlyOnceWith('feed:focus:redis-user:redis-session');
    expect(await readFeedFocus('redis-user', 'redis-session')).toBeNull();
  });
  it('fails explicitly when configured Redis is unavailable', async () => {
    redisState.configured = true;
    await expect(writeFeedFocus('user', 'session-1', 'ข่าว')).rejects.toThrow('Feed session unavailable');
  });
  it('rejects invalid sessions and queries', async () => {
    expect(() => focusKey('u', '*')).toThrow();
    await expect(writeFeedFocus('u', 'session-1', '')).rejects.toThrow();
    await expect(writeFeedFocus('u', 'session-1', 'a'.repeat(101))).rejects.toThrow();
    await expect(writeFeedFocus('u', 'session-1', { query: 'ข่าว' })).rejects.toThrow();
  });
  it('serves 75% focus with stable order and unique discovery slots', () => {
    const rows = Array.from({ length: 100 }, (_, id) => ({ id, focused: id < 70 }));
    const result = mixFeedFocus(rows, (row) => row.focused, 40);
    expect(result.filter((row) => row.focused)).toHaveLength(30);
    expect(result.filter((row) => !row.focused)).toHaveLength(10);
    expect(result.slice(0, 4).map((row) => row.id)).toEqual([0, 1, 2, 70]);
    expect(new Set(result.map((row) => row.id)).size).toBe(40);
    expect(rows[0].id).toBe(0);
  });
  it('fills shortages without duplicating or inventing posts', () => {
    expect(mixFeedFocus([1, 2, 3, 4, 5], (id) => id === 1, 40)).toEqual([1, 2, 3, 4, 5]);
    expect(mixFeedFocus([1, 2], () => false, 40)).toEqual([1, 2]);
    expect(mixFeedFocus([], () => true, 40)).toEqual([]);
  });
  it('matches Thai captions and normalized case-insensitive tags', () => {
    expect(matchesFocusText('ข่าว', 'สรุปข่าววันนี้', [])).toBe(true);
    expect(matchesFocusText('AI', '', ['ai'])).toBe(true);
    expect(matchesFocusText('หุ้น', 'ฟุตบอลวันนี้', ['กีฬา'])).toBe(false);
  });
});
