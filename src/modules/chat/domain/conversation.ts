import type { Conversation } from './types';

export function isShopConversation(
  conversation: Pick<Conversation, 'kind' | 'inboxRole' | 'shopId'>,
) {
  return (
    conversation.kind === 'official' ||
    conversation.inboxRole === 'buyer' ||
    conversation.inboxRole === 'seller' ||
    Boolean(conversation.shopId)
  );
}

export function isDirectConversation(conversation: Pick<Conversation, 'kind'>) {
  return (conversation.kind ?? 'friend') !== 'group';
}
