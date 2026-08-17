/**
 * Client durability engine: REST persist is the write path, Socket.io is notify-only.
 * Tracks per-conversation sequences and REST-syncs missed rows after reconnect.
 */

import { io, type Socket } from 'socket.io-client';
import { getApiBase, useAuthStore } from '@/modules/auth/state/auth-store';
import { advanceConversationSequence, newClientMsgId } from '@/modules/chat/domain/message-sync';
import {
  currentChatUserId,
  sendChatMessageDurable,
  syncRemoteMessages,
  type ChatSendAttachment,
  type RemoteChatMessage,
} from './chatRealtimeApi';
import { lastCachedSequence } from './chatLocalDb';

export type ChatReadReceipt = {
  conversationId: string;
  userId?: string;
  sequence?: string;
  lastReadAt?: string | null;
  lastDeliveredAt?: string | null;
  kind?: 'read' | 'delivered';
};

export type ChatTypingPayload = {
  conversationId: string;
  userId: string;
  typing: boolean;
};

export type ChatNotifyPayload = {
  conversationId: string;
  sequence?: string | number;
  senderId?: string;
};

export type ChatClientEngineCallbacks = {
  onMessage: (msg: RemoteChatMessage) => void;
  onReadReceipt?: (receipt: ChatReadReceipt) => void;
  onDelivered?: (receipt: ChatReadReceipt) => void;
  onTyping?: (payload: ChatTypingPayload) => void;
  onReconnect?: () => void;
};

export type ChatClientEngineOptions = {
  url?: string;
  path?: string;
  userId?: string;
  getToken?: () => string | undefined;
  getUserId?: () => string | undefined;
  getUrl?: () => string | undefined;
};

const SYNC_PAGE = 50;
const SYNC_MAX_PAGES = 10;

export class ChatClientEngine {
  private socket: Socket | null = null;
  private token: string;
  private readonly conversationSequences = new Map<string, string>();
  private readonly joined = new Set<string>();
  private callbacks: ChatClientEngineCallbacks;
  private readonly options: ChatClientEngineOptions;
  private reconciling = false;
  private readonly catchUpTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    token: string,
    callbacks: ChatClientEngineCallbacks,
    options: ChatClientEngineOptions = {},
  ) {
    this.token = token;
    this.callbacks = callbacks;
    this.options = options;
    this.initSocket();
  }

  static fromAuth(callbacks: ChatClientEngineCallbacks) {
    return new ChatClientEngine(useAuthStore.getState().sessionToken ?? '', callbacks, {
      getToken: () => useAuthStore.getState().sessionToken ?? undefined,
      getUserId: () => currentChatUserId(),
      getUrl: () => getApiBase() ?? undefined,
      path: process.env.EXPO_PUBLIC_CHAT_SOCKET_PATH?.trim() || '/socket.io/chat',
    });
  }

  setCallbacks(callbacks: ChatClientEngineCallbacks) {
    this.callbacks = callbacks;
  }

  isConnected() {
    return Boolean(this.socket?.connected);
  }

  connect() {
    if (!this.socket) this.initSocket();
    else if (!this.socket.connected) this.socket.connect();
  }

  disconnect() {
    this.joined.clear();
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  joinConversation(conversationId: string, initialSequence?: string) {
    const id = conversationId.trim();
    if (!id) return;
    this.joined.add(id);
    if (initialSequence) this.updateSequence(id, initialSequence);
    this.socket?.emit('chat:join', { conversationId: id });
  }

  leaveConversation(conversationId: string) {
    const id = conversationId.trim();
    if (!id) return;
    this.joined.delete(id);
    this.socket?.emit('chat:leave', { conversationId: id });
  }

  rememberSequence(conversationId: string, sequence?: string) {
    this.updateSequence(conversationId, sequence);
  }

  sequenceOf(conversationId: string) {
    return this.conversationSequences.get(conversationId);
  }

  async sendMessage(
    conversationId: string,
    content: string,
    attachments: ChatSendAttachment[] = [],
    extra?: { clientMessageId?: string; metadata?: Record<string, unknown>; senderId?: string },
  ) {
    const clientMessageId = extra?.clientMessageId?.trim() || newClientMsgId('cm');
    const result = await sendChatMessageDurable(
      conversationId,
      content,
      clientMessageId,
      extra?.senderId,
      extra?.metadata,
      3,
      attachments,
    );
    if (!result.ok) throw new Error('CHAT_SEND_FAILED');
    this.updateSequence(conversationId, result.data.serverSequence);
    return result.data;
  }

  async reconcileMissedMessages() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const ids = new Set([...this.conversationSequences.keys(), ...this.joined]);
      for (const conversationId of ids) {
        await this.reconcileConversation(conversationId);
      }
    } finally {
      this.reconciling = false;
    }
  }

  private scheduleCatchUp(conversationId: string) {
    const id = conversationId.trim();
    if (!id) return;
    const prev = this.catchUpTimers.get(id);
    if (prev) clearTimeout(prev);
    this.catchUpTimers.set(
      id,
      setTimeout(() => {
        this.catchUpTimers.delete(id);
        void this.reconcileConversation(id);
      }, 50),
    );
  }

  private async reconcileConversation(conversationId: string) {
    let after = this.conversationSequences.get(conversationId);
    if (!after) {
      const cached = await lastCachedSequence(conversationId);
      after = cached > 0 ? String(cached) : '0';
    }
    for (let page = 0; page < SYNC_MAX_PAGES; page += 1) {
      try {
        const messages = await syncRemoteMessages(conversationId, after, SYNC_PAGE);
        if (!messages.length) break;
        for (const msg of messages) {
          this.updateSequence(conversationId, msg.serverSequence);
          this.callbacks.onMessage(msg);
        }
        after = this.conversationSequences.get(conversationId) ?? after;
        if (messages.length < SYNC_PAGE) break;
      } catch (err) {
        console.error(`[Chat Recovery] Failed for conversation ${conversationId}`, err);
        break;
      }
    }
  }

  private currentToken() {
    return this.options.getToken?.() || this.token;
  }

  private currentUserId() {
    return this.options.getUserId?.() || this.options.userId || currentChatUserId();
  }

  private currentUrl() {
    return this.options.getUrl?.() || this.options.url || getApiBase() || undefined;
  }

  private authPayload() {
    const token = this.currentToken();
    return { token: token || undefined };
  }

  private initSocket() {
    const url = this.currentUrl();
    if (!url || this.socket) return;

    const token = this.currentToken();
    const path = this.options.path || process.env.EXPO_PUBLIC_CHAT_SOCKET_PATH?.trim() || '/socket.io/chat';
    this.socket = io(url, {
      path,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 8000,
      auth: this.authPayload(),
      extraHeaders: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    this.socket.io.on('reconnect_attempt', () => {
      if (this.socket) this.socket.auth = this.authPayload();
    });

    this.socket.on('connect', () => {
      for (const id of this.joined) this.socket?.emit('chat:join', { conversationId: id });
      void this.reconcileMissedMessages().finally(() => {
        this.callbacks.onReconnect?.();
      });
    });

    this.socket.on('chat:notify', (payload: ChatNotifyPayload) => {
      const conversationId = payload?.conversationId?.trim();
      if (!conversationId) return;
      this.joined.add(conversationId);
      this.scheduleCatchUp(conversationId);
    });
    this.socket.on('chat:message', (message: RemoteChatMessage) => {
      this.handleIncomingMessage(message);
    });
    this.socket.on('chat:message_new', (message: RemoteChatMessage) => {
      this.handleIncomingMessage(message);
    });
    this.socket.on('chat:read', (receipt: ChatReadReceipt) => {
      this.callbacks.onReadReceipt?.(receipt);
    });
    this.socket.on('chat:read_receipt', (receipt: ChatReadReceipt) => {
      this.callbacks.onReadReceipt?.(receipt);
    });
    this.socket.on('chat:delivered', (receipt: ChatReadReceipt) => {
      this.callbacks.onDelivered?.({ ...receipt, kind: 'delivered' });
    });
    this.socket.on('chat:typing', (payload: ChatTypingPayload) => {
      this.callbacks.onTyping?.(payload);
    });
    this.socket.on('chat:user_typing', (payload: ChatTypingPayload & { isTyping?: boolean }) => {
      this.callbacks.onTyping?.({
        conversationId: payload.conversationId,
        userId: payload.userId,
        typing: payload.typing ?? Boolean(payload.isTyping),
      });
    });
  }

  private handleIncomingMessage(message: RemoteChatMessage) {
    if (!message?.conversationId) return;
    this.updateSequence(message.conversationId, message.serverSequence);
    this.callbacks.onMessage(message);
  }

  private updateSequence(conversationId: string, seq?: string) {
    advanceConversationSequence(this.conversationSequences, conversationId, seq);
  }
}

let engine: ChatClientEngine | null = null;

export function getChatClientEngine() {
  return engine;
}

export function startChatClientEngine(callbacks: ChatClientEngineCallbacks) {
  if (engine) {
    engine.setCallbacks(callbacks);
    engine.connect();
    return engine;
  }
  engine = ChatClientEngine.fromAuth(callbacks);
  return engine;
}

export function stopChatClientEngine() {
  engine?.disconnect();
  engine = null;
}
