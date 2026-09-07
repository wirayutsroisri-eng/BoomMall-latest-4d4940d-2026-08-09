import { describe, expect, it } from 'vitest';
import { realAvatar, realMessages, realConversation } from './realChatIdentity';
import type { ChatMessage, Conversation } from './types';

describe('real chat identity', () => {
  it('hides stock portraits but keeps user uploads', () => {
    expect(realAvatar('https://i.pravatar.cc/150?u=boommall-a')).toBeUndefined();
    expect(realAvatar('https://picsum.photos/seed/group/240/240')).toBeUndefined();
    expect(realAvatar('https://media.boommall.app/profile/a.jpg')).toBe('https://media.boommall.app/profile/a.jpg');
  });
  it('hides only exact legacy generated greetings, preserving actual and pending messages', () => {
    const generated = { id: 'm-c-shop-a-1', conversationId: 'c-shop-a', senderId: 'peer', text: 'สวัสดีค่ะ ยินดีต้อนรับสู่ A ทักสอบถามสินค้าได้เลยนะคะ' } as ChatMessage;
    const real = { ...generated, id: 'server-123', senderId: 'user-a' };
    const pending = { ...generated, id: 'client-1', senderId: 'me', deliveryStatus: 'failed' } as ChatMessage;
    expect(realMessages([generated, real, pending])).toEqual([real, pending]);
  });
  it('cleans cached previews without changing conversation identity', () => {
    const row = { id: 'c-1', avatarUri: 'https://i.pravatar.cc/150', lastMessage: 'A ตอบรับคำขอเป็นเพื่อนแล้ว 🎉 ทักทายกันได้เลย!' } as Conversation;
    expect(realConversation(row)).toMatchObject({ id: 'c-1', avatarUri: undefined, lastMessage: '' });
  });
});
