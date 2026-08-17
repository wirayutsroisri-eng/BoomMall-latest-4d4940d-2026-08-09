export type WireChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  status: string;
  clientMsgId?: string | null;
  metadata?: Record<string, unknown>;
  serverSequence?: string;
  kind?: string;
  replyToMessageId?: string | null;
  isDuplicate?: boolean;
  attachments?: Array<{
    url: string;
    mimeType: string;
    size?: number;
    originalFilename?: string;
    duration?: number;
  }>;
};

function isRemoteChatMessage(value: unknown): value is WireChatMessage {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.conversationId === 'string';
}

export function parsePersistedChatMessage(json: unknown): WireChatMessage | null {
  if (!json || typeof json !== 'object') return null;
  const row = json as Record<string, unknown>;
  if (isRemoteChatMessage(row.message)) return row.message;
  if (isRemoteChatMessage(row.data)) return row.data;
  if (isRemoteChatMessage(json)) return json;
  return null;
}

export function readApiError(json: unknown, fallback: string) {
  if (!json || typeof json !== 'object') return fallback;
  const err = (json as { error?: unknown }).error;
  if (typeof err === 'string' && err.trim()) return err;
  if (err && typeof err === 'object') {
    const row = err as { code?: unknown; message?: unknown };
    if (typeof row.code === 'string' && row.code.trim()) return row.code;
    if (typeof row.message === 'string' && row.message.trim()) return row.message;
  }
  return fallback;
}

export function parseSyncMessages(json: unknown): WireChatMessage[] {
  if (!json || typeof json !== 'object') return [];
  const row = json as { messages?: unknown; data?: unknown };
  if (Array.isArray(row.messages)) return row.messages.filter(isRemoteChatMessage);
  if (Array.isArray(row.data)) return [...row.data].reverse().filter(isRemoteChatMessage);
  return [];
}
