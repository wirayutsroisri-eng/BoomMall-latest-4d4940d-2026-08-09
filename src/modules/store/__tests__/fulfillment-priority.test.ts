import { describe, expect, it } from 'vitest';
import {
  fulfillmentPriorityOf,
  provinceFromAddress,
  sortFulfillmentQueue,
} from '../domain/fulfillment-priority';
import type { IncomingOrder } from '../domain/types';

const now = Date.parse('2026-08-15T08:00:00.000Z');

function order(partial: Partial<IncomingOrder> & Pick<IncomingOrder, 'id'>): IncomingOrder {
  return {
    masterSkuId: 'ms-05',
    customerName: 'ลูกค้า',
    customerAvatarColor: '#00A86B',
    productTitle: 'สินค้า',
    qty: 1,
    amount: 1000,
    currency: 'THB',
    status: 'paid',
    placedAt: 'เมื่อสักครู่',
    ...partial,
  };
}

describe('fulfillmentPriorityOf', () => {
  it('marks express and near-SLA orders as rank 1 urgent', () => {
    const express = fulfillmentPriorityOf(
      order({ id: 'ex', shippingSpeed: 'express', placedAtIso: '2026-08-15T05:30:00.000Z' }),
      now,
    );
    const risk = fulfillmentPriorityOf(
      order({ id: 'risk', shippingSpeed: 'standard', placedAtIso: '2026-08-14T09:30:00.000Z' }),
      now,
    );
    expect(express.rank).toBe(1);
    expect(express.urgent).toBe(true);
    expect(express.badgeLabel).toMatch(/ส่งด่วน/);
    expect(risk.rank).toBe(1);
    expect(risk.urgent).toBe(true);
  });

  it('uses FIFO for waiting orders and newest-first for fresh arrivals', () => {
    const older = order({ id: 'old', shippingSpeed: 'standard', placedAtIso: '2026-08-14T20:00:00.000Z' });
    const waiting = order({ id: 'mid', shippingSpeed: 'standard', placedAtIso: '2026-08-15T06:00:00.000Z' });
    const fresh = order({ id: 'new', shippingSpeed: 'standard', placedAtIso: '2026-08-15T07:50:00.000Z' });
    const express = order({ id: 'ex', shippingSpeed: 'express', placedAtIso: '2026-08-15T07:40:00.000Z' });

    const sorted = sortFulfillmentQueue([fresh, waiting, express, older], now).map((o) => o.id);
    expect(sorted[0]).toBe('ex');
    expect(sorted.slice(1, 3)).toEqual(['old', 'mid']);
    expect(sorted[3]).toBe('new');
  });
});

describe('provinceFromAddress', () => {
  it('reads จังหวัด before the postcode', () => {
    expect(provinceFromAddress('29/247 ม.7 ต.จันทนิมิต อ.เมืองจันทบุรี จ.จันทบุรี 22000')).toBe(
      'จันทบุรี',
    );
  });
});
