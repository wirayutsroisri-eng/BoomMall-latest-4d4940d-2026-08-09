import type { ChatMessage } from '@/modules/chat/domain/types';

export type ChatMediaItem = {
  messageId: string;
  uri: string;
  senderId: string;
  createdAt: string;
};

/** Chronological media shared in a conversation (LINE/WeChat album source). */
export function selectChatImages(messages: ChatMessage[]): ChatMediaItem[] {
  const out: ChatMediaItem[] = [];
  for (const m of messages) {
    if (m.kind === 'image' && m.imageUri) {
      out.push({
        messageId: m.id,
        uri: m.imageUri,
        senderId: m.senderId,
        createdAt: m.createdAt,
      });
      continue;
    }
    // Content-ref cards also count as shared media in the album strip
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
