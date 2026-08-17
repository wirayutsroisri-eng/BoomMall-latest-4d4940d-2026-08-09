import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { useChatStore } from '@/modules/chat/state/chat-store';
import type { OrderSnapshotCard } from '@/modules/chat/domain/types';
import type { IncomingOrder } from './types';
import { buyerIdOf, shortOrderId, snapshotOfOrder } from './order-snapshot';

export { buyerIdOf, shortOrderId, snapshotOfOrder };

export async function notifyBuyerOrderChat(snapshot: OrderSnapshotCard, conversationId: string) {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('order-chat', {
        name: 'แชทออเดอร์',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      const next = await Notifications.requestPermissionsAsync();
      if (next.status !== 'granted') return;
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ร้านค้าส่งข้อความถึงคุณ',
        body: `เกี่ยวกับออเดอร์ #${shortOrderId(snapshot.orderId)}`,
        sound: true,
        data: {
          type: 'order-chat',
          conversationId,
          orderId: snapshot.orderId,
        },
      },
      trigger: null,
    });
  } catch {
    /* local notify is best-effort */
  }
}

/** Seller order card → shop↔buyer thread with pinned order snapshot */
export function openSellerOrderChat(order: IncomingOrder) {
  const snapshot = snapshotOfOrder(order);
  const { sellerConversationId, buyerConversationId, isNewBuyerCard } = useChatStore
    .getState()
    .startSellerOrderChat({
      buyerId: snapshot.buyerId,
      buyerName: order.customerName,
      buyerAvatarColor: order.customerAvatarColor,
      snapshot,
    });
  if (isNewBuyerCard) void notifyBuyerOrderChat(snapshot, buyerConversationId);
  jumpToChatThread(sellerConversationId, { orderId: order.id });
  return sellerConversationId;
}
