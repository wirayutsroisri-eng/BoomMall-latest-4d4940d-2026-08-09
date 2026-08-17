import { describe, expect, it } from 'vitest';
import { incomingFromCommerceOrder } from '../domain/commerce-order-map';
import {
  extraSkuCount,
  groupOrderSkuItems,
  groupPackLines,
  packSummary,
  skuBadgeLabel,
  toOrderSkuItems,
  variantLineLabel,
} from '../domain/pack-lines';

const kit = incomingFromCommerceOrder({
  id: 'ord-kit-1',
  buyerId: 'buyer-kit',
  status: 'PAID',
  merchandiseThb: 20390,
  createdAt: '2026-08-15T08:00:00.000Z',
  shipping: {
    name: 'ช่างเอก คอนเวอร์ชัน',
    phone: '0815550199',
    line1: '88/12 ถ.ตรีรัตน์',
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

describe('incomingFromCommerceOrder', () => {
  it('keeps every checkout SKU on one seller order', () => {
    expect(kit.id).toBe('ord-kit-1');
    expect(kit.status).toBe('paid');
    expect(kit.qty).toBe(5);
    expect(kit.lines).toHaveLength(5);
    expect(kit.shippingAddress).toContain('จันทบุรี');
    expect(kit.paymentMethod).toBe('PAID');
  });
});

describe('groupPackLines', () => {
  it('stacks motor / controller options in the same column groups', () => {
    const groups = groupPackLines(kit.lines ?? []);
    expect(groups.map((g) => g.title)).toEqual([
      'Hub Motor ล้อ 14"',
      'ตัวควบคุม FOC',
      'คันเร่ง Hall Sensor',
    ]);
    expect(groups[0]?.variants.map((v) => v.option)).toEqual(['3000W', '2000W']);
    expect(groups[1]?.variants.map((v) => v.option)).toEqual(['680', '1200']);
    expect(extraSkuCount(kit.lines ?? [])).toBe(4);
    expect(variantLineLabel(groups[0]!.variants[0]!)).toBe('3000W · SKU BEV-MTR-3000 · x1');
    expect(packSummary(kit.lines ?? []).label).toBe('รวม 3 รายการ (5 ชิ้น)');
  });

  it('accepts checkout-shaped items { name, variantName, quantity, image, price }', () => {
    const items = toOrderSkuItems([
      { productId: 'ms-motor', name: 'Hub Motor ล้อ 14"', variantName: '3000W', quantity: 1, price: 6900, image: 'https://img/m' },
      { productId: 'ms-motor', name: 'Hub Motor ล้อ 14"', variantName: '2000W', quantity: 1, price: 5900 },
      { productId: 'ms-ctrl', name: 'ตัวควบคุม FOC', variantName: '680', quantity: 2, price: 3200 },
    ]);
    expect(items[0]).toMatchObject({
      productId: 'ms-motor',
      name: 'Hub Motor ล้อ 14"',
      variantName: '3000W',
      quantity: 1,
      image: 'https://img/m',
      price: 6900,
    });
    const groups = groupOrderSkuItems(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.qty).toBe(2);
    expect(groups[1]?.qty).toBe(2);
    expect(packSummary(groups.flatMap((g) => g.variants)).label).toBe('รวม 2 รายการ (4 ชิ้น)');
  });
});

describe('skuBadgeLabel', () => {
  it('keeps watt / color and prefixes numeric controller models', () => {
    expect(skuBadgeLabel('3000W')).toBe('3000W');
    expect(skuBadgeLabel('680')).toBe('รุ่น 680');
    expect(skuBadgeLabel('สีดำ')).toBe('สีดำ');
    expect(skuBadgeLabel('รุ่น 1200')).toBe('รุ่น 1200');
    expect(skuBadgeLabel('')).toBe('');
  });
});
