import { Alert, Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';

const CHANNEL_ID = 'chat-reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type ChatReminderPayload = {
  type: 'chat-reminder';
  conversationId: string;
  messageId: string;
};

function isChatJumpData(data: unknown): data is { conversationId: string; orderId?: string } {
  if (!data || typeof data !== 'object') return false;
  const row = data as Record<string, unknown>;
  return (
    typeof row.conversationId === 'string' &&
    (row.type === 'chat-reminder' || row.type === 'order-chat')
  );
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'การแจ้งเตือนข้อความ',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const next = await Notifications.requestPermissionsAsync();
    status = next.status;
  }
  if (status === 'granted') return true;

  Alert.alert(
    'ต้องอนุญาตการแจ้งเตือน',
    'เปิดการแจ้งเตือนของ BoomMall ในการตั้งค่าเครื่อง เพื่อตั้งเตือนข้อความนี้',
    [
      { text: 'ปิด', style: 'cancel' },
      { text: 'เปิดตั้งค่า', onPress: () => void Linking.openSettings() },
    ],
  );
  return false;
}

export async function scheduleChatReminder(input: {
  conversationId: string;
  messageId: string;
  title: string;
  body: string;
  when: Date;
  replaceId?: string | null;
}): Promise<string | null> {
  if (input.when.getTime() <= Date.now() + 5000) {
    Alert.alert('เวลาไม่ถูกต้อง', 'เลือกเวลาที่ยังมาไม่ถึง');
    return null;
  }
  const ok = await ensurePermission();
  if (!ok) return null;

  if (input.replaceId) {
    await Notifications.cancelScheduledNotificationAsync(input.replaceId).catch(() => undefined);
  }

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        sound: true,
        data: {
          type: 'chat-reminder',
          conversationId: input.conversationId,
          messageId: input.messageId,
        } satisfies ChatReminderPayload,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: input.when,
        channelId: CHANNEL_ID,
      },
    });
    return id;
  } catch {
    Alert.alert('ตั้งเตือนไม่สำเร็จ', 'ลองเลือกเวลาใหม่แล้วตั้งอีกครั้ง');
    return null;
  }
}

export async function cancelChatReminder(id?: string | null) {
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

export function openConversationFromNotification(data: unknown) {
  if (!isChatJumpData(data)) return;
  const extra: Record<string, string> = {};
  if (typeof data.orderId === 'string' && data.orderId) extra.orderId = data.orderId;
  jumpToChatThread(data.conversationId, extra);
}

/** Wire once at app start — tap a reminder banner to jump back into the thread. */
export function subscribeChatReminderTaps() {
  const received = Notifications.addNotificationResponseReceivedListener((response) => {
    openConversationFromNotification(response.notification.request.content.data);
  });
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) openConversationFromNotification(response.notification.request.content.data);
  });
  return () => received.remove();
}
