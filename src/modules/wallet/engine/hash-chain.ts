/**
 * Tamper-evident hash chain for ledger records (NOT a cryptocurrency).
 * Uses FNV-1a 64-bit style string hash for Preview/Test portability.
 * Production should swap to SHA-256 via Secret Manager + HSM.
 */

function fnv1a64(input: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < input.length; i += 1) {
    h ^= BigInt(input.charCodeAt(i));
    h = BigInt.asUintN(64, h * prime);
  }
  return h.toString(16).padStart(16, '0');
}

export function hashLedgerRecord(payload: {
  previousHash: string;
  id: string;
  type: string;
  amount: number;
  sourceWalletId: string | null;
  destinationWalletId: string | null;
  createdAt: string;
  idempotencyKey: string;
}): string {
  const raw = [
    payload.previousHash,
    payload.id,
    payload.type,
    String(payload.amount),
    payload.sourceWalletId ?? '',
    payload.destinationWalletId ?? '',
    payload.createdAt,
    payload.idempotencyKey,
  ].join('|');
  return fnv1a64(raw);
}

export const GENESIS_HASH = '0000000000000000';

export function verifyHashChain(
  rows: Array<{ previousHash: string; recordHash: string; id: string; type: string; amount: number; sourceWalletId: string | null; destinationWalletId: string | null; createdAt: string; idempotencyKey: string }>,
): { ok: true } | { ok: false; brokenAt: string; expected: string; actual: string } {
  let prev = GENESIS_HASH;
  for (const row of rows) {
    if (row.previousHash !== prev) {
      return { ok: false, brokenAt: row.id, expected: prev, actual: row.previousHash };
    }
    const expected = hashLedgerRecord({
      previousHash: row.previousHash,
      id: row.id,
      type: row.type,
      amount: row.amount,
      sourceWalletId: row.sourceWalletId,
      destinationWalletId: row.destinationWalletId,
      createdAt: row.createdAt,
      idempotencyKey: row.idempotencyKey,
    });
    if (expected !== row.recordHash) {
      return { ok: false, brokenAt: row.id, expected, actual: row.recordHash };
    }
    prev = row.recordHash;
  }
  return { ok: true };
}
