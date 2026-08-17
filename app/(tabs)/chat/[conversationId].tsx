import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ConversationScreen } from '@/modules/chat/ui/ConversationScreen';

export default function ConversationRoute() {
  const { conversationId, from, handle, feedId, noteId, orderId } = useLocalSearchParams<{
    conversationId: string;
    from?: string;
    handle?: string;
    feedId?: string;
    noteId?: string;
    orderId?: string;
  }>();

  return (
    <ConversationScreen
      conversationId={String(conversationId)}
      backContext={{
        from: typeof from === 'string' ? from : undefined,
        handle: typeof handle === 'string' ? handle : undefined,
        feedId: typeof feedId === 'string' ? feedId : undefined,
      }}
      noteId={typeof noteId === 'string' ? noteId : undefined}
      orderId={typeof orderId === 'string' ? orderId : undefined}
    />
  );
}
