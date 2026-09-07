import { useAuthStore } from '@/modules/auth/state/auth-store';
import { useFriendRequestStore } from '@/modules/search/state/friend-request-store';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { openConversationFromNotification } from '@/modules/chat/data/chatReminder';
import { useMatchingNotifyStore } from '@/modules/matching/state/matching-notify-store';
import { useSellerNotifyStore } from '@/modules/store/state/seller-notify-store';

type PushData = Record<string, unknown>;
let pendingFriendTap: PushData | null = null;

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

  if (type === 'friend-request' || type === 'friend-accepted') {
    const auth = useAuthStore.getState();
    if (!auth.hydrated || !auth.user || !auth.sessionToken) {
      if (opts?.showBanner === false) pendingFriendTap = row;
      return;
    }
    if (readString(row, 'recipientId') !== auth.user.id) return;
    void useFriendRequestStore.getState().refresh();
    if (opts?.showBanner === false) {
      pendingFriendTap = null;
      const conversationId = readString(row, 'conversationId');
      if (type === 'friend-accepted' && conversationId) {
        router.push({ pathname: '/(tabs)/chat/[conversationId]', params: { conversationId } });
      } else router.push('/friend-requests');
      void Notifications.clearLastNotificationResponseAsync();
    }
    return;
  }


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
  const authUnsub = useAuthStore.subscribe(() => {
    if (pendingFriendTap) handlePushData(pendingFriendTap, undefined, { showBanner: false });
  });
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
    authUnsub();
    pendingFriendTap = null;
    responseSub.remove();
    receivedSub.remove();
  };
}
