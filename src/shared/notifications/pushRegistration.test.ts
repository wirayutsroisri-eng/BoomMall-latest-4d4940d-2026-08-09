import { beforeEach, expect, it, vi } from 'vitest';
import { clearPushRegistrationCache, ensurePushRegistered } from './pushRegistration';

const mock = vi.hoisted(() => ({ user: 'alice', register: vi.fn(), channel: vi.fn(), permission: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-constants', () => ({ default: { easConfig: { projectId: 'project-1' } } }));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 }, setNotificationChannelAsync: mock.channel,
  getPermissionsAsync: mock.permission, requestPermissionsAsync: mock.permission,
  getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[same-device]' }),
}));
vi.mock('@/modules/chat/data/chatRealtimeApi', () => ({ registerPushToken: mock.register }));
vi.mock('@/modules/auth/state/auth-store', () => ({ useAuthStore: { getState: () => ({ isAuthenticated: () => true, user: { id: mock.user } }) } }));
beforeEach(() => {
  vi.clearAllMocks(); clearPushRegistrationCache(); mock.user = 'alice';
  mock.permission.mockResolvedValue({ status: 'granted' });
  mock.channel.mockResolvedValue(undefined);
});
it('reassigns the same device push token when switching accounts', async () => {
  await ensurePushRegistered();
  await ensurePushRegistered();
  expect(mock.register).toHaveBeenCalledTimes(1);
  mock.user = 'bob';
  await ensurePushRegistered();
  expect(mock.register).toHaveBeenCalledTimes(2);
});
it('keeps in-app requests usable when notification permission is denied', async () => {
  mock.permission.mockResolvedValue({ status: 'denied' });
  await expect(ensurePushRegistered()).resolves.toBeUndefined();
  expect(mock.register).not.toHaveBeenCalled();
});
it('does not crash app startup when native notification setup is unavailable', async () => {
  mock.channel.mockRejectedValueOnce(new Error('FCM unavailable'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try { await expect(ensurePushRegistered()).resolves.toBeUndefined(); }
  finally { warn.mockRestore(); }
  expect(mock.register).not.toHaveBeenCalled();
});
