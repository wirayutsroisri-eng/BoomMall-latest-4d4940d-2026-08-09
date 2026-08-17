import { describe, expect, it } from 'vitest';
import { incomingFromCommerceOrder } from '../domain/commerce-order-map';
import { consolidatePickList } from '../domain/pick-list';

describe('consolidatePickList', () => {
  it('stacks the same SKU across orders and keeps order refs', () => {
    const a = incomingFromCommerceOrder({
      id: 'ord-a',
      buyerId: 'b1',
      status: 'PAID',
      merchandiseThb: 3180,
      lines: [
        { variantId: 'sv-1', warehouseId: 'WH-CTI-MAIN', title: 'Charger', sku: 'CHG-MV-02', label: '48-72V', qty: 2, unitPrice: 1590 },
      ],
    });
    const b = incomingFromCommerceOrder({
      id: 'ord-b',
      buyerId: 'b2',
      status: 'PAID',
      merchandiseThb: 1590,
      lines: [
        { variantId: 'sv-1', warehouseId: 'WH-CTI-MAIN', title: 'Charger', sku: 'CHG-MV-02', label: '48-72V', qty: 1, unitPrice: 1590 },
        { variantId: 'sv-2', warehouseId: 'WH-CTI-MAIN', title: 'สายไฟ', sku: 'CBL-10-15', label: '1.5 ม.', qty: 2, unitPrice: 390 },
      ],
    });
    const wave = consolidatePickList([a, b]);
    expect(wave.orderCount).toBe(2);
    expect(wave.skuCount).toBe(2);
    expect(wave.pieceCount).toBe(5);
    const charger = wave.rows.find((row) => row.sku === 'CHG-MV-02');
    expect(charger?.qty).toBe(3);
    expect(charger?.orderIds).toEqual(['ord-a', 'ord-b']);
  });
});
