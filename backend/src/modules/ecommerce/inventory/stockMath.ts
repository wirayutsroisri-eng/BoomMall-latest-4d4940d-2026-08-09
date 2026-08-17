/** Pure stock math — reserve on pay, deduct on pack. No Prisma. */

export const DEFAULT_LOW_STOCK_THRESHOLD = 8;

export type StockSnapshot = {
  onHand: number;
  reserved: number;
};

export type StockMutation =
  | { ok: true; next: StockSnapshot }
  | { ok: false; reason: 'INSUFFICIENT' | 'INVALID' };

export function availableOf(row: StockSnapshot) {
  return Math.max(0, row.onHand - row.reserved);
}

export function stockStatusOf(available: number, threshold = DEFAULT_LOW_STOCK_THRESHOLD) {
  if (available <= 0) return 'out' as const;
  if (available <= threshold) return 'low' as const;
  return 'ready' as const;
}

export function applyReserve(row: StockSnapshot, qty: number): StockMutation {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  if (qty > availableOf(row)) return { ok: false, reason: 'INSUFFICIENT' };
  return { ok: true, next: { onHand: row.onHand, reserved: row.reserved + qty } };
}

export function applyCommitSale(row: StockSnapshot, qty: number): StockMutation {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  if (row.reserved < qty || row.onHand < qty) return { ok: false, reason: 'INSUFFICIENT' };
  return { ok: true, next: { onHand: row.onHand - qty, reserved: row.reserved - qty } };
}

export function applyRelease(row: StockSnapshot, qty: number): StockMutation {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  return { ok: true, next: { onHand: row.onHand, reserved: Math.max(0, row.reserved - qty) } };
}

export function applyReturn(row: StockSnapshot, qty: number): StockMutation {
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  return { ok: true, next: { onHand: row.onHand + qty, reserved: row.reserved } };
}

export type CourierEvent = 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';

export function normalizeCourierEvent(raw: string): CourierEvent | null {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, CourierEvent> = {
    PICKED_UP: 'PICKED_UP',
    PICKUP: 'PICKED_UP',
    COLLECTED: 'PICKED_UP',
    IN_TRANSIT: 'PICKED_UP',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    OFD: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    POD: 'DELIVERED',
    RETURNED: 'RETURNED',
    RTO: 'RETURNED',
    RETURN_TO_SENDER: 'RETURNED',
  };
  return aliases[key] ?? null;
}

export function shippingFromCourierEvent(event: CourierEvent): {
  shippingStatus: 'SHIPPED' | 'DELIVERED';
  orderStatus: 'SHIPPED' | 'DELIVERED' | null;
  returnStatus?: 'REQUESTED';
} {
  if (event === 'DELIVERED') {
    return { shippingStatus: 'DELIVERED', orderStatus: 'DELIVERED' };
  }
  if (event === 'RETURNED') {
    return { shippingStatus: 'SHIPPED', orderStatus: null, returnStatus: 'REQUESTED' };
  }
  return { shippingStatus: 'SHIPPED', orderStatus: 'SHIPPED' };
}
