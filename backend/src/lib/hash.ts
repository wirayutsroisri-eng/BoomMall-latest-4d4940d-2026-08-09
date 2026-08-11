import { createHash } from 'crypto';

export const GENESIS_HASH = '0'.repeat(64);

export function hashLedgerRecord(parts: {
  previousHash: string;
  requestId: string;
  type: string;
  amount: string;
  createdAt: string;
}): string {
  const payload = [
    parts.previousHash,
    parts.requestId,
    parts.type,
    parts.amount,
    parts.createdAt,
  ].join('|');
  return createHash('sha256').update(payload).digest('hex');
}
