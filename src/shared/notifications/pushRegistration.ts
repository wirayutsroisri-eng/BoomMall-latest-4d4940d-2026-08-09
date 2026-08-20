import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from '@/modules/chat/data/chatRealtimeApi';
import { useAuthStore } from '@/modules/auth/state/auth-store';

let lastRegisteredToken: string | null = null;

function resolveProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('chat-reminders', {
    name: 'การแจ้งเตือนข้อความ',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
  });
  await Notifications.setNotificationChannelAsync('app-alerts', {
    name: 'การแจ้งเตือนทั่วไป',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 120, 80, 120],
  });
}

/** Register this device for Expo push after login (no-op on web / without permission). */
export async function ensurePushRegistered(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!useAuthStore.getState().isAuthenticated()) return;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const next = await Notifications.requestPermissionsAsync();
    status = next.status;
  }
  if (status !== 'granted') return;

  const projectId = resolveProjectId();
  if (!projectId) {
    console.warn('[push] missing EAS projectId — skip token registration');
    return;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token || token === lastRegisteredToken) return;
    await registerPushToken(token, Platform.OS);
    lastRegisteredToken = token;
  } catch (e) {
    console.warn('[push] register failed', e);
  }
}

export function clearPushRegistrationCache() {
  lastRegisteredToken = null;
}
