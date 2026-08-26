import { describe, expect, it } from 'vitest';
import { buyerIdOf, shortOrderId, snapshotOfOrder } from '../domain/order-snapshot';
import type { IncomingOrder } from '../domain/types';

function order(partial: Partial<IncomingOrder> & Pick<IncomingOrder, 'id'>): IncomingOrder {
  return {
    masterSkuId: 'ms-05',
    customerName: 'นายวีรยุทธ สร้อยศรี',
    customerAvatarColor: '#F5A524',
    productTitle: '60V 32Ah Smart BMS Pack',
    qty: 1,
    amount: 18900,
    currency: 'THB',
    status: 'paid',
    placedAt: 'เมื่อสักครู่',
    variantLabel: 'สีดำ · 60V/32Ah',
    paymentMethod: 'COD',
    ...partial,
  };
}

describe('shortOrderId', () => {
  it('maps incoming ids to BM- prefixes', () => {
    expect(shortOrderId('io-1')).toBe('BM-1');
    expect(shortOrderId('BM-4419')).toBe('BM-4419');
    expect(shortOrderId('abc12345zz')).toBe('BM-ABC12345');
  });
});

describe('buyerIdOf', () => {
  it('prefers an explicit buyerId', () => {
    expect(buyerIdOf(order({ id: 'io-1', buyerId: 'buyer-weerayut' }))).toBe('buyer-weerayut');
  });

  it('slugs the customer name when buyerId is missing', () => {
    expect(buyerIdOf(order({ id: 'io-1' }))).toBe('buyer-วีรยุทธ-สร้อยศรี');
  });
});

describe('snapshotOfOrder', () => {
  it('builds a compact order card for chat', () => {
    const shopId = '6ac8c9c0-f988-4d70-9471-3005b20e8acd';
    const snap = snapshotOfOrder(
      order({
        id: 'io-1',
        buyerId: 'buyer-weerayut',
        imageUri: 'https://example.com/pack.jpg',
        lines: [
          { title: '60V 32Ah Smart BMS Pack', option: 'สีดำ', qty: 1, unitPrice: 18900 },
          { title: 'CNC Front Brake Master', option: 'เงิน', qty: 2, unitPrice: 1190 },
        ],
      }),
      shopId,
    );
    expect(snap.orderId).toBe('io-1');
    expect(snap.buyerId).toBe('buyer-weerayut');
    expect(snap.shopId).toBe(shopId);
    expect(snap.title).toBe('60V 32Ah Smart BMS Pack');
    expect(snap.option).toBe('สีดำ · 60V/32Ah');
    expect(snap.qty).toBe(1);
    expect(snap.amount).toBe(18900);
    expect(snap.paymentKind).toBe('COD');
    expect(snap.orderStatus).toBe('paid');
    expect(snap.orderStatusLabel).toMatch(/รอจัดส่ง|To Ship/);
    expect(snap.extraCount).toBe(1);
    expect(snap.imageUri).toBe('https://example.com/pack.jpg');
  });
});
