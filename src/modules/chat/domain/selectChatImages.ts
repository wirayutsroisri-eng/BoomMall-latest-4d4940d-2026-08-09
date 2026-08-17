import type { ChatMessage } from '@/modules/chat/domain/types';

export type ChatMediaItem = {
  messageId: string;
  uri: string;
  senderId: string;
  createdAt: string;
  albumIndex?: number;
};

export function messageImageUris(
  message: Pick<ChatMessage, 'kind' | 'imageUri' | 'imageUris'>,
): string[] {
  if (message.kind !== 'image') return [];
  if (message.imageUris && message.imageUris.length) return message.imageUris;
  return message.imageUri ? [message.imageUri] : [];
}

/** Chronological media shared in a conversation (LINE/WeChat album source). */
export function selectChatImages(messages: ChatMessage[]): ChatMediaItem[] {
  const out: ChatMediaItem[] = [];
  for (const m of messages) {
    if (m.kind === 'image') {
      const uris = messageImageUris(m);
      uris.forEach((uri, albumIndex) => {
        out.push({
          messageId: m.id,
          uri,
          senderId: m.senderId,
          createdAt: m.createdAt,
          albumIndex,
        });
      });
      continue;
    }
    if (m.kind === 'order_ref' && m.orderRef?.imageUri) {
      out.push({
        messageId: m.id,
        uri: m.orderRef.imageUri,
        senderId: m.senderId,
        createdAt: m.createdAt,
      });
    }
    if (m.kind === 'content_ref' && m.contentRef?.imageUri) {
      out.push({
        messageId: m.id,
        uri: m.contentRef.imageUri,
        senderId: m.senderId,
        createdAt: m.createdAt,
      });
    }
  }
  return out;
}
