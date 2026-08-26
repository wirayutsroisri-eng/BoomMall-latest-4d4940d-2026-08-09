import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { PaymentMethodId } from '@/modules/commerce/state/checkout-store';

/** ช่องทางที่ผู้ซื้อสมัครไว้ เพื่อจ่ายเข้าบัญชีแพลตฟอร์ม ไม่ใช่โอนตรงร้าน */
export type BuyerPaymentKind = 'truemoney' | 'promptpay' | 'bank_account' | 'card';

export type BuyerPaymentInstrument = {
  id: string;
  kind: BuyerPaymentKind;
  label: string;
  /** เบอร์ / เลขพร้อมเพย์ / เลขบัญชี — บัตรเก็บแค่ last4 */
  accountNo?: string;
  accountName?: string;
  bankName?: string;
  last4?: string;
  updatedAt: string;
};

export const BUYER_PAYMENT_META: Record<
  BuyerPaymentKind,
  {
    title: string;
    hint: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    needsDetails: boolean;
    methodId: PaymentMethodId;
  }
> = {
  truemoney: {
    title: 'TrueMoney Wallet',
    hint: 'ระบุเบอร์โทรศัพท์ที่ลงทะเบียนกับ TrueMoney Wallet',
    icon: 'phone-portrait-outline',
    needsDetails: true,
    methodId: 'truemoney',
  },
  promptpay: {
    title: 'พร้อมเพย์',
    hint: 'เบอร์ 10 หลัก หรือเลขบัตร 13 หลัก',
    icon: 'qr-code-outline',
    needsDetails: true,
    methodId: 'promptpay',
  },
  bank_account: {
    title: 'บัญชีธนาคาร',
    hint: 'ตัดบัญชีผ่านแพลตฟอร์ม',
    icon: 'business-outline',
    needsDetails: true,
    methodId: 'bank_account',
  },
  card: {
    title: 'บัตรเครดิต/เดบิต',
    hint: 'เก็บแค่ 4 ตัวท้าย — ไม่เก็บเลขบัตรเต็ม',
    icon: 'card-outline',
    needsDetails: true,
    methodId: 'card',
  },
};

export const BUYER_BANKS = [
  'กสิกรไทย',
  'ไทยพาณิชย์',
  'กรุงเทพ',
  'กรุงไทย',
  'กรุงศรีอยุธยา',
  'ทหารไทยธนชาต',
  'ออมสิน',
  'ธ.ก.ส.',
] as const;

export function maskDigits(value?: string) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 4) return digits ? '••••' : '';
  return `•••• ${digits.slice(-4)}`;
}

export function validateBuyerPayment(input: {
  kind: BuyerPaymentKind;
  accountNo?: string;
  accountName?: string;
  bankName?: string;
}): string | null {
  const n = (input.accountNo ?? '').replace(/\D/g, '');
  if (input.kind === 'truemoney') {
    if (!/^0\d{9}$/.test(n)) return 'TrueMoney ใช้เบอร์โทร 10 หลัก';
    return null;
  }
  if (input.kind === 'promptpay') {
    if (n.length !== 10 && n.length !== 13) return 'พร้อมเพย์ต้องเป็นเบอร์ 10 หลัก หรือเลขบัตร 13 หลัก';
    return null;
  }
  if (input.kind === 'bank_account') {
    if (!input.bankName?.trim()) return 'เลือกธนาคาร';
    if (n.length < 10 || n.length > 15) return 'เลขบัญชีต้องมี 10–15 หลัก';
    if (!input.accountName?.trim()) return 'ใส่ชื่อบัญชี';
    return null;
  }
  if (input.kind === 'card') {
    if (n.length < 13 || n.length > 19) return 'เลขบัตรไม่ครบ';
    return null;
  }
  return null;
}

export function buyerHint(row?: BuyerPaymentInstrument) {
  if (!row) return undefined;
  if (row.kind === 'card') return row.last4 ? `•••• ${row.last4}` : undefined;
  if (row.kind === 'bank_account') return `${row.bankName ?? 'ธนาคาร'} ${maskDigits(row.accountNo)}`.trim();
  return maskDigits(row.accountNo);
}
