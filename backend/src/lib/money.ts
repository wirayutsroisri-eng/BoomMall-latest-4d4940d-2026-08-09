/** Boom Coin amounts are integers only (1 coin = 1 THB entitlement). */

export function toCoin(raw: number | string | bigint): bigint {
  if (typeof raw === 'bigint') {
    if (raw < 0n) throw new Error('NEGATIVE_AMOUNT');
    return raw;
  }
  if (typeof raw === 'string') {
    if (!/^\d+$/.test(raw)) throw new Error('INVALID_AMOUNT');
    return BigInt(raw);
  }
  if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    throw new Error('INVALID_AMOUNT');
  }
  return BigInt(raw);
}

export function coinToNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('AMOUNT_TOO_LARGE');
  }
  return Number(v);
}

export function serializeBigInt<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}
