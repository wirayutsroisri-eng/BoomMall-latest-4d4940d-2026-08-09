import type { ChatDeliveryStatus } from '../types';

export type ReceiptParticipant = {
  userId: string;
  lastReadAt?: string | Date | null;
  lastDeliveredAt?: string | Date | null;
  lastReadSequence?: bigint | string | number | null;
};

function ts(value?: string | Date | null): number {
  if (!value) return 0;
  const n = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(n) ? n : 0;
}

function sequence(value?: bigint | string | number | null): bigint {
  if (value == null || value === '') return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/** Derive sent / delivered / read from participant receipts. DB row existence means sent. */
export function computeDeliveryStatus(input: {
  senderId: string;
  createdAt: string | Date;
  serverSequence?: bigint | string | number | null;
  deleted?: boolean;
  participants: ReceiptParticipant[];
}): ChatDeliveryStatus {
  if (input.deleted) return 'deleted';
  const created = ts(input.createdAt);
  const others = input.participants.filter((p) => p.userId !== input.senderId);
  if (!others.length) return 'sent';
  const messageSequence = sequence(input.serverSequence);
  if (messageSequence > 0n && others.every((p) => sequence(p.lastReadSequence) >= messageSequence)) {
    return 'read';
  }
  if (others.every((p) => ts(p.lastReadAt) >= created)) return 'read';
  if (others.every((p) => Math.max(ts(p.lastDeliveredAt), ts(p.lastReadAt)) >= created)) {
    return 'delivered';
  }
  return 'sent';
}
