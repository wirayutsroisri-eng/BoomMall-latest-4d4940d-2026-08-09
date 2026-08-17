import type { ChatMessage, MessageDeliveryStatus } from './types';

export const CHAT_PAGE_SIZE = 30;

export function newClientMsgId(prefix = 'cmsg') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deliveryStatusLabel(
  status?: MessageDeliveryStatus,
  readAt?: string | null,
): string {
  switch (status) {
    case 'sending':
      return 'กำลังส่ง';
    case 'failed':
      return 'ส่งไม่สำเร็จ';
    case 'read':
      return 'อ่านแล้ว';
    case 'delivered':
      return 'ถึงแล้ว';
    case 'sent':
      return 'ส่งแล้ว';
    default:
      return readAt ?? 'ส่งแล้ว';
  }
}

export function messageIdentityKeys(m: {
  id: string;
  serverId?: string;
  clientMsgId?: string | null;
}): string[] {
  return [m.id, m.serverId, m.clientMsgId ?? undefined].filter((k): k is string => Boolean(k));
}

const STATUS_RANK: Record<MessageDeliveryStatus, number> = {
  failed: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
};

export function preferDeliveryStatus(
  current?: MessageDeliveryStatus,
  incoming?: MessageDeliveryStatus,
): MessageDeliveryStatus | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  if (current === 'failed' && incoming !== 'failed') return incoming;
  if (incoming === 'sending' && current !== 'sending' && current !== 'failed') return current;
  return STATUS_RANK[incoming] >= STATUS_RANK[current] ? incoming : current;
}

export function mergeChatMessages(local: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (!incoming.length) return local;
  const index = new Map<string, number>();
  const out = [...local];

  const indexMessage = (m: ChatMessage, i: number) => {
    for (const key of messageIdentityKeys(m)) index.set(key, i);
  };
  out.forEach(indexMessage);

  for (const row of incoming) {
    const hit = messageIdentityKeys(row)
      .map((key) => index.get(key))
      .find((i) => i != null);
    if (hit == null) {
      const i = out.length;
      out.push(row);
      indexMessage(row, i);
      continue;
    }
    const prev = out[hit];
    const merged: ChatMessage = {
      ...prev,
      ...row,
      id: prev.id,
      quote: row.quote ?? prev.quote,
      product: row.product ?? prev.product,
      serverId: row.serverId ?? prev.serverId,
      clientMsgId: row.clientMsgId ?? prev.clientMsgId,
      createdAtIso: row.createdAtIso ?? prev.createdAtIso,
      deliveryStatus: preferDeliveryStatus(prev.deliveryStatus, row.deliveryStatus),
      readAt: row.readAt ?? prev.readAt,
    };
    out[hit] = merged;
    indexMessage(merged, hit);
  }

  return out.sort((a, b) => {
    const ta = a.createdAtIso ?? '';
    const tb = b.createdAtIso ?? '';
    if (ta && tb && ta !== tb) return ta < tb ? -1 : 1;
    return 0;
  });
}

export function isNewerSequence(incoming: string, current: string): boolean {
  try {
    return BigInt(incoming) > BigInt(current);
  } catch {
    return incoming > current;
  }
}

export function advanceConversationSequence(
  sequences: Map<string, string>,
  conversationId: string,
  seq?: string | null,
): string | undefined {
  if (!conversationId || seq == null || String(seq).trim() === '') {
    return sequences.get(conversationId);
  }
  const next = String(seq);
  const current = sequences.get(conversationId);
  if (!current || isNewerSequence(next, current)) {
    sequences.set(conversationId, next);
  }
  return sequences.get(conversationId);
}

export function latestServerSequence(messages: ChatMessage[]): string | undefined {
  let best: bigint | null = null;
  for (const m of messages) {
    if (!m.serverSequence || m.deliveryStatus === 'sending' || m.deliveryStatus === 'failed') continue;
    try {
      const n = BigInt(m.serverSequence);
      if (best == null || n > best) best = n;
    } catch {
      /* skip */
    }
  }
  return best != null ? best.toString() : undefined;
}

export function oldestServerSequence(messages: ChatMessage[]): string | undefined {
  let best: bigint | null = null;
  for (const m of messages) {
    if (!m.serverSequence) continue;
    try {
      const n = BigInt(m.serverSequence);
      if (best == null || n < best) best = n;
    } catch {
      /* skip */
    }
  }
  return best != null ? best.toString() : undefined;
}

export function latestServerCursor(messages: ChatMessage[]): string | undefined {
  return latestServerSequence(messages) ?? (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const id = messages[i]?.serverId ?? messages[i]?.id;
      if (id && messages[i]?.deliveryStatus && messages[i].deliveryStatus !== 'sending' && messages[i].deliveryStatus !== 'failed') {
        return messages[i].serverId ?? messages[i].id;
      }
    }
    return undefined;
  })();
}

export function oldestServerCursor(messages: ChatMessage[]): string | undefined {
  return oldestServerSequence(messages) ?? messages.find((m) => m.serverId)?.serverId;
}
