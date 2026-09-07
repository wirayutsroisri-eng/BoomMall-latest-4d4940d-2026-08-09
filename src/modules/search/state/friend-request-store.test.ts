import { beforeEach, expect, it, vi } from 'vitest';
import { useFriendRequestStore } from './friend-request-store';

const api = vi.hoisted(() => ({ list: vi.fn(), respond: vi.fn(), hydrate: vi.fn() }));
vi.mock('../data/friendApi', () => ({ listFriendRequests: api.list, respondFriendRequest: api.respond }));
vi.mock('@/modules/chat/state/chat-store', () => ({ useChatStore: { getState: () => ({ hydrateInbox: api.hydrate }) } }));
const incoming = { id: '1', senderId: 'alice', receiverId: 'bob', direction: 'incoming', status: 'PENDING', peer: { userId: 'alice', displayName: 'Alice' } };
beforeEach(() => {
  vi.clearAllMocks();
  useFriendRequestStore.getState().bind(null);
  useFriendRequestStore.getState().bind('bob-session');
  api.list.mockResolvedValue([incoming]);
  api.respond.mockResolvedValue({ id: '1', status: 'ACCEPTED', conversationId: 'chat-1' });
});
it('loads the receiver inbox without any friend/chat screen being mounted', async () => {
  await useFriendRequestStore.getState().refresh();
  expect(useFriendRequestStore.getState().requests).toEqual([incoming]);
});
it('shares one request between global polling and screen refreshes', async () => {
  await Promise.all([useFriendRequestStore.getState().refresh(), useFriendRequestStore.getState().refresh()]);
  expect(api.list).toHaveBeenCalledTimes(1);
});
it('dismisses the banner without rejecting/removing the incoming request', async () => {
  await useFriendRequestStore.getState().refresh();
  useFriendRequestStore.getState().dismiss('1');
  expect(useFriendRequestStore.getState().dismissed).toEqual(['1']);
  expect(useFriendRequestStore.getState().requests).toHaveLength(1);
  expect(api.respond).not.toHaveBeenCalled();
});
it('clears the prior account and ignores its late network response', async () => {
  let release!: (rows: unknown[]) => void;
  api.list.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const loading = useFriendRequestStore.getState().refresh();
  useFriendRequestStore.getState().bind('alice-session');
  release([incoming]);
  await loading;
  expect(useFriendRequestStore.getState().requests).toEqual([]);
});
it('returns the chat on acceptance and cannot be overwritten by an older poll', async () => {
  await useFriendRequestStore.getState().refresh();
  let release!: (rows: unknown[]) => void;
  api.list.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const oldPoll = useFriendRequestStore.getState().refresh();
  api.list.mockResolvedValue([{ ...incoming, status: 'ACCEPTED' }]);
  expect(await useFriendRequestStore.getState().respond('1', 'accept')).toMatchObject({ conversationId: 'chat-1' });
  release([incoming]);
  await oldPoll;
  expect(useFriendRequestStore.getState().requests[0].status).toBe('ACCEPTED');
  expect(api.hydrate).toHaveBeenCalled();
});
it('refreshes the sender chat inbox after the other account accepts', async () => {
  api.list.mockResolvedValueOnce([{ ...incoming, direction: 'outgoing' }]);
  await useFriendRequestStore.getState().refresh();
  api.list.mockResolvedValueOnce([{ ...incoming, direction: 'outgoing', status: 'ACCEPTED' }]);
  await useFriendRequestStore.getState().refresh();
  expect(api.hydrate).toHaveBeenCalledTimes(1);
});
it('keeps pending requests visible when the server fails', async () => {
  await useFriendRequestStore.getState().refresh();
  api.list.mockRejectedValueOnce(new Error('offline'));
  await useFriendRequestStore.getState().refresh();
  expect(useFriendRequestStore.getState().requests).toEqual([incoming]);
  expect(useFriendRequestStore.getState().error).toBe('offline');
});
