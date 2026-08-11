export type MessageKind =
  | 'text'
  | 'quotation'
  | 'product'
  | 'system'
  | 'image'
  | 'voice'
  | 'content_ref'
  | 'job_match';

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
  title: string;
  sku: string;
  price: number;
  currency: 'THB';
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

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  text?: string;
  imageUri?: string;
  /** Voice message: local/recorded file uri + duration in whole seconds */
  audioUri?: string;
  durationSec?: number;
  quotation?: QuotationCard;
  product?: ProductCard;
  contentRef?: ContentReferenceCard;
  jobMatch?: JobMatchCard;
  createdAt: string;
  /** ISO or display — WeChat-style read receipt */
  readAt?: string | null;
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
