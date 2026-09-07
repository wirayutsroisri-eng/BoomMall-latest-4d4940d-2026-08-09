import { beforeEach, expect, it, vi } from 'vitest';
import { subscribeRemotePushHandlers } from './remotePushHandlers';

const mock = vi.hoisted(() => ({
  push: vi.fn(), refresh: vi.fn(), clear: vi.fn(), auth: { hydrated: true, sessionToken: 'bob-token' as string | null, user: { id: 'bob' } as { id: string } | null },
  response: null as null | ((response: unknown) => void), received: null as null | ((notification: unknown) => void), authListener: null as null | (() => void),
  last: null as unknown,
}));
vi.mock('expo-router', () => ({ router: { push: mock.push } }));
vi.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (cb: typeof mock.response) => { mock.response = cb; return { remove: vi.fn() }; },
  addNotificationReceivedListener: (cb: typeof mock.received) => { mock.received = cb; return { remove: vi.fn() }; },
  getLastNotificationResponseAsync: async () => mock.last,
  clearLastNotificationResponseAsync: mock.clear,
}));
vi.mock('@/modules/auth/state/auth-store', () => ({ useAuthStore: { getState: () => mock.auth, subscribe: (cb: () => void) => { mock.authListener = cb; return vi.fn(); } } }));
vi.mock('@/modules/search/state/friend-request-store', () => ({ useFriendRequestStore: { getState: () => ({ refresh: mock.refresh }) } }));
vi.mock('@/modules/chat/data/chatReminder', () => ({ openConversationFromNotification: vi.fn() }));
vi.mock('@/modules/matching/state/matching-notify-store', () => ({ useMatchingNotifyStore: {} }));
vi.mock('@/modules/store/state/seller-notify-store', () => ({ useSellerNotifyStore: {} }));
const notification = (data: object) => ({ request: { content: { data } } });
const request = { type: 'friend-request', requestId: '1', recipientId: 'bob' };
beforeEach(() => { vi.clearAllMocks(); mock.last = null; mock.auth = { hydrated: true, sessionToken: 'bob-token', user: { id: 'bob' } }; });

it('refreshes on foreground delivery without interrupting the current screen', () => {
  const stop = subscribeRemotePushHandlers();
  mock.received!(notification(request));
  expect(mock.refresh).toHaveBeenCalledOnce();
  expect(mock.push).not.toHaveBeenCalled();
  stop();
});
it('opens the request inbox when the recipient taps the push', () => {
  const stop = subscribeRemotePushHandlers();
  mock.response!({ notification: notification(request) });
  expect(mock.push).toHaveBeenCalledWith('/friend-requests');
  expect(mock.clear).toHaveBeenCalledOnce();
  stop();
});
it('opens the direct chat when tapping an acceptance push', () => {
  const stop = subscribeRemotePushHandlers();
  mock.response!({ notification: notification({ ...request, type: 'friend-accepted', conversationId: 'chat-1' }) });
  expect(mock.push).toHaveBeenCalledWith({ pathname: '/(tabs)/chat/[conversationId]', params: { conversationId: 'chat-1' } });
  stop();
});
it('waits for restored login before handling a cold-start tap', async () => {
  mock.auth = { hydrated: false, sessionToken: null, user: null };
  mock.last = { notification: notification(request) };
  const stop = subscribeRemotePushHandlers();
  await Promise.resolve();
  expect(mock.push).not.toHaveBeenCalled();
  mock.auth = { hydrated: true, sessionToken: 'bob-token', user: { id: 'bob' } };
  mock.authListener!();
  expect(mock.push).toHaveBeenCalledWith('/friend-requests');
  stop();
});
it('does not open a different account’s request from an old push', () => {
  mock.auth.user = { id: 'alice' };
  const stop = subscribeRemotePushHandlers();
  mock.response!({ notification: notification(request) });
  expect(mock.push).not.toHaveBeenCalled();
  expect(mock.refresh).not.toHaveBeenCalled();
  stop();
});
