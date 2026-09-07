import { beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ set: vi.fn(), load: vi.fn(), posts: vi.fn(async () => []) }));
vi.mock('../data/feedFocusApi', () => ({ newFocusSessionId: () => `session_${Math.random()}`, setTemporaryFeedFocus: api.set, loadTemporaryFeed: api.load }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
vi.mock('@/modules/auth/state/auth-store', () => ({ useAuthStore: { getState: () => ({ user: { id: 'user', handle: 'me' } }) } }));
vi.mock('@/modules/loyalty/state/loyalty-store', () => ({ useLoyaltyStore: { getState: () => ({ profile: { displayName: 'Me' } }) } }));
vi.mock('@/modules/vault/state/vault-store', () => ({ useVaultStore: {} }));
vi.mock('@/modules/feed/data/feedEngageApi', () => ({ fetchFeedPosts: api.posts }));
vi.mock('@/modules/feed/data/uploadFeedMedia', () => ({}));
vi.mock('@/modules/create/data/persistCreateMedia', () => ({}));
vi.mock('@/modules/matching/domain/run-post-matching', () => ({}));
vi.mock('@/modules/feed/data/mapSocialPost', () => ({ socialPostToFeedItem: (row: unknown) => row, mergeFeedItems: (rows: unknown[]) => rows }));
import { useFeedStore } from './feed-store';
import type { FeedItem } from '../domain/types';
const focus = { mode: 'temporary_focus', query: 'ข่าว', targetWeight: 0.75 };
const item = (id: string) => ({ id, caption: '', musicTitle: '', product: { tags: [] } }) as unknown as FeedItem;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks();
  useFeedStore.setState({ items: [item('normal')], feedFocus: null, focusOrder: null, focusBaselineIds: null, focusBusy: false, focusGeneration: 0, focusSessionId: 'original-session', accountOwnerId: 'user' });
});
describe('Feed Focus lifecycle', () => {
  it('starts a new app session without restoring the previous focus', async () => {
    api.set.mockResolvedValueOnce(focus);
    api.load.mockResolvedValueOnce({ focus, data: [item('news')] });
    await useFeedStore.getState().changeFeedFocus('ข่าว');
    const persisted = useFeedStore.persist.getOptions().partialize!(useFeedStore.getState());
    expect(persisted).not.toHaveProperty('feedFocus');
    expect(persisted).not.toHaveProperty('focusOrder');
    expect(persisted).not.toHaveProperty('focusSessionId');
    vi.resetModules();
    const { useFeedStore: reopened } = await import('./feed-store');
    expect(reopened.getState()).toMatchObject({ feedFocus: null, focusOrder: null });
    expect(reopened.getState().focusSessionId).not.toBe(useFeedStore.getState().focusSessionId);
  });
  it('applies server order, then resets only focus and reloads normal feed', async () => {
    api.set.mockResolvedValueOnce(focus).mockResolvedValueOnce(null);
    api.load.mockResolvedValueOnce({ focus, data: [item('news')] }).mockResolvedValueOnce({ focus: null, data: [item('normal-new')] });
    await useFeedStore.getState().changeFeedFocus('ข่าว');
    expect(useFeedStore.getState().focusOrder).toEqual(['news']);
    await useFeedStore.getState().changeFeedFocus(null);
    expect(api.set).toHaveBeenLastCalledWith('original-session', null);
    expect(useFeedStore.getState()).toMatchObject({ feedFocus: null, focusOrder: null, focusBusy: false });
    expect(useFeedStore.getState().items.map((row) => row.id)).toEqual(['normal-new']);
    expect(useFeedStore.getState().focusSessionId).not.toBe('original-session');
  });
  it('rejects a stale focused reload after reset', async () => {
    api.set.mockResolvedValueOnce(focus).mockResolvedValueOnce(null);
    api.load.mockResolvedValueOnce({ focus, data: [item('news')] });
    await useFeedStore.getState().changeFeedFocus('ข่าว');
    const pending = deferred<{ focus: typeof focus; data: FeedItem[] }>();
    api.load.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ focus: null, data: [item('normal-new')] });
    const oldReload = useFeedStore.getState().reloadFeedFocus();
    await useFeedStore.getState().changeFeedFocus(null);
    pending.resolve({ focus, data: [item('stale-news')] });
    await oldReload;
    expect(useFeedStore.getState().feedFocus).toBeNull();
    expect(useFeedStore.getState().items.map((row) => row.id)).toEqual(['normal-new']);
  });
  it('restores the cached normal feed if reset succeeds but reload fails', async () => {
    api.set.mockResolvedValueOnce(focus).mockResolvedValueOnce(null);
    api.load.mockResolvedValueOnce({ focus, data: [item('news')] }).mockRejectedValueOnce(new Error('offline'));
    await useFeedStore.getState().changeFeedFocus('ข่าว');
    await expect(useFeedStore.getState().changeFeedFocus(null)).rejects.toThrow('offline');
    expect(useFeedStore.getState().feedFocus).toBeNull();
    expect(useFeedStore.getState().items.map((row) => row.id)).toEqual(['normal']);
  });
  it('does not let an old account request affect the next account', async () => {
    const pending = deferred<typeof focus>();
    api.set.mockReturnValueOnce(pending.promise);
    const change = useFeedStore.getState().changeFeedFocus('ข่าว');
    useFeedStore.getState().switchAccount('other-user');
    pending.resolve(focus);
    await change;
    expect(useFeedStore.getState()).toMatchObject({ accountOwnerId: 'other-user', feedFocus: null, items: [] });
    expect(api.load).not.toHaveBeenCalled();
  });
});
