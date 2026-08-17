export type MessageKind =
  | 'text'
  | 'quotation'
  | 'product'
  | 'system'
  | 'image'
  | 'file'
  | 'voice'
  | 'content_ref'
  | 'job_match'
  | 'order_ref';

export type MessageDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type QuotationStatus = 'pending' | 'paid' | 'expired';

export type QuotationCard = {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: 'THB';
  status: QuotationStatus;
  expiresAt: string;
};

export type ProductCard = {
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
  convertedToPayment?: boolean;
};

/** Context-aware card auto-attached when chatting from a Feed clip / Visitor Profile */
export type ContentReferenceCard = {
  id: string;
  feedId: string;
  title: string;
  subtitle: string;
  price: number;
  currency: 'THB';
  tier: 'B2B' | 'B2C' | 'C2C';
  imageUri?: string;
  gradient: [string, string];
  authorHandle: string;
};

/** Seller→buyer order snapshot pinned / sent when chatting from an order card */
export type OrderSnapshotCard = {
  orderId: string;
  buyerId: string;
  shopId: string;
  title: string;
  option?: string;
  qty: number;
  amount: number;
  currency: 'THB';
  imageUri?: string;
  paymentKind: 'PAID' | 'COD';
  orderStatus: string;
  orderStatusLabel: string;
  extraCount?: number;
};

/** Auto-matched job card from Community Board Smart Matching */
export type JobMatchCard = {
  id: string;
  feedId: string;
  header: string;
  details: string;
  distanceKm: number;
  skills: string[];
  actionLabel: string;
};

export type MessageQuote = {
  messageId: string;
  kind: MessageKind;
  text?: string;
  imageUri?: string;
  fileName?: string;
  senderName?: string;
  senderAvatarUri?: string;
  senderAvatarColor?: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  text?: string;
  imageUri?: string;
  /** 2–4 photos sent together as one LINE-style album bubble */
  imageUris?: string[];
  /** Document / any non-image file attached in chat */
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  /** Voice message: local/recorded file uri + duration in whole seconds */
  audioUri?: string;
  durationSec?: number;
  quotation?: QuotationCard;
  product?: ProductCard;
  contentRef?: ContentReferenceCard;
  jobMatch?: JobMatchCard;
  orderRef?: OrderSnapshotCard;
  createdAt: string;
  /** ISO or display — WeChat-style read receipt */
  readAt?: string | null;
  /** Durable send state. sending/failed are client-only; sent+ come from the API. */
  deliveryStatus?: MessageDeliveryStatus;
  /** Server UUID (source of truth). `id` may be the clientMsgId while sending. */
  serverId?: string;
  clientMsgId?: string;
  /** Monotonic per-conversation sequence from Postgres. */
  serverSequence?: string;
  /** ISO timestamp used for sync/pagination. `createdAt` stays a display string. */
  createdAtIso?: string;
  /** WeChat 「อ้างอิง」 — reply anchored to a prior message */
  quote?: MessageQuote;
  isFavorite?: boolean;
  isReminded?: boolean;
  /** ISO timestamp when a local reminder should fire */
  remindAt?: string | null;
  /** expo-notifications identifier for cancel/reschedule */
  reminderId?: string | null;
};

/**
 * Backend status schema — short ephemeral note a user posts for peers.
 * `expiresAt` is an ISO timestamp (or null while drafting); UI maps this to ActiveNote.
 */
export type UserStatus = {
  userId: string;
  statusNote: string;
  /** Photo moment URI — when set, Active Notes bar shows the image instead of initials. */
  imageUri?: string | null;
  expiresAt: string | null;
  isOnline: boolean;
  updatedAt: string;
};

/**
 * Backend conversation metadata for pin / mute / archive / unread.
 * UI Conversation embeds these fields; helpers operate on chatId.
 */
export type ChatConversation = {
  chatId: string;
  isPinned: boolean;
  pinnedAt: number | null;
  isMuted: boolean;
  isArchived: boolean;
  unreadCount: number;
};

/**
 * LINE/WeChat-style "Active Note" — a short status a friend posts above the chat list.
 * Tapping one warps straight into that friend's 1-on-1 conversation with a Note Context
 * Banner attached, so the reply stays anchored to what triggered the chat.
 */
export type ActiveNote = {
  id: string;
  conversationId: string;
  authorName: string;
  avatarColor: string;
  emoji: string;
  text: string;
  /** Moment photo — preferred display in the Active Notes / Moments bar. */
  imageUri?: string;
  postedAt: string;
  /**
   * ออนไลน์ (อยู่ในแชต / เล่นฟีด) → โชว์ในแถบโมเมนต์พร้อมขอบเขียว
   * ออฟไลน์ → ไม่โชว์ในแถบนี้
   */
  isOnline: boolean;
  /** Optional link back to UserStatus.userId for data-layer sync. */
  userId?: string;
  expiresAt?: string | null;
};

/** The current user's own moment shown in the sticky [+ เพิ่มรูป] first slot. */
export type MyNote = {
  emoji: string;
  text: string;
  imageUri?: string;
  postedAt: string;
  expiresAt?: string | null;
};

export type ConversationKind = 'friend' | 'group' | 'official';

export type Conversation = {
  id: string;
  peerName: string;
  peerHandle: string;
  lastMessage: string;
  unread: number;
  isHidden: boolean;
  updatedAt: string;
  avatarColor: string;
  /** รูปโปรไฟล์จำลอง — ถ้าไม่มีใช้ตัวอักษรบน avatarColor */
  avatarUri?: string;
  /** peer is typing */
  peerTyping?: boolean;
  /** Shop / Page id when this thread is a customer↔shop inbox */
  shopId?: string;
  /** Buyer sees the shop; seller sees the customer — same Facebook-style inbox */
  inboxRole?: 'buyer' | 'seller';
  /** Server conversation id when the local row was created before the API returned */
  remoteId?: string;
  /** LINE-style chat classification for the Filter Chips — defaults to 'friend' when omitted */
  kind?: ConversationKind;
  /** Only meaningful when kind === 'group' */
  memberCount?: number;
  /** Long-press → "ปักหมุดแชต" — appears in the 📌 ปักหมุด filter tab (does not reorder "ทั้งหมด") */
  isPinned?: boolean;
  /** Epoch ms when pinned — used to sort newest pins first inside the 📌 tab */
  pinnedAt?: number | null;
  /** Long-press → "ปิดเสียง" — muted chats keep receiving messages silently */
  isMuted?: boolean;
  /** WeChat 「การเตือน」 — mention/reminder alerts, independent of mute */
  alertsOn?: boolean;
  /** Chat canvas color (hex). Undefined = app default */
  wallpaper?: string;
  /** Long-press → "ซ่อน / จัดเก็บ" — archived chats drop out of every list until restored */
  isArchived?: boolean;
};

export type OpenChatGroup = {
  id: string;
  name: string;
  memberCount: number;
  description: string;
  lastActivity: string;
  isJoined: boolean;
  accent: string;
};

export type CallMode = 'idle' | 'connecting' | 'active' | 'ended';
export type CallType = 'voice' | 'video';
