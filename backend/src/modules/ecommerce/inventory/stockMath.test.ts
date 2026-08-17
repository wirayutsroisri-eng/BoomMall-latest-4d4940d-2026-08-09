import { describe, expect, it } from 'vitest';
import {
  applyCommitSale,
  applyRelease,
  applyReserve,
  applyReturn,
  availableOf,
  normalizeCourierEvent,
  shippingFromCourierEvent,
  stockStatusOf,
} from './stockMath';

describe('stockMath', () => {
  it('reserves without cutting on-hand, then commits both sides', () => {
    const start = { onHand: 10, reserved: 0 };
    const reserved = applyReserve(start, 3);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.next).toEqual({ onHand: 10, reserved: 3 });
    expect(availableOf(reserved.next)).toBe(7);
    expect(stockStatusOf(availableOf(reserved.next), 8)).toBe('low');

    const packed = applyCommitSale(reserved.next, 3);
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;
    expect(packed.next).toEqual({ onHand: 7, reserved: 0 });
  });

  it('releases a paid reservation and restores a packed return', () => {
    const reserved = applyReserve({ onHand: 5, reserved: 0 }, 2);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cancelled = applyRelease(reserved.next, 2);
    expect(cancelled.ok && cancelled.next).toEqual({ onHand: 5, reserved: 0 });

    const packed = applyCommitSale({ onHand: 5, reserved: 2 }, 2);
    expect(packed.ok).toBe(true);
    if (!packed.ok) return;
    const returned = applyReturn(packed.next, 2);
    expect(returned.ok && returned.next).toEqual({ onHand: 5, reserved: 0 });
  });

  it('maps courier events to shipping status', () => {
    expect(normalizeCourierEvent('picked-up')).toBe('PICKED_UP');
    expect(normalizeCourierEvent('ofd')).toBe('OUT_FOR_DELIVERY');
    expect(shippingFromCourierEvent('PICKED_UP').shippingStatus).toBe('SHIPPED');
    expect(shippingFromCourierEvent('DELIVERED').orderStatus).toBe('DELIVERED');
    expect(shippingFromCourierEvent('RETURNED').returnStatus).toBe('REQUESTED');
  });
});
