import { create } from 'zustand';

export type PaymentMethodId =
  | 'card'
  | 'boommall_pay'
  | 'promptpay'
  | 'cod'
  | 'mobile_banking'
  | 'bank_account';

export type ShippingMethodId = 'standard' | 'express' | 'locker';

export type DeliveryAddress = {
  name: string;
  phone: string;
  line1: string;
  district: string;
  amphoe: string;
  province: string;
  postcode: string;
};

type CheckoutState = {
  address: DeliveryAddress;
  paymentMethod: PaymentMethodId;
  cardLabel: string;
  shippingMethod: ShippingMethodId;
  shopVoucherOn: boolean;
  platformVoucherOn: boolean;
  noteByShop: Record<string, string>;
  protectionOn: boolean;
  setAddress: (patch: Partial<DeliveryAddress>) => void;
  setPaymentMethod: (id: PaymentMethodId, cardLabel?: string) => void;
  setShippingMethod: (id: ShippingMethodId) => void;
  setShopVoucher: (on: boolean) => void;
  setPlatformVoucher: (on: boolean) => void;
  setNote: (shopName: string, note: string) => void;
  setProtection: (on: boolean) => void;
};

export const SHIPPING_OPTIONS: Array<{
  id: ShippingMethodId;
  label: string;
  eta: string;
  fee: number;
  free?: boolean;
}> = [
  {
    id: 'standard',
    label: 'Standard Delivery · ส่งธรรมดาในประเทศ',
    eta: '13 ส.ค. - 15 ส.ค.',
    fee: 54,
    free: true,
  },
  {
    id: 'express',
    label: 'Express · ส่งด่วน',
    eta: 'พรุ่งนี้ - มะรืนนี้',
    fee: 89,
  },
  {
    id: 'locker',
    label: 'รับที่ตู้ Locker BoomMall',
    eta: '14 ส.ค. - 16 ส.ค.',
    fee: 29,
  },
];

export const PAYMENT_OPTIONS: Array<{
  id: PaymentMethodId;
  label: string;
  subtitle?: string;
  activate?: boolean;
}> = [
  { id: 'boommall_pay', label: 'ยอดเงิน BoomMall Pay', activate: true },
  { id: 'bank_account', label: 'ตัดบัญชีธนาคาร', activate: true },
  { id: 'card', label: 'บัตรเครดิต/บัตรเดบิต', subtitle: '*9318' },
  { id: 'promptpay', label: 'QR พร้อมเพย์' },
  { id: 'cod', label: 'เก็บเงินปลายทาง' },
  { id: 'mobile_banking', label: 'Mobile Banking' },
];

export const useCheckoutStore = create<CheckoutState>((set) => ({
  address: {
    name: 'นายวีรยุทธ สร้อยศรี',
    phone: '(+66) 99 926 6218',
    line1: '29/247 ม.7 ต.จันทนิมิต',
    district: 'ตำบลจันทนิมิต',
    amphoe: 'อำเภอเมืองจันทบุรี',
    province: 'จังหวัดจันทบุรี',
    postcode: '22000',
  },
  paymentMethod: 'card',
  cardLabel: '*9318',
  shippingMethod: 'standard',
  shopVoucherOn: true,
  platformVoucherOn: true,
  noteByShop: {},
  protectionOn: false,
  setAddress: (patch) => set((s) => ({ address: { ...s.address, ...patch } })),
  setPaymentMethod: (id, cardLabel) =>
    set((s) => ({
      paymentMethod: id,
      cardLabel: cardLabel ?? s.cardLabel,
    })),
  setShippingMethod: (id) => set({ shippingMethod: id }),
  setShopVoucher: (on) => set({ shopVoucherOn: on }),
  setPlatformVoucher: (on) => set({ platformVoucherOn: on }),
  setNote: (shopName, note) =>
    set((s) => ({ noteByShop: { ...s.noteByShop, [shopName]: note } })),
  setProtection: (on) => set({ protectionOn: on }),
}));

/** Shared money math for cart footer + checkout summary */
export function computeOrderTotals(input: {
  merchandise: number;
  shopCount: number;
  shopVoucherOn: boolean;
  platformVoucherOn: boolean;
  shippingMethod: ShippingMethodId;
  protectionOn: boolean;
  itemCount: number;
}) {
  const shippingOpt = SHIPPING_OPTIONS.find((o) => o.id === input.shippingMethod) ?? SHIPPING_OPTIONS[0];
  const shippingBase = shippingOpt.fee * Math.max(1, input.shopCount);
  const shippingDiscount = shippingOpt.free || input.platformVoucherOn ? Math.min(shippingBase, 48 + (input.shopCount - 1) * 20) : 0;
  const shippingPayable = Math.max(0, shippingBase - shippingDiscount);
  const shopDiscount = input.shopVoucherOn ? Math.min(120 * input.shopCount, Math.round(input.merchandise * 0.08)) : 0;
  const platformDiscount = input.platformVoucherOn ? Math.min(394, Math.round(input.merchandise * 0.15)) : 0;
  const protection = input.protectionOn ? 22 * input.itemCount : 0;
  const merchandiseAfter = Math.max(0, input.merchandise - shopDiscount - platformDiscount);
  const total = merchandiseAfter + shippingPayable + protection;
  const saved = shopDiscount + platformDiscount + shippingDiscount;
  return {
    shippingBase,
    shippingDiscount,
    shippingPayable,
    shopDiscount,
    platformDiscount,
    protection,
    total,
    saved,
    shippingLabel: shippingOpt.label,
    shippingEta: shippingOpt.eta,
  };
}
