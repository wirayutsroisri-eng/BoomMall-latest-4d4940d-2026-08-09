/**
 * Boom Coin V1 — Closed-loop utility points inside BoomMall only.
 * Not redeemable for cash / THB. No external transfer / withdrawal.
 * Integer amounts only.
 */

export const BOOM_COIN_ASSET_ID = 'BOOM_COIN' as const;
export const BOOM_COIN_SYMBOL = '🪙';
export const BOOM_COIN_NAME = 'Boom Coin';

/** Preview flag — never enable in this slice. */
export const EXTERNAL_TRANSFER_ENABLED = false;
export const WITHDRAWAL_ENABLED = false;
export const NETWORK = 'INTERNAL' as const;
export const ASSET_TYPE = 'CLOSED_LOOP_UTILITY' as const;

export type BoomCoinAmount = number; // integer units (1 = 1 coin point)

export function assertBoomCoinInteger(amount: number): BoomCoinAmount {
  if (!Number.isInteger(amount)) {
    throw new Error('BOOM_COIN_FLOAT_FORBIDDEN: amounts must be integers');
  }
  if (!Number.isSafeInteger(amount)) {
    throw new Error('BOOM_COIN_UNSAFE_INTEGER');
  }
  return amount;
}

export function toBoomCoinAmount(raw: number): BoomCoinAmount {
  if (!Number.isFinite(raw)) throw new Error('BOOM_COIN_INVALID_AMOUNT');
  if (!Number.isInteger(raw)) {
    throw new Error('BOOM_COIN_FLOAT_FORBIDDEN: amounts must be integers');
  }
  return assertBoomCoinInteger(raw);
}

/**
 * Compact social count — same visual rules as follower counts.
 * 100 → "100" · 1_250 → "1.3K" · 12_580 → "12.6K" · 3_800_000 → "3.8M"
 * Use for: tip counts on feed, "ได้รับ Coin" on profile (lifetime / tips received).
 */
export function formatBoomCoinCount(n: number): string {
  const v = Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return `${trimOneDecimal(m)}M`;
  }
  if (v >= 1_000) {
    const k = v / 1_000;
    return `${trimOneDecimal(k)}K`;
  }
  return String(v);
}

/** @deprecated Prefer formatBoomCoinCount — same compact social formatter. */
export function formatLifetimeCoins(n: number): string {
  return formatBoomCoinCount(n);
}

/**
 * Spendable wallet balance — full digits with grouping (ขึ้น–ลงตามใช้จ่ายจริง).
 * 100 → "100" · 12_580 → "12,580"
 */
export function formatCoinBalance(n: number): string {
  return Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0)).toLocaleString('en-US');
}

function trimOneDecimal(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '');
}
