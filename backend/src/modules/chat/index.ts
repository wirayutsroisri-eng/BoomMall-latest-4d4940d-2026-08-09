/**
 * Chat domain — one realtime inbox (Socket.io + Redis) for shop, DM, and group.
 * Feed stays a separate product (posts). Chat Admin moderation stays in services/chatAdmin.
 */

export {
  ensureShopConversation,
  ensureDirectConversation,
  ensureGroupConversation,
  listShopConversations,
  listAllConversations,
  listConversationsForUser,
  createOrGetConversation,
  listMessages,
  listMessagePage,
  persistChatMessage,
  enqueueChatMessage,
  flushCachedMessages,
  getChatRuntimeStatus,
  startChatFlushWorker,
  markConversationDelivered,
} from './services/ChatService';
export {
  listChatCatalog,
  sendWarehouseProductCard,
  sanitizeProductCard,
} from './services/ChatCatalogService';
export {
  getSocialPolicy,
  saveSocialPolicy,
  assertChatSendAllowed,
  reportChatMessage,
  chatSocialDomainStatus,
} from './policies/SocialControlPolicy';
export { ChatService, chatService } from './services/chat.service';
export { UploadService, isObjectStorageConfigured } from './services/upload.service';
export type { ChatMessageDto, ShopConversationDto } from './types';
export { chatDomainRouter, chatAppRouter, createChatRoutes } from './http/routes';
export { ChatController, ProductionChatController, chatController } from './http/chat.controller';
export { attachChatRealtime, getChatIo, emitToConversation, emitToUser } from './realtime/socketServer';
