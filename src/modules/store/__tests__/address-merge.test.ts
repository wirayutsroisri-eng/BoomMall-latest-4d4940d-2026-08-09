import { describe, expect, it } from 'vitest';
import {
  addressMergeKey,
  formatAddress,
  isUnshippedPaid,
  mergeSameAddressOrders,
  normalizeName,
  normalizePhone,
  type MergeableOrder,
} from '../domain/address-merge';

const shop = 'shop-boom-ev';

function order(partial: Partial<MergeableOrder> & Pick<MergeableOrder, 'id'>): MergeableOrder {
  return {
    merchantId: shop,
    status: 'PAID',
    shippingStatus: null,
    merchandiseThb: 1000,
    shippingFeeThb: 40,
    shipping: {
      name: 'นายวีรยุทธ สร้อยศรี',
      phone: '(+66) 99 926 6218',
      line1: '29/247 ม.7 ต.จันทนิมิต',
      district: 'ตำบลจันทนิมิต',
      amphoe: 'อำเภอเมืองจันทบุรี',
      province: 'จังหวัดจันทบุรี',
      postcode: '22000',
      paymentMethod: 'cod',
    },
    lines: [{ title: 'แบต 60V', sku: 'BAT-60', label: 'สีดำ', qty: 1, unitPrice: 1000 }],
    ...partial,
  };
}

describe('address merge key', () => {
  it('treats titles, +66 phones, and อำเภอ/ตำบล prefixes as the same person', () => {
    const a = addressMergeKey({
      merchantId: shop,
      name: 'นายวีรยุทธ สร้อยศรี',
      phone: '(+66) 99 926 6218',
      address: formatAddress({
        name: '',
        phone: '',
        line1: '29/247 ม.7 ต.จันทนิมิต',
        district: 'ตำบลจันทนิมิต',
        amphoe: 'อำเภอเมืองจันทบุรี',
        province: 'จังหวัดจันทบุรี',
        postcode: '22000',
      }),
    });
    const b = addressMergeKey({
      merchantId: shop,
      name: 'วีรยุทธ   สร้อยศรี',
      phone: '0999266218',
      address: '29/247 ม.7 จันทนิมิต เมืองจันทบุรี จันทบุรี 22000',
    });
    expect(normalizeName('คุณวีรยุทธ สร้อยศรี')).toBe(normalizeName('นายวีรยุทธ สร้อยศรี'));
    expect(normalizePhone('+66 99-926-6218')).toBe('0999266218');
    expect(a).toBe(b);
    expect(a).toContain(shop);
  });

  it('does not merge different shops or different phones', () => {
    const base = {
      name: 'วีรยุทธ สร้อยศรี',
      phone: '0999266218',
      address: '29/247 ม.7 จันทนิมิต เมืองจันทบุรี 22000',
    };
    expect(addressMergeKey({ ...base, merchantId: 'a' })).not.toBe(
      addressMergeKey({ ...base, merchantId: 'b' }),
    );
    expect(addressMergeKey({ ...base, merchantId: shop, phone: '0811111111' })).not.toBe(
      addressMergeKey({ ...base, merchantId: shop }),
    );
  });
});

describe('mergeSameAddressOrders', () => {
  it('combines PAID unshipped orders from the same shop + address onto one label', () => {
    const groups = mergeSameAddressOrders([
      order({
        id: 'ord-1',
        lines: [{ title: 'แบต 60V', sku: 'BAT-60', label: 'สีดำ', qty: 1, unitPrice: 18900 }],
        merchandiseThb: 18900,
      }),
      order({
        id: 'ord-2',
        shipping: {
          name: 'วีรยุทธ สร้อยศรี',
          phone: '099-926-6218',
          line1: '29/247 ม.7',
          district: 'จันทนิมิต',
          amphoe: 'เมืองจันทบุรี',
          province: 'จันทบุรี',
          postcode: '22000',
          paymentMethod: 'cod',
        },
        lines: [{ title: 'ปั๊มเบรก CNC', sku: 'BRK-01', color: 'เงิน', qty: 2, unitPrice: 1190 }],
        merchandiseThb: 2380,
      }),
      order({
        id: 'ord-other',
        shipping: {
          name: 'น้อง Sky',
          phone: '0812345678',
          line1: '88 ถ.ตรีรัตน์',
          amphoe: 'เมืองจันทบุรี',
          province: 'จันทบุรี',
          postcode: '22000',
          paymentMethod: 'promptpay',
        },
        lines: [{ title: 'ยาง 14"', sku: 'TIRE-14', qty: 1, unitPrice: 1290 }],
        merchandiseThb: 1290,
      }),
      order({ id: 'ord-shipped', status: 'SHIPPED', shippingStatus: 'SHIPPED' }),
    ]);

    expect(groups).toHaveLength(2);
    const merged = groups.find((g) => g.orderIds.includes('ord-1'));
    expect(merged?.orderIds).toEqual(['ord-1', 'ord-2']);
    expect(merged?.totalQty).toBe(3);
    expect(merged?.lines).toHaveLength(2);
    expect(merged?.paymentKind).toBe('COD');
    expect(merged?.netTotalThb).toBe(18900 + 2380 + 40 + 40);
    expect(isUnshippedPaid({ status: 'PAID', shippingStatus: 'PACKED' })).toBe(true);
    expect(isUnshippedPaid({ status: 'SHIPPED', shippingStatus: 'SHIPPED' })).toBe(false);
  });
});
