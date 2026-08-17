import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { StyleSheet } from 'react-native';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useKnowledgeStore } from '@/modules/knowledge/state/knowledge-store';
import { useBoomWalletStore } from '@/modules/wallet/state/boom-wallet-store';
import { useMusicLibraryStore } from '@/modules/music/state/music-library-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { seedActivityFromApp } from '@/modules/account/state/seedActivity';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { subscribeChatReminderTaps } from '@/modules/chat/data/chatReminder';
import { startChatRealtime, isChatSocketConnected } from '@/modules/chat/data/chatSocket';
import { syncModerationContentBlocks } from '@/modules/safety/syncModerationContentBlocks';
import { setCommerceHooks } from '@/modules/commerce/state/inventory-store';
import {
  pullCommerceCatalog,
  pushCommerceDelete,
  pushCommerceProduct,
} from '@/modules/commerce/data/commerceSync';
import { AppPromptHost } from '@/shared/components/AppPrompt';
import { PhotoLibraryHost } from '@/shared/media/PhotoLibraryHost';
import { CreateStudioHost } from '@/modules/create/ui/CreateStudioHost';
import { AvatarPhotoHost } from '@/modules/profile/ui/AvatarPhotoHost';
import {
  hydrateOwnProfileFromServer,
  syncLocalProfilePhotosIfNeeded,
} from '@/modules/profile/data/syncOwnProfile';

type Props = {
  children: React.ReactNode;
};

export function AppProviders({ children }: Props) {
  const hydrateVault = useVaultStore((s) => s.hydrate);
  const hydrateKnowledge = useKnowledgeStore((s) => s.hydrate);
  const hydrateWallet = useBoomWalletStore((s) => s.hydrate);
  const hydrateMusic = useMusicLibraryStore((s) => s.hydrate);
  const hydrateAuth = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    setCommerceHooks({
      onUpsert: pushCommerceProduct,
      onDelete: pushCommerceDelete,
    });
    void hydrateVault();
    void hydrateKnowledge();
    hydrateWallet();
    void hydrateMusic();
    void hydrateAuth().then(() => {
      void pullCommerceCatalog();
      void useFollowStore.getState().hydrateFromServer();
      void useFeedStore.getState().hydrateFromServer();
      void hydrateOwnProfileFromServer().then(() => {
        void syncLocalProfilePhotosIfNeeded();
      });
      void useChatStore.getState().hydrateInbox().finally(() => {
        seedActivityFromApp();
      });
      startChatRealtime({
        onMessage: (msg) => useChatStore.getState().applyRemoteMessage(msg),
        onRead: (payload) =>
          useChatStore.getState().applyReceipt({ ...payload, kind: 'read' }),
        onDelivered: (payload) =>
          useChatStore.getState().applyReceipt({ ...payload, kind: 'delivered' }),
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
    const reminderUnsub = subscribeChatReminderTaps();
    const id = setInterval(() => {
      void syncModerationContentBlocks();
      void pullCommerceCatalog();
      if (!isChatSocketConnected()) {
        void useChatStore.getState().hydrateInbox();
        const active = useChatStore.getState().activeConversationId;
        if (active) void useChatStore.getState().hydrateThread(active);
      }
    }, 8_000);
    return () => {
      clearInterval(id);
      reminderUnsub();
    };
  }, [hydrateVault, hydrateKnowledge, hydrateWallet, hydrateMusic, hydrateAuth]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>
        {children}
        <AppPromptHost />
        <PhotoLibraryHost />
        <CreateStudioHost />
        <AvatarPhotoHost />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
