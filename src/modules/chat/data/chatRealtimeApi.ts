import { currentShopId, getApiBase, useAuthStore } from '@/modules/auth/state/auth-store';
import type { ProductCard } from '@/modules/chat/domain/types';
import { CHAT_PAGE_SIZE } from '@/modules/chat/domain/message-sync';
import {
  parsePersistedChatMessage,
  parseSyncMessages,
  readApiError,
  type WireChatMessage,
} from '@/modules/chat/domain/chat-api-parse';

export type RemoteChatConversation = {
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

export type RemoteChatMessage = WireChatMessage;

export type RemoteChatCatalogItem = {
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

export type RemoteProductCard = {
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

export type ChatSendAttachment = {
  url: string;
  mimeType: string;
  size?: number;
  originalFilename?: string;
  width?: number;
  height?: number;
  duration?: number;
};

export type ChatSendResult =
  | { ok: true; data: RemoteChatMessage }
  | { ok: false; error: string };

export type RemoteMessagePage = {
  messages: RemoteChatMessage[];
  hasMore: boolean;
};

export function currentChatUserId() {
  return useAuthStore.getState().user?.id ?? '';
}

export function isCurrentChatUser(senderId: string | undefined | null) {
  if (!senderId) return false;
  const me = currentChatUserId();
  return senderId === me || senderId === 'me';
}

function authHeaders() {
  const token = useAuthStore.getState().sessionToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const REQ_TIMEOUT_MS = 12_000;

async function req(method: string, path: string, body?: unknown) {
  const base = getApiBase();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: authHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return null;
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function unwrapData<T>(json: unknown): T | null {
  if (json == null) return null;
  if (typeof json === 'object' && json !== null && 'data' in json) {
    return ((json as { data: T }).data ?? null) as T | null;
  }
  return json as T;
}

export function markChatRead(conversationId: string, userId?: string, sequence?: string) {
  return req('POST', `/api/v1/chat-domain/conversations/${encodeURIComponent(conversationId)}/read`, {
    userId,
    sequence,
  });
}

export function markChatDelivered(conversationId: string, userId?: string) {
  return req(
    'POST',
    `/api/v1/chat-domain/conversations/${encodeURIComponent(conversationId)}/delivered`,
    { userId },
  );
}

export async function sendChatMessageDurable(
  conversationId: string,
  body: string,
  clientMsgId: string,
  senderId?: string,
  metadata?: Record<string, unknown>,
  attempts = 3,
  attachments?: ChatSendAttachment[],
  type?: string,
): Promise<ChatSendResult> {
  const base = getApiBase();
  if (!base) return { ok: false, error: 'no api' };

  let lastError = 'send failed';
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(
        `${base}/api/v1/chat-domain/conversations/${encodeURIComponent(conversationId)}/messages`,
        {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            body,
            content: body,
            clientMsgId,
            clientMessageId: clientMsgId,
            senderId,
            metadata,
            type: type || (attachments?.length ? 'IMAGE' : 'TEXT'),
            attachments: attachments?.length ? attachments : undefined,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      const data = parsePersistedChatMessage(json);
      if (res.ok && data?.id) return { ok: true, data };
      lastError = readApiError(json, `http ${res.status}`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'network';
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** i));
  }
  return { ok: false, error: lastError };
}

export function sendChatMessage(
  conversationId: string,
  body: string,
  clientMsgId?: string,
  senderId?: string,
  metadata?: Record<string, unknown>,
) {
  if (!clientMsgId) return Promise.resolve(null);
  return sendChatMessageDurable(conversationId, body, clientMsgId, senderId, metadata).then((r) =>
    r.ok ? r.data : null,
  );
}

export async function syncRemoteMessages(
  conversationId: string,
  afterSequence?: string,
  limit = 50,
): Promise<RemoteChatMessage[]> {
  const params = new URLSearchParams({ limit: String(Math.min(Math.max(limit, 1), 100)) });
  if (afterSequence) params.set('afterSequence', afterSequence);
  const json = await req(
    'GET',
    `/api/v1/chat-domain/conversations/${encodeURIComponent(conversationId)}/sync?${params}`,
  );
  return parseSyncMessages(json);
}

export async function listRemoteMessages(
  conversationId: string,
  opts?: { limit?: number; before?: string; after?: string; afterSequence?: string; beforeSequence?: string },
): Promise<RemoteMessagePage> {
  const limit = opts?.limit ?? CHAT_PAGE_SIZE;
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts?.before) params.set('before', opts.before);
  if (opts?.after) params.set('after', opts.after);
  if (opts?.afterSequence) params.set('afterSequence', opts.afterSequence);
  if (opts?.beforeSequence) params.set('beforeSequence', opts.beforeSequence);
  const json = await req(
    'GET',
    `/api/v1/chat-domain/conversations/${encodeURIComponent(conversationId)}/messages?${params}`,
  );
  const data = unwrapData<RemoteChatMessage[]>(json);
  const hasMore =
    json && typeof json === 'object' && json !== null && 'hasMore' in json
      ? Boolean((json as { hasMore: unknown }).hasMore)
      : false;
  return { messages: Array.isArray(data) ? data : [], hasMore };
}

export async function fetchChatCatalog(shopId: string): Promise<RemoteChatCatalogItem[]> {
  const json = await req(
    'GET',
    `/api/v1/chat-domain/catalog?shopId=${encodeURIComponent(shopId)}`,
  );
  const data = unwrapData<RemoteChatCatalogItem[]>(json);
  return Array.isArray(data) ? data : [];
}

export function sendProductCardRemote(input: {
  conversationId: string;
  senderId?: string;
  clientMsgId?: string;
  productId?: string;
  variantId?: string;
  sku?: string;
  product: ProductCard;
}) {
  return req(
    'POST',
    `/api/v1/chat-domain/conversations/${encodeURIComponent(input.conversationId)}/product-card`,
    {
      senderId: input.senderId,
      clientMsgId: input.clientMsgId,
      clientMessageId: input.clientMsgId,
      productId: input.productId ?? input.product.id,
      variantId: input.variantId ?? input.product.variantId,
      sku: input.sku ?? input.product.sku,
      title: input.product.title,
      price: input.product.price,
      imageUrl: input.product.imageUri,
      product: input.product,
    },
  );
}

export function ensureDirectChat(peerUserId: string, title?: string) {
  return req('POST', '/api/v1/chat-domain/direct', { peerUserId, title });
}

export async function ensureGroupChat(
  title: string,
  memberIds: string[] = [],
): Promise<RemoteChatConversation | null> {
  const json = await req('POST', '/api/v1/chat-domain/groups', { title, memberIds });
  return unwrapData<RemoteChatConversation>(json);
}

export async function ensureShopChat(input: {
  shopId: string;
  shopName?: string;
  sellerId: string;
  buyerId?: string;
}): Promise<RemoteChatConversation | null> {
  const json = await req('POST', '/api/v1/chat-domain/shop/conversations', input);
  return unwrapData<RemoteChatConversation>(json);
}

function unwrapConversations(json: unknown): RemoteChatConversation[] {
  const data = unwrapData<RemoteChatConversation[]>(json);
  if (Array.isArray(data)) return data;
  if (json && typeof json === 'object' && Array.isArray((json as { conversations?: unknown }).conversations)) {
    return (json as { conversations: RemoteChatConversation[] }).conversations;
  }
  return [];
}

export async function listRemoteConversations(): Promise<RemoteChatConversation[] | null> {
  const json = await req('GET', '/api/v1/chat-domain/inbox');
  if (json == null) return null;
  return unwrapConversations(json);
}

export async function listRemoteShopInbox(shopId = currentShopId()): Promise<RemoteChatConversation[] | null> {
  const json = await req(
    'GET',
    `/api/v1/chat-domain/shop/conversations?shopId=${encodeURIComponent(shopId)}`,
  );
  if (json == null) return null;
  return unwrapConversations(json);
}

export function createOrGetRemoteConversation(input: {
  targetUserId?: string;
  peerUserId?: string;
  type?: 'DIRECT' | 'SHOP' | 'GROUP';
  productId?: string;
  mallOrderId?: string;
  shopId?: string;
  shopName?: string;
  title?: string;
}) {
  return req('POST', '/api/v1/chat-domain/conversations', {
    ...input,
    targetUserId: input.targetUserId ?? input.peerUserId,
  });
}

export function registerPushToken(token: string, platform: string) {
  return req('POST', '/api/v1/notify/devices', { token, platform });
}

export function updateOrderShipping(orderId: string, input: {
  trackingNumber?: string;
  shippingCarrier?: string;
  shippingStatus?: string;
}) {
  return req('PATCH', `/api/v1/commerce/orders/${encodeURIComponent(orderId)}/shipping`, input);
}
