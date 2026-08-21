import { create } from 'zustand';
import {
  archiveChat as archiveChatAction,
  deleteChat as deleteChatAction,
  muteChat as muteChatAction,
  togglePinChat as togglePinChatAction,
} from '../data/chatActions';
import { createUserStatus, userStatusToMyNote } from '../data/statusService';
import type {
  ActiveNote,
  ChatMessage,
  ContentReferenceCard,
  Conversation,
  JobMatchCard,
  OrderSnapshotCard,
  MessageDeliveryStatus,
  MessageQuote,
  MyNote,
  ProductCard,
  QuotationCard,
  QuotationStatus,
  UserStatus,
} from '../domain/types';
import { quotePreviewLabel } from '../domain/quotePreview';
import {
  CHAT_PAGE_SIZE,
  latestServerCursor,
  latestServerSequence,
  mergeChatMessages,
  newClientMsgId,
  oldestServerCursor,
  oldestServerSequence,
} from '../domain/message-sync';
import { cancelChatReminder } from '../data/chatReminder';
import {
  markChatRead,
  markChatDelivered,
  sendChatMessageDurable,
  sendProductCardRemote,
  listRemoteMessages,
  ensureDirectChat,
  ensureGroupChat,
  ensureShopChat,
  listRemoteConversations,
  listRemoteShopInbox,
  currentChatUserId,
  isCurrentChatUser,
  type ChatSendAttachment,
  type RemoteChatConversation,
  type RemoteChatMessage,
} from '../data/chatRealtimeApi';
import { rememberChatSequence } from '../data/chatSocket';
import { prepareChatMedia, prepareChatMediaList } from '../data/chatMedia';
import { loadAllCachedThreads, loadCachedInbox, loadCachedThread, saveCachedInbox, saveCachedThread } from '../data/chatLocalDb';
import { attachmentsToMessageFields, kindFromRemote } from '../domain/chat-media';
import { MY_SHOP_ID } from '@/modules/warehouse/data/seed';

/** พิมพ์รหัสนี้ในช่องค้นหาแชต เพื่อเผย Hidden Chats */
export const HIDDEN_CHAT_SECRET = 'boom.secret';

type ChatState = {
  conversations: Conversation[];
  messagesById: Record<string, ChatMessage[]>;
  notes: ActiveNote[];
  /** Backend UserStatus for the current user (drives myNote UI). */
  myStatus: UserStatus | null;
  myNote: MyNote | null;
  setMyNote: (text: string, emoji?: string, imageUri?: string) => void;
  clearMyNote: () => void;
  getNoteForConversation: (conversationId: string) => ActiveNote | undefined;
  /** Gesture helpers — aliases matching ChatConversation schema actions */
  togglePinChat: (chatId: string) => void;
  muteChat: (chatId: string) => void;
  archiveChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  hiddenUnlocked: boolean;
  unlockHiddenChats: (query: string) => boolean;
  lockHiddenChats: () => void;
  sendText: (conversationId: string, text: string, quote?: MessageQuote) => void;
  sendImage: (conversationId: string, imageUri: string) => void;
  sendImages: (conversationId: string, imageUris: string[]) => void;
  /** Replace one photo in a chat image / album after in-viewer edit. */
  replaceMessageImage: (
    conversationId: string,
    messageId: string,
    nextUri: string,
    albumIndex?: number,
  ) => void;
  sendFile: (
    conversationId: string,
    file: { fileUri: string; fileName: string; mimeType?: string; fileSize?: number },
  ) => void;
  /** Remove a single message (e.g. delete image from chat album) */
  deleteMessage: (conversationId: string, messageId: string) => void;
  deleteMessages: (conversationId: string, messageIds: string[]) => void;
  /** Drop specific photos from an album bubble; deletes the message if none remain. */
  removeMessageImages: (conversationId: string, messageId: string, indexes: number[]) => void;
  toggleFavorite: (conversationId: string, messageId: string) => void;
  setMessageReminder: (
    conversationId: string,
    messageId: string,
    reminder: { remindAt: string | null; reminderId?: string | null },
  ) => void;
  editMessage: (conversationId: string, messageId: string, text: string) => void;
  forwardMessage: (toConversationId: string, message: ChatMessage) => void;
  sendVoice: (conversationId: string, audioUri: string, durationSec: number) => void;
  sendQuotation: (conversationId: string, quotation: QuotationCard) => void;
  sendProductCard: (conversationId: string, product: ProductCard) => void;
  attachContentReference: (conversationId: string, contentRef: ContentReferenceCard) => void;
  /** Boom automation: attach a Community Board job-match card (system sender). */
  sendJobMatchCard: (conversationId: string, jobMatch: JobMatchCard) => void;
  convertProductToPayment: (conversationId: string, productCardId: string) => void;
  payQuotation: (conversationId: string, quotationId: string) => void;
  setPeerTyping: (conversationId: string, typing: boolean) => void;
  markConversationRead: (conversationId: string) => void;
  /** Inbox [+] — clear unread badges on every visible thread. */
  markAllConversationsRead: () => void;
  /** Long-press — "ระบุว่ายังไม่ได้อ่าน" */
  markConversationUnread: (conversationId: string) => void;
  /** Long-press quick action — "📌 ปักหมุดแชต" (marks for the 📌 filter tab) */
  togglePinConversation: (conversationId: string) => void;
  /** Long-press quick action — "🔕 ปิดเสียง" (toggles mute state) */
  toggleMuteConversation: (conversationId: string) => void;
  toggleAlerts: (conversationId: string) => void;
  setWallpaper: (conversationId: string, wallpaper?: string) => void;
  clearConversationHistory: (conversationId: string) => void;
  /** Invite friends into this thread. 1:1 becomes a group and returns the new id. */
  inviteFriendsToChat: (
    conversationId: string,
    members: Array<{ name: string; handle: string }>,
  ) => string;
  /** Long-press quick action — "📥 ซ่อน / จัดเก็บ" (removes from every list until restored) */
  archiveConversation: (conversationId: string) => void;
  /** Long-press quick action — "🗑️ ลบแชต" (removes the conversation entirely) */
  deleteConversation: (conversationId: string) => void;
  getConversation: (id: string) => Conversation | undefined;
  queueBotReply: (conversationId: string, replyText: string) => void;
  /**
   * Opens / creates a 1-on-1 DM with a creator. When `contentRef` is provided,
   * auto-attaches a Content Reference Card so both sides see which Feed clip triggered the chat.
   */
  startConversationWithCreator: (
    peerName: string,
    peerHandle: string,
    avatarColor: string,
    contentRef?: ContentReferenceCard,
  ) => string;
  /** Customer → shop thread in the same Chat tab inbox (Facebook Page / Marketplace). */
  startShopConversation: (input: {
    shopId: string;
    shopName: string;
    sellerId?: string;
    avatarColor?: string;
  }) => string;
  /** Seller → buyer thread, auto-attaches an order snapshot card. */
  startSellerOrderChat: (input: {
    buyerId: string;
    buyerName: string;
    buyerAvatarColor?: string;
    snapshot: OrderSnapshotCard;
  }) => { sellerConversationId: string; buyerConversationId: string; isNewBuyerCard: boolean };
  attachOrderReference: (conversationId: string, snapshot: OrderSnapshotCard) => boolean;
  /** Pull shop + DM + group threads into this device's Chat tab. */
  hydrateInbox: () => Promise<void>;
  /** True while hydrateInbox is running (prevents duplicate calls). */
  hydratingInbox: boolean;
  /** Merge server-backed text / product cards into an open thread. */
  hydrateThread: (conversationId: string, opts?: { after?: string }) => Promise<void>;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  applyRemoteMessage: (dto: RemoteChatMessage) => void;
  applyReceipt: (payload: {
    conversationId: string;
    lastReadAt?: string;
    lastDeliveredAt?: string;
    kind: 'read' | 'delivered';
  }) => void;
  retryFailedMessage: (conversationId: string, messageId: string) => void;
  setActiveConversation: (id: string | null) => void;
  activeConversationId: string | null;
  hasMoreOlderById: Record<string, boolean>;
  loadingOlderById: Record<string, boolean>;
  /** Creates a brand-new private Group Chat (LINE-style) and returns its conversationId. */
  /** Creates a private group chat, seeds the thread, and returns its conversationId. */
  createGroup: (name: string, members?: Array<{ name: string; handle: string }>) => string;
  /** Adds/updates a friend conversation from the Add-Friend / QR flow. Returns the conversationId. */
  addFriend: (name: string, handle: string) => string;
};

function normalizeHandle(handle: string) {
  return handle.trim().toLowerCase().replace(/^@/, '');
}

const AVATAR_PALETTE = ['#00D68F', '#2E8CFF', '#F5A524', '#FE2C55', '#00A86B', '#C9A227'];
function colorForSeed(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function avatarUriForSeed(seed: string) {
  return `https://i.pravatar.cc/150?u=boommall-${normalizeHandle(seed)}`;
}

function bumpConversation(
  list: Conversation[],
  id: string,
  patch?: Partial<Conversation>,
): Conversation[] {
  const found = list.find((c) => c.id === id);
  if (!found) return list;
  return [{ ...found, ...patch }, ...list.filter((c) => c.id !== id)];
}

function shortCustomerLabel(userId?: string) {
  if (!userId) return 'ลูกค้า';
  const tail = userId.replace(/^@/, '').slice(-4);
  return tail ? `ลูกค้า ${tail}` : 'ลูกค้า';
}

function mapRemoteConversation(
  row: RemoteChatConversation,
  me: string,
  myShopId: string,
): Conversation {
  const buyer = row.participants.find((p) => p.role === 'BUYER');
  const iAmBuyer = buyer?.userId === me;
  const incomingToMyShop =
    row.type === 'SHOP' && Boolean(row.shopId) && row.shopId === myShopId && !iAmBuyer;
  const kind: Conversation['kind'] =
    row.type === 'GROUP' ? 'group' : row.type === 'SHOP' ? 'official' : 'friend';
  const peerName = incomingToMyShop
    ? shortCustomerLabel(buyer?.userId)
    : row.shopName || row.title || 'แชท';
  const peerHandle = incomingToMyShop
    ? `@${buyer?.userId ?? 'customer'}`
    : `@${row.shopId || row.title || row.id}`;
  return {
    id: row.id,
    remoteId: row.id,
    shopId: row.shopId ?? undefined,
    inboxRole: incomingToMyShop ? 'seller' : row.type === 'SHOP' ? 'buyer' : undefined,
    peerName,
    peerHandle,
    lastMessage: row.lastMessage?.trim() || (incomingToMyShop ? 'ลูกค้าทักแชทร้าน' : 'ทักแชทได้เลย'),
    unread: incomingToMyShop ? 1 : 0,
    isHidden: false,
    updatedAt: row.lastMessageAt ? formatRemoteStamp(row.lastMessageAt) : formatRemoteStamp(row.updatedAt),
    avatarColor: colorForSeed(peerHandle),
    avatarUri: avatarUriForSeed(peerHandle),
    kind,
    memberCount: row.type === 'GROUP' ? row.participants.length : undefined,
  };
}

function findLocalMatch(
  list: Conversation[],
  row: RemoteChatConversation,
  me: string,
): Conversation | undefined {
  const byId = list.find((c) => c.id === row.id || c.remoteId === row.id);
  if (byId) return byId;
  if (row.type !== 'SHOP' || !row.shopId) return undefined;
  const buyer = row.participants.find((p) => p.role === 'BUYER');
  const iAmBuyer = buyer?.userId === me;
  return list.find((c) => {
    if ((c.kind ?? 'friend') !== 'official' || c.shopId !== row.shopId) return false;
    if (iAmBuyer) return c.inboxRole !== 'seller';
    return (
      c.inboxRole === 'seller' &&
      normalizeHandle(c.peerHandle) === normalizeHandle(buyer?.userId ?? '')
    );
  });
}

function apiConversationId(conversationId: string, list: Conversation[]) {
  const found = list.find((c) => c.id === conversationId || c.remoteId === conversationId);
  return found?.remoteId ?? conversationId;
}

function shopActorId(conversationId: string, list: Conversation[]) {
  const found = list.find((c) => c.id === conversationId || c.remoteId === conversationId);
  return found?.inboxRole === 'seller' ? MY_SHOP_ID : currentChatUserId();
}

function isOwnChatSender(senderId: string, conversation?: Conversation) {
  if (isCurrentChatUser(senderId)) return true;
  return conversation?.inboxRole === 'seller' && senderId === MY_SHOP_ID;
}

function formatRemoteStamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'ตอนนี้';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'ตอนนี้';
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function productFromMetadata(meta?: Record<string, unknown>): ProductCard | null {
  if (!meta || meta.kind !== 'product' || !meta.product || typeof meta.product !== 'object') {
    return null;
  }
  const row = meta.product as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!id || !title) return null;
  const price = typeof row.price === 'number' ? row.price : Number(row.price);
  return {
    id,
    variantId: typeof row.variantId === 'string' ? row.variantId : undefined,
    title,
    sku: typeof row.sku === 'string' && row.sku.trim() ? row.sku : id,
    price: Number.isFinite(price) ? price : 0,
    currency: 'THB',
    imageUri: typeof row.imageUri === 'string' ? row.imageUri : undefined,
    shopName: typeof row.shopName === 'string' ? row.shopName : undefined,
    shopId: typeof row.shopId === 'string' ? row.shopId : undefined,
    soldCount: typeof row.soldCount === 'number' ? row.soldCount : undefined,
    shippingHint: typeof row.shippingHint === 'string' ? row.shippingHint : undefined,
    returnHint: typeof row.returnHint === 'string' ? row.returnHint : undefined,
  };
}

function mapDelivery(status: string): MessageDeliveryStatus {
  if (status === 'read') return 'read';
  if (status === 'delivered') return 'delivered';
  if (status === 'failed') return 'failed';
  return 'sent';
}

function quoteFromMetadata(meta?: Record<string, unknown>): MessageQuote | undefined {
  if (!meta || typeof meta.quote !== 'object' || meta.quote == null) return undefined;
  const row = meta.quote as Record<string, unknown>;
  const messageId = typeof row.messageId === 'string' ? row.messageId : '';
  if (!messageId) return undefined;
  return {
    messageId,
    kind: (typeof row.kind === 'string' ? row.kind : 'text') as MessageQuote['kind'],
    text: typeof row.text === 'string' ? row.text : undefined,
    imageUri: typeof row.imageUri === 'string' ? row.imageUri : undefined,
    fileName: typeof row.fileName === 'string' ? row.fileName : undefined,
    senderName: typeof row.senderName === 'string' ? row.senderName : undefined,
  };
}

function mapRemoteMessage(
  dto: RemoteChatMessage,
  localConversationId: string,
  conversation?: Conversation,
): ChatMessage {
  const product = productFromMetadata(dto.metadata);
  const media = attachmentsToMessageFields(dto.attachments);
  const own = isOwnChatSender(dto.senderId, conversation);
  const deliveryStatus = mapDelivery(dto.status);
  const kind = product ? 'product' : media.kind ?? kindFromRemote(dto.kind, dto.attachments);
  return {
    id: dto.clientMsgId || dto.id,
    conversationId: localConversationId,
    senderId: own ? currentChatUserId() : dto.senderId,
    kind,
    text: product || kind !== 'text' ? undefined : dto.body,
    product: product ?? undefined,
    quote: quoteFromMetadata(dto.metadata),
    createdAt: formatRemoteStamp(dto.createdAt),
    createdAtIso: dto.createdAt,
    serverId: dto.id,
    clientMsgId: dto.clientMsgId ?? dto.id,
    serverSequence: dto.serverSequence,
    deliveryStatus,
    readAt: own
      ? deliveryStatus === 'read'
        ? 'อ่านแล้ว'
        : deliveryStatus === 'delivered'
          ? 'ถึงแล้ว'
          : 'ส่งแล้ว'
      : null,
    ...(product ? {} : media),
  };
}

function patchThread(
  state: { messagesById: Record<string, ChatMessage[]>; conversations: Conversation[] },
  localId: string,
  incoming: ChatMessage[],
) {
  const local = state.messagesById[localId] ?? [];
  const merged = mergeChatMessages(local, incoming);
  const last = merged[merged.length - 1];
  const preview =
    last?.kind === 'product' && last.product
      ? `📦 ${last.product.title}`
      : last?.kind === 'image'
        ? '📷 รูปภาพ'
        : last?.text?.trim();
  return {
    messagesById: { ...state.messagesById, [localId]: merged },
    conversations: preview
      ? bumpConversation(state.conversations, localId, {
          lastMessage: preview,
          updatedAt: 'ตอนนี้',
        })
      : state.conversations,
  };
}

async function waitForRemoteId(
  conversationId: string,
  read: () => Conversation[],
  timeoutMs = 6000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = read().find((c) => c.id === conversationId || c.remoteId === conversationId);
    if (found?.remoteId) return found.remoteId;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return apiConversationId(conversationId, read());
}

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function persistConversationSoon(
  conversationId: string,
  read: () => { messagesById: Record<string, ChatMessage[]>; conversations: Conversation[] },
) {
  const prev = persistTimers.get(conversationId);
  if (prev) clearTimeout(prev);
  persistTimers.set(
    conversationId,
    setTimeout(() => {
      const state = read();
      void saveCachedThread(conversationId, state.messagesById[conversationId] ?? []);
      if (state.conversations.some((c) => c.remoteId)) {
        void saveCachedInbox(state.conversations);
      }
    }, 180),
  );
}

function markOutgoingStatus(
  set: (fn: (state: ChatState) => Partial<ChatState>) => void,
  conversationId: string,
  messageId: string,
  deliveryStatus: MessageDeliveryStatus,
) {
  set((state) => ({
    messagesById: {
      ...state.messagesById,
      [conversationId]: (state.messagesById[conversationId] ?? []).map((m) =>
        m.id === messageId || m.clientMsgId === messageId ? { ...m, deliveryStatus } : m,
      ),
    },
  }));
}

async function completeOutgoing(
  conversationId: string,
  message: ChatMessage,
  get: () => ChatState,
  set: (fn: (state: ChatState) => Partial<ChatState> | ChatState) => void,
) {
  try {
    const remoteId = await waitForRemoteId(conversationId, () => get().conversations);
    const actor = shopActorId(conversationId, get().conversations);
    let attachments: ChatSendAttachment[] | undefined;
    let body = message.text ?? '';
    let type = 'TEXT';
    let metadata: Record<string, unknown> | undefined = message.quote
      ? { kind: 'text', quote: message.quote }
      : undefined;

    if (message.kind === 'image') {
      const uris = message.imageUris?.length
        ? message.imageUris
        : message.imageUri
          ? [message.imageUri]
          : [];
      attachments = await prepareChatMediaList(uris);
      body = '';
      type = 'IMAGE';
    } else if (message.kind === 'voice' && message.audioUri) {
      attachments = [
        await prepareChatMedia(message.audioUri, {
          mimeType: message.mimeType || 'audio/mp4',
          filename: 'voice.m4a',
          durationSec: message.durationSec,
        }),
      ];
      body = '';
      type = 'VOICE';
    } else if (message.kind === 'file' && message.fileUri) {
      attachments = [
        await prepareChatMedia(message.fileUri, {
          mimeType: message.mimeType || 'application/octet-stream',
          filename: message.fileName || 'file',
        }),
      ];
      body = '';
      type = 'FILE';
    }

    const result = await sendChatMessageDurable(
      remoteId,
      body,
      message.clientMsgId ?? message.id,
      actor,
      metadata,
      3,
      attachments,
      type,
    );
    if (!result.ok) {
      markOutgoingStatus(set, conversationId, message.id, 'failed');
      persistConversationSoon(conversationId, () => get());
      return;
    }
    set((state) =>
      patchThread(state, conversationId, [
        mapRemoteMessage(result.data, conversationId, get().getConversation(conversationId)),
      ]),
    );
    rememberChatSequence(remoteId, result.data.serverSequence);
    persistConversationSoon(conversationId, () => get());
  } catch {
    markOutgoingStatus(set, conversationId, message.id, 'failed');
    persistConversationSoon(conversationId, () => get());
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messagesById: {},
  notes: [],
  activeConversationId: null,
  hasMoreOlderById: {},
  loadingOlderById: {},
  hydratingInbox: false,
  myStatus: null,
  myNote: null,
  setMyNote: (text, emoji = '📷', imageUri) => {
    const status = createUserStatus(currentChatUserId(), text, true, imageUri);
    set({ myStatus: status, myNote: userStatusToMyNote(status, emoji) });
  },
  clearMyNote: () => set({ myStatus: null, myNote: null }),
  getNoteForConversation: (conversationId) =>
    get().notes.find((n) => n.conversationId === conversationId),
  hiddenUnlocked: false,
  unlockHiddenChats: (query) => {
    const ok = query.trim().toLowerCase() === HIDDEN_CHAT_SECRET;
    if (ok) set({ hiddenUnlocked: true });
    return ok;
  },
  lockHiddenChats: () => set({ hiddenUnlocked: false }),
  getConversation: (id) =>
    get().conversations.find((c) => c.id === id || c.remoteId === id),

  startConversationWithCreator: (peerName, peerHandle, avatarColor, contentRef) => {
    const target = normalizeHandle(peerHandle);
    const existing = get().conversations.find((c) => normalizeHandle(c.peerHandle) === target);

    if (existing) {
      if (contentRef) get().attachContentReference(existing.id, contentRef);
      set((state) => ({ conversations: bumpConversation(state.conversations, existing.id) }));
      return existing.id;
    }

    const id = `c-creator-${target}`;
    const greeting = `สวัสดีครับ/ค่า ผม/ดิฉัน ${peerName} ยินดีให้บริการครับ/ค่ะ ทักมาสอบถามสินค้า/บริการได้เลยนะครับ`;
    const seedMessages: ChatMessage[] = [];
    let lastMessage = greeting;

    // Content Reference Card first — both sides see which Feed clip triggered the DM
    if (contentRef) {
      seedMessages.push({
        id: `m-ref-${contentRef.feedId}-${Date.now()}`,
        conversationId: id,
        senderId: currentChatUserId(),
        kind: 'content_ref',
        contentRef,
        createdAt: 'ตอนนี้',
        readAt: null,
      });
      lastMessage = `📎 สอบถามจาก: ${contentRef.title}`;
    }

    seedMessages.push({
      id: `m-${id}-1`,
      conversationId: id,
      senderId: 'peer',
      kind: 'text',
      text: greeting,
      createdAt: 'ตอนนี้',
      readAt: null,
    });

    const conversation: Conversation = {
      id,
      peerName,
      peerHandle,
      lastMessage,
      unread: 0,
      isHidden: false,
      updatedAt: 'ตอนนี้',
      avatarColor,
      avatarUri: avatarUriForSeed(peerHandle || peerName),
      kind: 'official',
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      messagesById: { ...state.messagesById, [id]: seedMessages },
    }));
    void ensureDirectChat(target, peerName);
    return id;
  },

  startShopConversation: ({ shopId, shopName, sellerId, avatarColor }) => {
    const idKey = normalizeHandle(shopId || shopName);
    const existing = get().conversations.find(
      (c) =>
        (c.shopId && c.shopId === shopId && c.inboxRole !== 'seller') ||
        normalizeHandle(c.peerHandle) === idKey,
    );
    if (existing) {
      set((state) => ({ conversations: bumpConversation(state.conversations, existing.id) }));
      void ensureShopChat({
        shopId,
        shopName,
        sellerId: sellerId || shopId,
        buyerId: currentChatUserId(),
      }).then((remote) => {
        if (!remote?.id) return;
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === existing.id ? { ...c, remoteId: remote.id, shopId } : c,
          ),
        }));
      });
      return existing.id;
    }

    const id = `c-shop-${idKey}`;
    const greeting = `สวัสดีค่ะ ยินดีต้อนรับสู่ ${shopName} ทักสอบถามสินค้าได้เลยนะคะ`;
    const conversation: Conversation = {
      id,
      peerName: shopName,
      peerHandle: shopId.startsWith('@') ? shopId : `@${shopId}`,
      lastMessage: greeting,
      unread: 0,
      isHidden: false,
      updatedAt: 'ตอนนี้',
      avatarColor: avatarColor ?? colorForSeed(shopId || shopName),
      avatarUri: avatarUriForSeed(shopId || shopName),
      kind: 'official',
      shopId,
      inboxRole: 'buyer',
    };
    const seed: ChatMessage = {
      id: `m-${id}-1`,
      conversationId: id,
      senderId: 'peer',
      kind: 'text',
      text: greeting,
      createdAt: 'ตอนนี้',
      readAt: null,
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      messagesById: { ...state.messagesById, [id]: [seed] },
    }));
    void ensureShopChat({
      shopId,
      shopName,
      sellerId: sellerId || shopId,
      buyerId: currentChatUserId(),
    }).then((remote) => {
      if (!remote?.id) return;
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, remoteId: remote.id } : c,
        ),
      }));
    });
    return id;
  },

  startSellerOrderChat: ({ buyerId, buyerName, buyerAvatarColor, snapshot }) => {
    const shopName = 'Boom EV Shop Chanthaburi';
    const handle = buyerId.startsWith('@') ? buyerId : `@${buyerId}`;
    const existing = get().conversations.find(
      (c) =>
        c.inboxRole === 'seller' &&
        c.shopId === snapshot.shopId &&
        normalizeHandle(c.peerHandle) === normalizeHandle(handle),
    );

    const sellerConversationId = existing?.id
      ?? `c-order-${normalizeHandle(snapshot.shopId)}-${normalizeHandle(buyerId)}`;

    if (!existing) {
      const conversation: Conversation = {
        id: sellerConversationId,
        peerName: buyerName,
        peerHandle: handle,
        lastMessage: `เกี่ยวกับออเดอร์ #${snapshot.orderId}`,
        unread: 0,
        isHidden: false,
        updatedAt: 'ตอนนี้',
        avatarColor: buyerAvatarColor ?? colorForSeed(buyerId),
        avatarUri: avatarUriForSeed(buyerId),
        kind: 'official',
        shopId: snapshot.shopId,
        inboxRole: 'seller',
      };
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        messagesById: { ...state.messagesById, [sellerConversationId]: [] },
      }));
    }

    get().attachOrderReference(sellerConversationId, snapshot);
    set((state) => ({ conversations: bumpConversation(state.conversations, sellerConversationId) }));
    void ensureShopChat({
      shopId: snapshot.shopId,
      shopName,
      sellerId: snapshot.shopId,
      buyerId,
    }).then((remote) => {
      if (!remote?.id) return;
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === sellerConversationId ? { ...c, remoteId: remote.id } : c,
        ),
      }));
    });

    const buyerExisting = get().conversations.find(
      (c) => c.shopId === snapshot.shopId && c.inboxRole === 'buyer',
    );
    const buyerConversationId =
      buyerExisting?.id ??
      `c-order-buy-${normalizeHandle(snapshot.shopId)}-${normalizeHandle(buyerId)}`;
    if (!buyerExisting) {
      const buyerThread: Conversation = {
        id: buyerConversationId,
        peerName: shopName,
        peerHandle: snapshot.shopId.startsWith('@') ? snapshot.shopId : `@${snapshot.shopId}`,
        lastMessage: `ร้านค้าส่งข้อความเกี่ยวกับออเดอร์ #${snapshot.orderId}`,
        unread: 1,
        isHidden: false,
        updatedAt: 'ตอนนี้',
        avatarColor: colorForSeed(snapshot.shopId),
        avatarUri: avatarUriForSeed(snapshot.shopId),
        kind: 'official',
        shopId: snapshot.shopId,
        inboxRole: 'buyer',
      };
      set((state) => ({
        conversations: [buyerThread, ...state.conversations],
        messagesById: { ...state.messagesById, [buyerConversationId]: [] },
      }));
    }
    const isNewBuyerCard = get().attachOrderReference(buyerConversationId, snapshot);
    if (buyerExisting && isNewBuyerCard) {
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === buyerConversationId
            ? {
                ...c,
                lastMessage: `ร้านค้าส่งข้อความเกี่ยวกับออเดอร์ #${snapshot.orderId}`,
                unread: c.unread + 1,
                updatedAt: 'ตอนนี้',
              }
            : c,
        ),
      }));
    }

    return { sellerConversationId, buyerConversationId, isNewBuyerCard };
  },

  attachOrderReference: (conversationId, snapshot) => {
    const existing = get().messagesById[conversationId] ?? [];
    const already = existing.some(
      (m) => m.kind === 'order_ref' && m.orderRef?.orderId === snapshot.orderId,
    );
    if (already) return false;
    const message: ChatMessage = {
      id: `m-order-${snapshot.orderId}-${Date.now()}`,
      conversationId,
      senderId: MY_SHOP_ID,
      kind: 'order_ref',
      orderRef: snapshot,
      createdAt: 'ตอนนี้',
      readAt: null,
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: `เกี่ยวกับออเดอร์ #${snapshot.orderId}`,
              updatedAt: 'ตอนนี้',
            }
          : c,
      ),
    }));
    return true;
  },

  hydrateInbox: async () => {
    if (get().hydratingInbox) return;
    set({ hydratingInbox: true });
    try {
    const cachedInbox = await loadCachedInbox();
    const cachedThreads = await loadAllCachedThreads();
    if (cachedInbox.length || Object.keys(cachedThreads).length) {
      set((state) => {
        const next = [...state.conversations];
        for (const row of cachedInbox) {
          if (!row.remoteId) continue;
          if (!next.some((c) => c.id === row.id || c.remoteId === row.remoteId)) next.push(row);
        }
        const messagesById = { ...state.messagesById };
        for (const [id, msgs] of Object.entries(cachedThreads)) {
          messagesById[id] = mergeChatMessages(messagesById[id] ?? [], msgs);
        }
        return { conversations: next, messagesById };
      });
    }

    const me = currentChatUserId();
    const [mine, shopInbox] = await Promise.all([
      listRemoteConversations(),
      listRemoteShopInbox(MY_SHOP_ID),
    ]);
    if (mine == null) { set({ hydratingInbox: false }); return; }

    const seen = new Set<string>();
    const rows: RemoteChatConversation[] = [];
    for (const row of [...(shopInbox ?? []), ...mine]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }

    set((state) => {
      const incoming: Conversation[] = [];
      const pingIds: string[] = [];
      for (const row of rows) {
        const mapped = mapRemoteConversation(row, me, MY_SHOP_ID);
        const match = findLocalMatch(state.conversations, row, me);
        if (match) {
          const preview = row.lastMessage?.trim();
          const sellerPing =
            mapped.inboxRole === 'seller' && Boolean(preview) && preview !== match.lastMessage;
          incoming.push({
            ...match,
            ...mapped,
            id: match.id,
            remoteId: row.id,
            lastMessage: preview || match.lastMessage,
            unread: sellerPing ? Math.max(match.unread, 1) : match.unread,
            isPinned: match.isPinned,
            isMuted: match.isMuted,
            isHidden: match.isHidden,
            inboxRole: match.inboxRole ?? mapped.inboxRole,
            updatedAt: sellerPing
              ? 'ตอนนี้'
              : mapped.updatedAt,
          });
          if (sellerPing) pingIds.push(match.id);
        } else {
          incoming.push(mapped);
        }
      }
      const remoteKeys = new Set(
        incoming.flatMap((c) => [c.id, c.remoteId].filter((id): id is string => Boolean(id))),
      );
      const localOnly = state.conversations.filter(
        (c) => !c.remoteId && !remoteKeys.has(c.id),
      );
      const sellerIncoming = incoming.filter((c) => c.inboxRole === 'seller');
      const otherIncoming = incoming.filter((c) => c.inboxRole !== 'seller');
      let ordered = [...sellerIncoming, ...otherIncoming, ...localOnly];
      for (const id of [...pingIds].reverse()) {
        ordered = bumpConversation(ordered, id);
      }
      return { conversations: ordered };
    });
    void saveCachedInbox(get().conversations);
    } finally {
      set({ hydratingInbox: false });
    }
  },

  hydrateThread: async (conversationId, opts) => {
    const conversation = get().conversations.find(
      (c) => c.id === conversationId || c.remoteId === conversationId,
    );
    const localId = conversation?.id ?? conversationId;
    if (!opts?.after) {
      const cached = await loadCachedThread(localId);
      if (cached.length) {
        set((state) => patchThread(state, localId, cached));
      }
    }
    if (!conversation?.remoteId) return;
    const seq = latestServerSequence(get().messagesById[conversation.id] ?? []);
    const after = opts?.after ?? latestServerCursor(get().messagesById[conversation.id] ?? []);
    const hasServerRows = (get().messagesById[conversation.id] ?? []).some((m) => m.serverId);
    const page = await listRemoteMessages(conversation.remoteId, {
      limit: CHAT_PAGE_SIZE,
      afterSequence: seq,
      after: seq ? undefined : opts?.after || hasServerRows ? after : undefined,
    });
    if (!page.messages.length) {
      if (!opts?.after) {
        set((state) => ({
          hasMoreOlderById: { ...state.hasMoreOlderById, [conversation.id]: page.hasMore },
        }));
      }
      persistConversationSoon(conversation.id, () => get());
      return;
    }
    const incoming = [...page.messages]
      .reverse()
      .map((row) => mapRemoteMessage(row, conversation.id, conversation));
    set((state) => ({
      ...patchThread(state, conversation.id, incoming),
      hasMoreOlderById: {
        ...state.hasMoreOlderById,
        [conversation.id]: opts?.after ? state.hasMoreOlderById[conversation.id] ?? true : page.hasMore,
      },
    }));
    const actor = shopActorId(conversation.id, get().conversations);
    void markChatDelivered(conversation.remoteId, actor);
    rememberChatSequence(
      conversation.remoteId,
      latestServerSequence(get().messagesById[conversation.id] ?? []),
    );
    persistConversationSoon(conversation.id, () => get());
  },

  loadOlderMessages: async (conversationId) => {
    const conversation = get().getConversation(conversationId);
    if (!conversation?.remoteId) return;
    if (get().loadingOlderById[conversation.id]) return;
    if (get().hasMoreOlderById[conversation.id] === false) return;
    const beforeSeq = oldestServerSequence(get().messagesById[conversation.id] ?? []);
    const before = oldestServerCursor(get().messagesById[conversation.id] ?? []);
    if (!beforeSeq && !before) return;
    set((state) => ({
      loadingOlderById: { ...state.loadingOlderById, [conversation.id]: true },
    }));
    const page = await listRemoteMessages(conversation.remoteId, {
      limit: CHAT_PAGE_SIZE,
      beforeSequence: beforeSeq,
      before: beforeSeq ? undefined : before,
    });
    const incoming = [...page.messages]
      .reverse()
      .map((row) => mapRemoteMessage(row, conversation.id, conversation));
    set((state) => ({
      ...patchThread(state, conversation.id, incoming),
      hasMoreOlderById: { ...state.hasMoreOlderById, [conversation.id]: page.hasMore },
      loadingOlderById: { ...state.loadingOlderById, [conversation.id]: false },
    }));
  },

  applyRemoteMessage: (dto) => {
    const conversation = get().conversations.find(
      (c) => c.id === dto.conversationId || c.remoteId === dto.conversationId,
    );
    if (!conversation) {
      void get().hydrateInbox();
      return;
    }
    const mapped = mapRemoteMessage(dto, conversation.id, conversation);
    const isOwn = isCurrentChatUser(mapped.senderId);
    const active = get().activeConversationId === conversation.id;
    set((state) => {
      const next = patchThread(state, conversation.id, [mapped]);
      if (isOwn || active) return next;
      return {
        ...next,
        conversations: next.conversations.map((c) =>
          c.id === conversation.id ? { ...c, unread: c.unread + 1 } : c,
        ),
      };
    });
    if (conversation.remoteId) {
      rememberChatSequence(conversation.remoteId, dto.serverSequence);
      void markChatDelivered(conversation.remoteId, shopActorId(conversation.id, get().conversations));
      if (active) {
        void markChatRead(
          conversation.remoteId,
          shopActorId(conversation.id, get().conversations),
          latestServerSequence(get().messagesById[conversation.id] ?? []),
        );
      }
    }
    persistConversationSoon(conversation.id, () => get());
  },

  applyReceipt: (payload) => {
    const conversation = get().conversations.find(
      (c) => c.id === payload.conversationId || c.remoteId === payload.conversationId,
    );
    if (!conversation) return;
    const readAt = payload.lastReadAt ? new Date(payload.lastReadAt).getTime() : 0;
    const deliveredAt = payload.lastDeliveredAt
      ? new Date(payload.lastDeliveredAt).getTime()
      : payload.kind === 'read'
        ? readAt
        : 0;
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversation.id]: (state.messagesById[conversation.id] ?? []).map((m) => {
          if (!isCurrentChatUser(m.senderId)) return m;
          const created = m.createdAtIso ? new Date(m.createdAtIso).getTime() : 0;
          if (!created) return m;
          if (readAt && created <= readAt) {
            return { ...m, deliveryStatus: 'read' as const, readAt: 'อ่านแล้ว' };
          }
          if (deliveredAt && created <= deliveredAt) {
            return { ...m, deliveryStatus: 'delivered' as const, readAt: 'ถึงแล้ว' };
          }
          return m;
        }),
      },
    }));
  },

  retryFailedMessage: (conversationId, messageId) => {
    const conversation = get().getConversation(conversationId);
    const message = (get().messagesById[conversationId] ?? []).find((m) => m.id === messageId);
    if (!conversation || !message) return;
    if (message.kind !== 'text' && message.kind !== 'image' && message.kind !== 'voice' && message.kind !== 'file') {
      return;
    }
    markOutgoingStatus(set, conversationId, messageId, 'sending');
    void completeOutgoing(conversationId, { ...message, deliveryStatus: 'sending' }, get, set);
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  attachContentReference: (conversationId, contentRef) => {
    const existing = get().messagesById[conversationId] ?? [];
    // Skip if the same feed card was just attached (avoid spam on repeated taps)
    const alreadyAttached = existing.some(
      (m) => m.kind === 'content_ref' && m.contentRef?.feedId === contentRef.feedId,
    );
    if (alreadyAttached) return;

    const message: ChatMessage = {
      id: `m-ref-${contentRef.feedId}-${Date.now()}`,
      conversationId,
      senderId: currentChatUserId(),
      kind: 'content_ref',
      contentRef,
      createdAt: 'ตอนนี้',
      readAt: null,
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: `📎 สอบถามจาก: ${contentRef.title}`,
              updatedAt: 'ตอนนี้',
              unread: 0,
            }
          : c,
      ),
    }));
  },

  sendJobMatchCard: (conversationId, jobMatch) => {
    const existing = get().messagesById[conversationId] ?? [];
    const alreadyAttached = existing.some(
      (m) => m.kind === 'job_match' && m.jobMatch?.feedId === jobMatch.feedId,
    );
    if (alreadyAttached) return;

    const message: ChatMessage = {
      id: `m-job-${jobMatch.feedId}-${Date.now()}`,
      conversationId,
      senderId: 'system',
      kind: 'job_match',
      jobMatch,
      createdAt: 'ตอนนี้',
      readAt: null,
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: jobMatch.header,
              updatedAt: 'ตอนนี้',
              unread: c.unread + 1,
            }
          : c,
      ),
    }));
  },

  createGroup: (name, members = []) => {
    const id = `c-group-${Date.now()}`;
    const unique = members.filter(
      (m, i, all) => all.findIndex((x) => normalizeHandle(x.handle) === normalizeHandle(m.handle)) === i,
    );
    const memberCount = unique.length + 1;
    const invited = unique.map((m) => m.name).join(', ');
    const systemText = invited
      ? `สร้างกลุ่ม "${name}" แล้ว · ${invited}`
      : `สร้างกลุ่ม "${name}" แล้ว — เชิญสมาชิกได้เลย`;
    const message: ChatMessage = {
      id: `m-${id}-1`,
      conversationId: id,
      senderId: 'peer',
      kind: 'system',
      text: systemText,
      createdAt: 'ตอนนี้',
      readAt: 'อ่านแล้ว',
    };
    const conversation: Conversation = {
      id,
      peerName: name,
      peerHandle: `@group.${id}`,
      lastMessage: systemText,
      unread: 0,
      isHidden: false,
      updatedAt: 'ตอนนี้',
      avatarColor: colorForSeed(name),
      avatarUri: `https://picsum.photos/seed/boom-group-${id}/240/240`,
      kind: 'group',
      memberCount,
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      messagesById: { ...state.messagesById, [id]: [message] },
    }));
    const memberIds = unique.map((m) => normalizeHandle(m.handle)).filter(Boolean);
    void ensureGroupChat(name, memberIds).then((remote) => {
      if (!remote?.id) return;
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, remoteId: remote.id, memberCount: remote.participants?.length || memberCount } : c,
        ),
      }));
    });
    return id;
  },

  addFriend: (name, handle) => {
    const target = normalizeHandle(handle || name);
    const existing = get().conversations.find(
      (c) => normalizeHandle(c.peerHandle) === target || normalizeHandle(c.peerName) === target,
    );
    if (existing) return existing.id;

    const id = `c-friend-${Date.now()}`;
    const greeting = `${name} ตอบรับคำขอเป็นเพื่อนแล้ว 🎉 ทักทายกันได้เลย!`;
    const message: ChatMessage = {
      id: `m-${id}-1`,
      conversationId: id,
      senderId: 'peer',
      kind: 'text',
      text: greeting,
      createdAt: 'ตอนนี้',
      readAt: null,
    };
    const conversation: Conversation = {
      id,
      peerName: name,
      peerHandle: handle.startsWith('@') ? handle : `@${handle}`,
      lastMessage: greeting,
      unread: 1,
      isHidden: false,
      updatedAt: 'ตอนนี้',
      avatarColor: colorForSeed(name),
      avatarUri: avatarUriForSeed(handle || name),
      kind: 'friend',
    };
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      messagesById: { ...state.messagesById, [id]: [message] },
    }));
    void ensureDirectChat(target, name);
    return id;
  },

  setPeerTyping: (conversationId, typing) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, peerTyping: typing } : c,
      ),
    })),

  markConversationRead: (conversationId) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId || c.remoteId === conversationId ? { ...c, unread: 0 } : c,
      ),
      messagesById: {
        ...state.messagesById,
        [conversationId]: (state.messagesById[conversationId] ?? []).map((m) =>
          !isCurrentChatUser(m.senderId) && !m.readAt
            ? { ...m, readAt: 'อ่านแล้ว' }
            : m,
        ),
      },
    }));
    const remoteId = apiConversationId(conversationId, get().conversations);
    const actor = shopActorId(conversationId, get().conversations);
    void markChatDelivered(remoteId, actor);
    void markChatRead(
      remoteId,
      actor,
      latestServerSequence(get().messagesById[conversationId] ?? []),
    );
  },

  markAllConversationsRead: () => {
    const unreadIds = get()
      .conversations.filter((c) => !c.isArchived && (c.unread ?? 0) > 0)
      .map((c) => c.id);
    for (const id of unreadIds) {
      get().markConversationRead(id);
    }
  },

  markConversationUnread: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread: Math.max(c.unread, 1) } : c,
      ),
    })),

  togglePinChat: (chatId) =>
    set((state) => ({ conversations: togglePinChatAction(state.conversations, chatId) })),
  muteChat: (chatId) =>
    set((state) => ({ conversations: muteChatAction(state.conversations, chatId) })),
  archiveChat: (chatId) =>
    set((state) => ({ conversations: archiveChatAction(state.conversations, chatId) })),
  deleteChat: (chatId) =>
    set((state) => ({
      conversations: deleteChatAction(state.conversations, chatId),
      messagesById: Object.fromEntries(
        Object.entries(state.messagesById).filter(([id]) => id !== chatId),
      ),
    })),

  // Back-compat aliases used by ChatListScreen / action sheet
  togglePinConversation: (conversationId) => get().togglePinChat(conversationId),
  toggleMuteConversation: (conversationId) => get().muteChat(conversationId),
  toggleAlerts: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, alertsOn: !c.alertsOn } : c,
      ),
    })),
  setWallpaper: (conversationId, wallpaper) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, wallpaper } : c,
      ),
    })),
  clearConversationHistory: (conversationId) =>
    set((state) => ({
      messagesById: { ...state.messagesById, [conversationId]: [] },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: 'ไม่มีข้อความ', unread: 0, updatedAt: 'ตอนนี้' }
          : c,
      ),
    })),
  inviteFriendsToChat: (conversationId, members) => {
    const convo = get().getConversation(conversationId);
    if (!convo) return conversationId;
    const unique = members.filter(
      (m, i, all) =>
        all.findIndex((x) => normalizeHandle(x.handle) === normalizeHandle(m.handle)) === i,
    );
    if (!unique.length) return conversationId;

    if (convo.kind !== 'group') {
      const withPeer = [
        { name: convo.peerName, handle: convo.peerHandle },
        ...unique,
      ];
      const name = [convo.peerName, ...unique.map((m) => m.name)].slice(0, 3).join(', ');
      return get().createGroup(name, withPeer);
    }

    const added = unique.map((m) => m.name).join(', ');
    const message: ChatMessage = {
      id: `m-invite-${Date.now()}`,
      conversationId,
      senderId: 'peer',
      kind: 'system',
      text: `เชิญ ${added} เข้ากลุ่มแล้ว`,
      createdAt: 'ตอนนี้',
      readAt: 'อ่านแล้ว',
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              memberCount: (c.memberCount ?? 1) + unique.length,
              lastMessage: message.text ?? 'เชิญสมาชิกแล้ว',
              updatedAt: 'ตอนนี้',
            }
          : c,
      ),
    }));
    return conversationId;
  },
  archiveConversation: (conversationId) => get().archiveChat(conversationId),
  deleteConversation: (conversationId) => get().deleteChat(conversationId),

  sendText: (conversationId, text, quote) => {
    const clientMsgId = newClientMsgId();
    const createdAtIso = new Date().toISOString();
    const message: ChatMessage = {
      id: clientMsgId,
      conversationId,
      senderId: currentChatUserId(),
      kind: 'text',
      text,
      quote,
      createdAt: 'ตอนนี้',
      createdAtIso,
      clientMsgId,
      deliveryStatus: 'sending',
      readAt: null,
    };
    const preview = quote
      ? text.trim() || `อ้างอิง · ${quotePreviewLabel(quote)}`
      : text;
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: bumpConversation(state.conversations, conversationId, {
        lastMessage: preview,
        updatedAt: 'ตอนนี้',
        unread: 0,
        peerTyping: false,
      }),
    }));
    persistConversationSoon(conversationId, () => get());
    void completeOutgoing(conversationId, message, get, set);
  },

  sendImage: (conversationId, imageUri) => {
    get().sendImages(conversationId, [imageUri]);
  },

  sendImages: (conversationId, imageUris) => {
    const uris = imageUris.map((u) => u.trim()).filter(Boolean).slice(0, 4);
    if (!uris.length) return;
    const clientMsgId = newClientMsgId('img');
    const message: ChatMessage = {
      id: clientMsgId,
      conversationId,
      senderId: currentChatUserId(),
      kind: 'image',
      imageUri: uris[0],
      imageUris: uris,
      createdAt: 'ตอนนี้',
      createdAtIso: new Date().toISOString(),
      clientMsgId,
      deliveryStatus: 'sending',
      readAt: null,
    };
    const lastMessage = uris.length > 1 ? `📷 รูปภาพ ${uris.length} รูป` : '📷 รูปภาพ';
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: bumpConversation(state.conversations, conversationId, {
        lastMessage,
        updatedAt: 'ตอนนี้',
        unread: 0,
        peerTyping: false,
      }),
    }));
    persistConversationSoon(conversationId, () => get());
    void completeOutgoing(conversationId, message, get, set);
  },

  replaceMessageImage: (conversationId, messageId, nextUri, albumIndex = 0) => {
    const uri = nextUri.trim();
    if (!uri) return;
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: (state.messagesById[conversationId] ?? []).map((m) => {
          if (m.id !== messageId) return m;
          if (m.kind === 'image') {
            const uris = m.imageUris?.length
              ? [...m.imageUris]
              : m.imageUri
                ? [m.imageUri]
                : [];
            if (!uris.length) return { ...m, imageUri: uri, imageUris: [uri] };
            const idx = Math.max(0, Math.min(uris.length - 1, albumIndex));
            uris[idx] = uri;
            return { ...m, imageUri: uris[0], imageUris: uris };
          }
          if (m.kind === 'content_ref' && m.contentRef) {
            return { ...m, contentRef: { ...m.contentRef, imageUri: uri } };
          }
          return m;
        }),
      },
    }));
  },

  sendFile: (conversationId, file) => {
    const clientMsgId = newClientMsgId('file');
    const message: ChatMessage = {
      id: clientMsgId,
      conversationId,
      senderId: currentChatUserId(),
      kind: 'file',
      fileUri: file.fileUri,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      createdAt: 'ตอนนี้',
      createdAtIso: new Date().toISOString(),
      clientMsgId,
      deliveryStatus: 'sending',
      readAt: null,
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: bumpConversation(state.conversations, conversationId, {
        lastMessage: `📎 ${file.fileName}`,
        updatedAt: 'ตอนนี้',
        unread: 0,
        peerTyping: false,
      }),
    }));
    persistConversationSoon(conversationId, () => get());
    void completeOutgoing(conversationId, message, get, set);
  },

  deleteMessage: (conversationId, messageId) => {
    const target = get().messagesById[conversationId]?.find((m) => m.id === messageId);
    if (target?.reminderId) void cancelChatReminder(target.reminderId);
    set((state) => {
      const prev = state.messagesById[conversationId] ?? [];
      const next = prev.filter((m) => m.id !== messageId);
      const last = next[next.length - 1];
      let lastPreview = 'ไม่มีข้อความ';
      if (last) {
        if (last.kind === 'image') {
          const n = last.imageUris?.length ?? 1;
          lastPreview = n > 1 ? `📷 รูปภาพ ${n} รูป` : '📷 รูปภาพ';
        }
        else if (last.kind === 'file') lastPreview = `📎 ${last.fileName || 'ไฟล์'}`;
        else if (last.kind === 'voice') lastPreview = '🎤 ข้อความเสียง';
        else if (last.kind === 'quotation') lastPreview = 'ใบเสนอราคา';
        else if (last.kind === 'product') lastPreview = last.product?.title
          ? `📦 ${last.product.title}`
          : 'สินค้า';
        else if (last.kind === 'order_ref') lastPreview = last.orderRef
          ? `เกี่ยวกับออเดอร์ #${last.orderRef.orderId}`
          : 'ออเดอร์';
        else if (last.text) lastPreview = last.text;
      }
      return {
        messagesById: {
          ...state.messagesById,
          [conversationId]: next,
        },
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: lastPreview,
                updatedAt: 'ตอนนี้',
              }
            : c,
        ),
      };
    });
  },

  deleteMessages: (conversationId, messageIds) => {
    const drop = new Set(messageIds);
    for (const m of get().messagesById[conversationId] ?? []) {
      if (drop.has(m.id) && m.reminderId) void cancelChatReminder(m.reminderId);
    }
    set((state) => {
      const next = (state.messagesById[conversationId] ?? []).filter((m) => !drop.has(m.id));
      const last = next[next.length - 1];
      return {
        messagesById: { ...state.messagesById, [conversationId]: next },
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: last ? quotePreviewLabel(last) : 'ไม่มีข้อความ',
                updatedAt: 'ตอนนี้',
              }
            : c,
        ),
      };
    });
  },

  removeMessageImages: (conversationId, messageId, indexes) => {
    const drop = new Set(indexes);
    if (!drop.size) return;
    const target = get().messagesById[conversationId]?.find((m) => m.id === messageId);
    if (!target || target.kind !== 'image') return;
    const keep = (target.imageUris?.length
      ? target.imageUris
      : target.imageUri
        ? [target.imageUri]
        : []
    ).filter((_, i) => !drop.has(i));
    if (!keep.length) {
      get().deleteMessage(conversationId, messageId);
      return;
    }
    set((state) => {
      const next = (state.messagesById[conversationId] ?? []).map((m) =>
        m.id === messageId ? { ...m, imageUri: keep[0], imageUris: keep } : m,
      );
      const last = next[next.length - 1];
      return {
        messagesById: { ...state.messagesById, [conversationId]: next },
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: last ? quotePreviewLabel(last) : 'ไม่มีข้อความ',
                updatedAt: 'ตอนนี้',
              }
            : c,
        ),
      };
    });
  },

  toggleFavorite: (conversationId, messageId) =>
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: (state.messagesById[conversationId] ?? []).map((m) =>
          m.id === messageId ? { ...m, isFavorite: !m.isFavorite } : m,
        ),
      },
    })),

  setMessageReminder: (conversationId, messageId, reminder) =>
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: (state.messagesById[conversationId] ?? []).map((m) =>
          m.id === messageId
            ? {
                ...m,
                isReminded: Boolean(reminder.remindAt),
                remindAt: reminder.remindAt,
                reminderId: reminder.reminderId ?? null,
              }
            : m,
        ),
      },
    })),

  editMessage: (conversationId, messageId, text) => {
    const nextText = text.trim();
    if (!nextText) return;
    set((state) => {
      const list = state.messagesById[conversationId] ?? [];
      const updated = list.map((m) => (m.id === messageId ? { ...m, text: nextText } : m));
      const last = updated[updated.length - 1];
      return {
        messagesById: { ...state.messagesById, [conversationId]: updated },
        conversations: state.conversations.map((c) =>
          c.id === conversationId && last?.id === messageId
            ? { ...c, lastMessage: nextText, updatedAt: 'ตอนนี้' }
            : c,
        ),
      };
    });
  },

  forwardMessage: (toConversationId, message) => {
    const clone: ChatMessage = {
      ...message,
      id: `m-fwd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId: toConversationId,
      senderId: currentChatUserId(),
      createdAt: 'ตอนนี้',
      readAt: null,
      quote: undefined,
      isReminded: false,
      remindAt: null,
      reminderId: null,
    };
    const preview =
      clone.kind === 'image'
        ? clone.imageUris && clone.imageUris.length > 1
          ? `📷 รูปภาพ ${clone.imageUris.length} รูป`
          : '📷 รูปภาพ'
        : clone.kind === 'file'
          ? `📎 ${clone.fileName || 'ไฟล์'}`
          : quotePreviewLabel(clone);
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [toConversationId]: [...(state.messagesById[toConversationId] ?? []), clone],
      },
      conversations: bumpConversation(state.conversations, toConversationId, {
        lastMessage: preview,
        updatedAt: 'ตอนนี้',
        unread: 0,
        peerTyping: false,
      }),
    }));
  },

  sendVoice: (conversationId, audioUri, durationSec) => {
    const clientMsgId = newClientMsgId('voice');
    const message: ChatMessage = {
      id: clientMsgId,
      conversationId,
      senderId: currentChatUserId(),
      kind: 'voice',
      audioUri,
      durationSec,
      mimeType: 'audio/mp4',
      createdAt: 'ตอนนี้',
      createdAtIso: new Date().toISOString(),
      clientMsgId,
      deliveryStatus: 'sending',
      readAt: null,
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: bumpConversation(state.conversations, conversationId, {
        lastMessage: `🎤 ข้อความเสียง ${durationSec}s`,
        updatedAt: 'ตอนนี้',
        unread: 0,
        peerTyping: false,
      }),
    }));
    persistConversationSoon(conversationId, () => get());
    void completeOutgoing(conversationId, message, get, set);
  },

  sendQuotation: (conversationId, quotation) => {
    const message: ChatMessage = {
      id: `m-quo-${Date.now()}`,
      conversationId,
      senderId: currentChatUserId(),
      kind: 'quotation',
      quotation,
      createdAt: 'ตอนนี้',
      readAt: null,
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: `Smart Quotation — ${quotation.title}`,
              updatedAt: 'ตอนนี้',
            }
          : c,
      ),
    }));
  },

  /** Simulate WeChat-protocol typing + read receipt + Boom EV Assistant auto-reply */
  queueBotReply: (conversationId, replyText) => {
    get().setPeerTyping(conversationId, true);
    const delay = 1200 + Math.round(Math.random() * 800);
    setTimeout(() => {
      const reply: ChatMessage = {
        id: `m-bot-${Date.now()}`,
        conversationId,
        senderId: 'peer',
        kind: 'text',
        text: replyText,
        createdAt: 'ตอนนี้',
      };
      set((state) => ({
        messagesById: {
          ...state.messagesById,
          [conversationId]: [
            ...(state.messagesById[conversationId] ?? []).map((m) =>
              isCurrentChatUser(m.senderId) ? { ...m, readAt: 'อ่านแล้ว' } : m,
            ),
            reply,
          ],
        },
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessage: replyText, updatedAt: 'ตอนนี้', peerTyping: false }
            : c,
        ),
      }));
    }, delay);
  },

  sendProductCard: (conversationId, product) => {
    const clientMsgId = newClientMsgId('prod');
    const message: ChatMessage = {
      id: clientMsgId,
      conversationId,
      senderId: currentChatUserId(),
      kind: 'product',
      product,
      createdAt: 'ตอนนี้',
      createdAtIso: new Date().toISOString(),
      clientMsgId,
      deliveryStatus: 'sending',
      readAt: null,
    };
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: [...(state.messagesById[conversationId] ?? []), message],
      },
      conversations: bumpConversation(state.conversations, conversationId, {
        lastMessage: `📦 ${product.title}`,
        updatedAt: 'ตอนนี้',
        unread: 0,
      }),
    }));
    void (async () => {
      const remoteId = await waitForRemoteId(conversationId, () => get().conversations);
      const json = await sendProductCardRemote({
        conversationId: remoteId,
        senderId: shopActorId(conversationId, get().conversations),
        clientMsgId,
        productId: product.id,
        variantId: product.variantId,
        sku: product.sku,
        product,
      });
      const data =
        json && typeof json === 'object' && 'data' in json
          ? (json as { data: RemoteChatMessage }).data
          : null;
      if (!data?.id) {
        set((state) => ({
          messagesById: {
            ...state.messagesById,
            [conversationId]: (state.messagesById[conversationId] ?? []).map((m) =>
              m.id === clientMsgId ? { ...m, deliveryStatus: 'failed' as const } : m,
            ),
          },
        }));
        return;
      }
      set((state) =>
        patchThread(state, conversationId, [
          mapRemoteMessage(data, conversationId, get().getConversation(conversationId)),
        ]),
      );
    })();
  },

  convertProductToPayment: (conversationId, productCardId) => {
    set((state) => {
      const messages = state.messagesById[conversationId] ?? [];
      const target = messages.find((m) => m.product?.id === productCardId);
      if (!target?.product) return state;

      const quotationId = `q-from-${productCardId}`;
      const updated = messages.map((m) => {
        if (m.product?.id !== productCardId) return m;
        return {
          ...m,
          kind: 'quotation' as const,
          product: { ...m.product, convertedToPayment: true },
          quotation: {
            id: quotationId,
            title: `Payment Slip — ${m.product.title}`,
            description: `แปลงจาก Product Card · SKU ${m.product.sku}`,
            amount: m.product.price,
            currency: 'THB' as const,
            status: 'pending' as QuotationStatus,
            expiresAt: 'วันนี้ 23:59',
          },
        };
      });

      return {
        messagesById: { ...state.messagesById, [conversationId]: updated },
        conversations: state.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: 'สลิปชำระเงินในแชต — รอ One-Tap Payment',
                updatedAt: 'ตอนนี้',
              }
            : c,
        ),
      };
    });
  },

  payQuotation: (conversationId, quotationId) => {
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [conversationId]: (state.messagesById[conversationId] ?? []).map((m) => {
          if (m.kind !== 'quotation' || m.quotation?.id !== quotationId) return m;
          return {
            ...m,
            quotation: {
              ...m.quotation,
              status: 'paid' as QuotationStatus,
            },
          };
        }),
      },
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: 'ชำระเงินสำเร็จ — ปิดการขายในแชต', updatedAt: 'ตอนนี้' }
          : c,
      ),
    }));
  },
}));
