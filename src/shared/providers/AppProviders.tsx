import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Alert, StyleSheet } from 'react-native';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useKnowledgeStore } from '@/modules/knowledge/state/knowledge-store';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { seedActivityFromApp } from '@/modules/account/state/seedActivity';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { subscribeRemotePushHandlers } from '@/shared/notifications/remotePushHandlers';
import { ensurePushRegistered, clearPushRegistrationCache } from '@/shared/notifications/pushRegistration';
import { startChatRealtime, isChatSocketConnected } from '@/modules/chat/data/chatSocket';
import { syncModerationContentBlocks } from '@/modules/safety/syncModerationContentBlocks';
import { setCommerceHooks } from '@/modules/commerce/state/inventory-store';
import {
  pullCommerceCatalog,
  pushCommerceDelete,
  pushCommerceProduct,
  setCommerceSyncErrorHandler,
} from '@/modules/commerce/data/commerceSync';
import { AppPromptHost } from '@/shared/components/AppPrompt';
import { PhotoLibraryHost } from '@/shared/media/PhotoLibraryHost';
import { AvatarPhotoHost } from '@/modules/profile/ui/AvatarPhotoHost';
import { hydrateOwnProfileFromServer } from '@/modules/profile/data/syncOwnProfile';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { whenStoresHydrated } from '@/shared/state/whenStoreHydrated';
import { resolveApiBase } from '@/shared/api/apiBase';
import { useWarehouseStore } from '@/modules/warehouse/state/warehouse-store';

type Props = {
  children: React.ReactNode;
};

export function AppProviders({ children }: Props) {
  const hydrateVault = useVaultStore((s) => s.hydrate);
  const hydrateKnowledge = useKnowledgeStore((s) => s.hydrate);
  const hydrateMusic = useMusicLibraryStore((s) => s.hydrate);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const shopId = useAuthStore((s) => s.user?.shopId ?? null);

  useEffect(() => {
    if (shopId) useWarehouseStore.getState().bindShopIdentity(shopId);
  }, [shopId]);

  useEffect(() => {
    const apiBaseUrl = resolveApiBase();
    console.info('[RUNTIME_CONFIG] apiBaseUrl =', apiBaseUrl || '<not configured>');
    console.info('[RUNTIME_CONFIG] mediaApiUrl =', apiBaseUrl ? `${apiBaseUrl}/api/v1/media-assets` : '<not configured>');
  }, []);

  useEffect(() => {
    if (sessionToken) void ensurePushRegistered();
    else clearPushRegistrationCache();
  }, [sessionToken]);

  useEffect(() => {
    if (!authHydrated || !useFeedStore.persist.hasHydrated()) return;
    const changed = useFeedStore.getState().switchAccount(userId);
    if (!changed) return;
    useFollowStore.getState().reset();
    if (userId) {
      void useFollowStore.getState().hydrateFromServer();
      void useFeedStore.getState().hydrateFromServer();
    }
  }, [authHydrated, userId]);

  useEffect(() => {
    if (!authHydrated || !userId || !sessionToken) return;
    void hydrateOwnProfileFromServer().catch((error: unknown) => {
      Alert.alert(
        'โหลดบัญชีไม่สำเร็จ',
        error instanceof Error ? error.message : 'ไม่สามารถดึงข้อมูลบัญชีจากฐานข้อมูลได้',
      );
    });
  }, [authHydrated, sessionToken, userId]);

  useEffect(() => {
    setCommerceSyncErrorHandler(({ operation, message }) => {
      const label = operation === 'pull' ? 'โหลดคลังสินค้า' : 'ซิงก์ข้อมูลร้านค้า';
      Alert.alert(`${label}ไม่สำเร็จ`, `${message}\n\nข้อมูลในเครื่องยังคงอยู่ แต่ยังไม่ถูกบันทึกบนเซิร์ฟเวอร์`);
    });
    setCommerceHooks({
      onUpsert: pushCommerceProduct,
      onDelete: pushCommerceDelete,
    });
    void hydrateVault();
    void hydrateKnowledge();
    void hydrateMusic();
    void hydrateAuth().then(() => {
      const auth = useAuthStore.getState();
      const shopId = auth.user?.shopId;
      if (__DEV__) {
        console.info('[AUTH_IDENTITY]', {
          authenticated: Boolean(auth.sessionToken && auth.user),
          userId: auth.user?.id ?? null,
          shopId: shopId ?? null,
        });
      }
      const authenticated = Boolean(auth.sessionToken && auth.user && shopId);
      void pullCommerceCatalog();
      if (!authenticated) {
        void useChatStore.getState().hydrateInbox();
        clearPushRegistrationCache();
        return;
      }
      useWarehouseStore.getState().bindShopIdentity(shopId!);
      whenStoresHydrated([useLoyaltyStore, useFeedStore], () => {
        void useFollowStore.getState().hydrateFromServer();
        void useFeedStore.getState().hydrateFromServer();
      });
      void ensurePushRegistered();
      void useChatStore.getState().hydrateInbox().finally(() => {
        seedActivityFromApp();
      });
      startChatRealtime({
        onMessage: (msg) => useChatStore.getState().applyRemoteMessage(msg),
        onRead: (payload) =>
          useChatStore.getState().applyReceipt({
            ...payload,
            lastReadAt: payload.lastReadAt ?? undefined,
            lastDeliveredAt: payload.lastDeliveredAt ?? undefined,
            kind: 'read',
          }),
        onDelivered: (payload) =>
          useChatStore.getState().applyReceipt({
            ...payload,
            lastReadAt: payload.lastReadAt ?? undefined,
            lastDeliveredAt: payload.lastDeliveredAt ?? undefined,
            kind: 'delivered',
          }),
        onTyping: (payload) => {
          const conv = useChatStore
            .getState()
            .conversations.find((c) => c.id === payload.conversationId || c.remoteId === payload.conversationId);
          if (conv) useChatStore.getState().setPeerTyping(conv.id, payload.typing);
        },
        onReconnect: () => {
          void useChatStore.getState().hydrateInbox();
          const active = useChatStore.getState().activeConversationId;
          if (active) void useChatStore.getState().hydrateThread(active);
        },
      });
    });
    void syncModerationContentBlocks();
    const pushUnsub = subscribeRemotePushHandlers();
    const id = setInterval(() => {
      void syncModerationContentBlocks();
      void pullCommerceCatalog();
      const auth = useAuthStore.getState();
      if (!auth.sessionToken || !auth.user?.shopId) return;
      if (!isChatSocketConnected()) {
        void useChatStore.getState().hydrateInbox();
        const active = useChatStore.getState().activeConversationId;
        if (active) void useChatStore.getState().hydrateThread(active);
      }
    }, 8_000);
    return () => {
      setCommerceSyncErrorHandler(null);
      clearInterval(id);
      pushUnsub();
    };
  }, [hydrateVault, hydrateKnowledge, hydrateMusic, hydrateAuth]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>
        {children}
        <AppPromptHost />
        <PhotoLibraryHost />
        <AvatarPhotoHost />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
