/**
 * Socket.io is a notify channel only. Messages live in Postgres via REST.
 * Delegates to ChatClientEngine (auto-reconnect + sequence catch-up).
 */

import { getApiBase } from '@/modules/auth/state/auth-store';
import {
  getChatClientEngine,
  startChatClientEngine,
  stopChatClientEngine,
  type ChatClientEngineCallbacks,
  type ChatReadReceipt,
  type ChatTypingPayload,
} from './chatClientEngine';
import type { RemoteChatMessage } from './chatRealtimeApi';

export type ReceiptPayload = ChatReadReceipt;
export type TypingPayload = ChatTypingPayload;

export type ChatSocketHandlers = {
  onMessage: (msg: RemoteChatMessage) => void;
  onRead: (payload: ReceiptPayload) => void;
  onDelivered: (payload: ReceiptPayload) => void;
  onTyping: (payload: TypingPayload) => void;
  onReconnect: () => void;
};

export function isChatSocketConnected() {
  return getChatClientEngine()?.isConnected() ?? false;
}

export function joinChatRoom(conversationId: string, initialSequence?: string) {
  getChatClientEngine()?.joinConversation(conversationId, initialSequence);
}

export function leaveChatRoom(conversationId: string) {
  getChatClientEngine()?.leaveConversation(conversationId);
}

export function rememberChatSequence(conversationId: string, sequence?: string) {
  getChatClientEngine()?.rememberSequence(conversationId, sequence);
}

export function stopChatRealtime() {
  stopChatClientEngine();
}

export function startChatRealtime(next: ChatSocketHandlers) {
  if (!getApiBase()) return;
  const callbacks: ChatClientEngineCallbacks = {
    onMessage: next.onMessage,
    onReadReceipt: next.onRead,
    onDelivered: next.onDelivered,
    onTyping: next.onTyping,
    onReconnect: next.onReconnect,
  };
  startChatClientEngine(callbacks);
}
