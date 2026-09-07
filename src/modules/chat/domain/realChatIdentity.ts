import type { ChatMessage, Conversation } from './types';

/** Old builds used stock portraits as if they belonged to chat participants. */
export function realAvatar(uri?: string | null): string | undefined {
  if (!uri || /^https?:\/\/(?:i\.)?pravatar\.cc\//i.test(uri) || /^https?:\/\/picsum\.photos\//i.test(uri)) return undefined;
  return uri;
}

export function realConversation(row: Conversation): Conversation {
  return { ...row, avatarUri: realAvatar(row.avatarUri), lastMessage: isGeneratedGreeting(row.lastMessage) ? '' : row.lastMessage };
}

function isGeneratedGreeting(text?: string) {
  return Boolean(text && (
    /^สวัสดีครับ\/ค่า ผม\/ดิฉัน .+ ยินดีให้บริการครับ\/ค่ะ ทักมาสอบถามสินค้า\/บริการได้เลยนะครับ$/.test(text) ||
    /^สวัสดีค่ะ ยินดีต้อนรับสู่ .+ ทักสอบถามสินค้าได้เลยนะคะ$/.test(text) ||
    /^.+ ตอบรับคำขอเป็นเพื่อนแล้ว 🎉 ทักทายกันได้เลย!$/.test(text)
  ));
}

/** Hide only identifiable locally generated greetings; keep real and pending messages. */
export function realMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter(m => !(m.senderId === 'peer' && m.id === `m-${m.conversationId}-1` && isGeneratedGreeting(m.text)));
}
