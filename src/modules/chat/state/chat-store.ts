import { create } from 'zustand';
import {
  CURRENT_USER_ID,
  mockActiveNotes,
  mockConversations,
  mockMessages,
} from '../data/mockChatData';
import {
  archiveChat as archiveChatAction,
  deleteChat as deleteChatAction,
  muteChat as muteChatAction,
  togglePinChat as togglePinChatAction,
} from '../data/chatActions';
import { createUserStatus, userStatusToMyNote } from '../data/statusService';
import { getBotImageReply, getBotReply, getBotVoiceReply } from '../data/mockBots';
import type {
  ActiveNote,
  ChatMessage,
  ContentReferenceCard,
  Conversation,
  JobMatchCard,
  MyNote,
  ProductCard,
  QuotationCard,
  QuotationStatus,
  UserStatus,
} from '../domain/types';

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
  sendText: (conversationId: string, text: string) => void;
  sendImage: (conversationId: string, imageUri: string) => void;
  /** Remove a single message (e.g. delete image from chat album) */
  deleteMessage: (conversationId: string, messageId: string) => void;
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
  /** Long-press quick action — "📌 ปักหมุดแชต" (marks for the 📌 filter tab) */
  togglePinConversation: (conversationId: string) => void;
  /** Long-press quick action — "🔕 ปิดเสียง" (toggles mute state) */
  toggleMuteConversation: (conversationId: string) => void;
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
  /** Creates a brand-new private Group Chat (LINE-style) and returns its conversationId. */
  createGroup: (name: string, memberCount: number) => string;
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

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: mockConversations,
  messagesById: mockMessages,
  notes: mockActiveNotes,
  myStatus: null,
  myNote: null,
  setMyNote: (text, emoji = '📷', imageUri) => {
    const status = createUserStatus(CURRENT_USER_ID, text, true, imageUri);
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
  getConversation: (id) => get().conversations.find((c) => c.id === id),

  startConversationWithCreator: (peerName, peerHandle, avatarColor, contentRef) => {
    const target = normalizeHandle(peerHandle);
    const existing = get().conversations.find((c) => normalizeHandle(c.peerHandle) === target);

    if (existing) {
      if (contentRef) get().attachContentReference(existing.id, contentRef);
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
        senderId: CURRENT_USER_ID,
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
    return id;
  },

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
      senderId: CURRENT_USER_ID,
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

  createGroup: (name, memberCount) => {
    const id = `c-group-${Date.now()}`;
    const systemText = `สร้างกลุ่ม "${name}" แล้ว — เชิญสมาชิกได้เลย`;
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
    return id;
  },

  setPeerTyping: (conversationId, typing) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, peerTyping: typing } : c,
      ),
    })),

  markConversationRead: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unread: 0 } : c,
      ),
      messagesById: {
        ...state.messagesById,
        [conversationId]: (state.messagesById[conversationId] ?? []).map((m) =>
          m.senderId !== CURRENT_USER_ID && !m.readAt
            ? { ...m, readAt: 'อ่านแล้ว' }
            : m,
        ),
      },
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
  archiveConversation: (conversationId) => get().archiveChat(conversationId),
  deleteConversation: (conversationId) => get().deleteChat(conversationId),

  sendText: (conversationId, text) => {
    const message: ChatMessage = {
      id: `m-${Date.now()}`,
      conversationId,
      senderId: CURRENT_USER_ID,
      kind: 'text',
      text,
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
          ? { ...c, lastMessage: text, updatedAt: 'ตอนนี้', unread: 0, peerTyping: false }
          : c,
      ),
    }));

    get().queueBotReply(conversationId, getBotReply(text, message.id.length + text.length));
  },

  sendImage: (conversationId, imageUri) => {
    const message: ChatMessage = {
      id: `m-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId,
      senderId: CURRENT_USER_ID,
      kind: 'image',
      imageUri,
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
          ? { ...c, lastMessage: '📷 รูปภาพ', updatedAt: 'ตอนนี้', unread: 0, peerTyping: false }
          : c,
      ),
    }));

    get().queueBotReply(conversationId, getBotImageReply(message.id.length));
  },

  deleteMessage: (conversationId, messageId) => {
    set((state) => {
      const prev = state.messagesById[conversationId] ?? [];
      const next = prev.filter((m) => m.id !== messageId);
      const last = next[next.length - 1];
      let lastPreview = 'ไม่มีข้อความ';
      if (last) {
        if (last.kind === 'image') lastPreview = '📷 รูปภาพ';
        else if (last.kind === 'voice') lastPreview = '🎤 ข้อความเสียง';
        else if (last.kind === 'quotation') lastPreview = 'ใบเสนอราคา';
        else if (last.kind === 'product') lastPreview = 'สินค้า';
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

  sendVoice: (conversationId, audioUri, durationSec) => {
    const message: ChatMessage = {
      id: `m-voice-${Date.now()}`,
      conversationId,
      senderId: CURRENT_USER_ID,
      kind: 'voice',
      audioUri,
      durationSec,
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
          ? { ...c, lastMessage: `🎤 ข้อความเสียง ${durationSec}s`, updatedAt: 'ตอนนี้', unread: 0, peerTyping: false }
          : c,
      ),
    }));

    get().queueBotReply(conversationId, getBotVoiceReply(message.id.length));
  },

  sendQuotation: (conversationId, quotation) => {
    const message: ChatMessage = {
      id: `m-quo-${Date.now()}`,
      conversationId,
      senderId: 'peer',
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
              m.senderId === CURRENT_USER_ID ? { ...m, readAt: 'อ่านแล้ว' } : m,
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
    const message: ChatMessage = {
      id: `m-prod-${Date.now()}`,
      conversationId,
      senderId: CURRENT_USER_ID,
      kind: 'product',
      product,
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
              lastMessage: `การ์ดสินค้า: ${product.title}`,
              updatedAt: 'ตอนนี้',
            }
          : c,
      ),
    }));
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
