import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { openConversationFromNotification } from '@/modules/chat/data/chatReminder';
import { useMatchingNotifyStore } from '@/modules/matching/state/matching-notify-store';
import { useSellerNotifyStore } from '@/modules/store/state/seller-notify-store';

type PushData = Record<string, unknown>;

function readString(data: PushData, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function handlePushData(
  data: unknown,
  content?: { title?: string | null; body?: string | null },
  opts?: { showBanner?: boolean },
) {
  if (!data || typeof data !== 'object') return;
  const row = data as PushData;
  const type = readString(row, 'type');

  if (type === 'chat' || type === 'chat-reminder' || type === 'order-chat') {
    openConversationFromNotification(row);
    return;
  }

  if (type === 'matching') {
    const title = content?.title ?? readString(row, 'title') ?? '⚡ มีงานใหม่ใกล้คุณ!';
    const body =
      content?.body ??
      readString(row, 'body') ??
      'มีงานใหม่ใกล้คุณ! กดดูรายละเอียดเพื่อทักแชท';
    useMatchingNotifyStore.getState().push(
      {
        title,
        body,
        conversationId: readString(row, 'conversationId'),
      },
      { showBanner: opts?.showBanner !== false },
    );
    return;
  }

  if (type === 'seller') {
    const title = content?.title ?? readString(row, 'title') ?? 'แจ้งเตือนร้านค้า';
    const body = content?.body ?? readString(row, 'body') ?? '';
    useSellerNotifyStore.getState().push({
      id: readString(row, 'notificationId') ?? `seller-push-${Date.now()}`,
      title,
      body,
    });
  }
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const content = response.notification.request.content;
  handlePushData(content.data, content, { showBanner: false });

  const type = readString(content.data as PushData, 'type');
  if (type === 'seller') {
    router.push('/store/dashboard');
  }
}

/** Wire remote push taps + foreground banners once at app start. */
export function subscribeRemotePushHandlers() {
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationResponse(response);
  });

  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    const content = notification.request.content;
    handlePushData(content.data, content, { showBanner: true });
  });

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) handleNotificationResponse(response);
  });

  return () => {
    responseSub.remove();
    receivedSub.remove();
  };
}
