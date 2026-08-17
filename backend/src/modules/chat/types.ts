export type ChatDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';

export type ChatMessageAttachmentDto = {
  id?: string;
  url: string;
  mimeType: string;
  size: number;
  originalFilename: string;
  width?: number;
  height?: number;
  duration?: number;
};

export type ChatMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  clientMsgId?: string | null;
  createdAt: string;
  /** Public delivery status. DB remains source of truth; this is derived on read. */
  status: ChatDeliveryStatus;
  metadata?: Record<string, unknown>;
  serverSequence?: string;
  kind?: string;
  replyToMessageId?: string | null;
  attachments?: ChatMessageAttachmentDto[];
  isDuplicate?: boolean;
};

export type ChatMessagePage = {
  messages: ChatMessageDto[];
  hasMore: boolean;
};

export type ShopConversationDto = {
  id: string;
  type: 'DIRECT' | 'SHOP' | 'GROUP';
  shopId: string | null;
  shopName: string | null;
  title: string | null;
  updatedAt: string;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  contextProductId?: string | null;
  contextOrderId?: string | null;
  participants: Array<{
    userId: string;
    role: string;
    lastReadAt?: string | null;
    lastDeliveredAt?: string | null;
  }>;
};

export type ChatProductCardDto = {
  id: string;
  variantId?: string;
  title: string;
  sku: string;
  price: number;
  currency: 'THB';
  imageUri?: string;
  shopName?: string;
  shopId?: string;
  soldCount?: number;
  shippingHint?: string;
  returnHint?: string;
  stock?: number;
};

export type ChatCatalogItemDto = {
  productId: string;
  variantId: string;
  title: string;
  sku: string;
  label: string;
  price: number;
  currency: 'THB';
  imageUri?: string;
  shopName?: string;
  shopId: string;
  stock: number;
};

export type ChatSocketAuth = {
  userId: string;
  role?: 'BUYER' | 'SELLER' | 'ADMIN';
  shopId?: string;
};
