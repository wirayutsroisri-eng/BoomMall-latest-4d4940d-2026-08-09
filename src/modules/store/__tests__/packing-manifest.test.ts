import { describe, expect, it } from 'vitest';
import { incomingFromCommerceOrder } from '../domain/commerce-order-map';
import { packingManifestForOrder, packingManifestOf } from '../domain/packing-manifest';
import type { IncomingOrder } from '../domain/types';

const kit = incomingFromCommerceOrder({
  id: 'io-kit',
  buyerId: 'buyer-kit',
  status: 'PAID',
  merchandiseThb: 20390,
  createdAt: '2026-08-15T08:00:00.000Z',
  shipping: {
    name: 'ช่างเอก คอนเวอร์ชัน',
    phone: '0815550199',
    line1: '88/12 ถ.ตรีรัตน์ ต.วัดใหม่ อ.เมืองจันทบุรี จ.จันทบุรี 22000',
    province: 'จันทบุรี',
    postcode: '22000',
    paymentMethod: 'promptpay',
  },
  lines: [
    { productId: 'ms-motor', title: 'Hub Motor ล้อ 14"', sku: 'BEV-MTR-3000', label: '3000W', qty: 1, unitPrice: 6900 },
    { productId: 'ms-motor', title: 'Hub Motor ล้อ 14"', sku: 'BEV-MTR-2000', label: '2000W', qty: 1, unitPrice: 5900 },
    { productId: 'ms-ctrl', title: 'ตัวควบคุม FOC', sku: 'BEV-CTL-680', label: '680', qty: 1, unitPrice: 3200 },
    { productId: 'ms-ctrl', title: 'ตัวควบคุม FOC', sku: 'BEV-CTL-1200', label: '1200', qty: 1, unitPrice: 3800 },
    { productId: 'ms-thr', title: 'คันเร่ง Hall Sensor', sku: 'EVP-THR-STD', label: 'มาตรฐาน', qty: 1, unitPrice: 590 },
  ],
});

const battery: IncomingOrder = incomingFromCommerceOrder({
  id: 'io-1',
  buyerId: 'buyer-weerayut',
  status: 'PAID',
  merchandiseThb: 18900,
  createdAt: '2026-08-15T05:00:00.000Z',
  shipping: {
    name: 'นายวีรยุทธ สร้อยศรี',
    phone: '0999266218',
    line1: '29/247 ม.7 ต.จันทนิมิต อ.เมืองจันทบุรี จ.จันทบุรี 22000',
    province: 'จันทบุรี',
    postcode: '22000',
    paymentMethod: 'cod',
  },
  lines: [{ title: '60V 32Ah Smart BMS Pack', sku: 'BAT-60-32', label: 'สีดำ · 60V/32Ah', qty: 1, unitPrice: 18900 }],
});

const brake: IncomingOrder = incomingFromCommerceOrder({
  id: 'io-1b',
  buyerId: 'buyer-weerayut',
  status: 'PAID',
  merchandiseThb: 2380,
  createdAt: '2026-08-15T07:42:00.000Z',
  shipping: {
    name: 'วีรยุทธ สร้อยศรี',
    phone: '0999266218',
    line1: '29/247 ม.7 จันทนิมิต เมืองจันทบุรี จันทบุรี 22000',
    province: 'จันทบุรี',
    postcode: '22000',
    paymentMethod: 'cod',
  },
  lines: [{ title: 'CNC Front Brake Master', sku: 'BRK-CNC-01', label: 'อะลูมิเนียม · สีเงิน', qty: 2, unitPrice: 1190 }],
});

const paid = [kit, battery, brake];

describe('packingManifestForOrder', () => {
  it('prints the kit card SKUs — not another address on the queue', () => {
    const pack = packingManifestForOrder(kit, paid);
    expect(pack.orderIds).toEqual(['io-kit']);
    expect(pack.summary.label).toBe('รวม 3 รายการ (5 ชิ้น)');
    expect(pack.lines.map((line) => [line.option, line.sku, line.qty])).toEqual([
      ['3000W', 'BEV-MTR-3000', 1],
      ['2000W', 'BEV-MTR-2000', 1],
      ['680', 'BEV-CTL-680', 1],
      ['1200', 'BEV-CTL-1200', 1],
      ['มาตรฐาน', 'EVP-THR-STD', 1],
    ]);
    expect(pack.amount).toBe(20390);
    expect(pack.paymentKind).toBe('PAID');
  });

  it('keeps same-address peers on one label and matches the card line list', () => {
    const pack = packingManifestForOrder(battery, paid);
    expect(pack.orderIds).toEqual(['io-1', 'io-1b']);
    expect(pack.lines.map((line) => line.sku)).toEqual(['BAT-60-32', 'BRK-CNC-01']);
    expect(packingManifestOf(pack.orders).lines).toEqual(pack.lines);
    expect(pack.summary.label).toBe('รวม 2 รายการ (3 ชิ้น)');
  });
});
