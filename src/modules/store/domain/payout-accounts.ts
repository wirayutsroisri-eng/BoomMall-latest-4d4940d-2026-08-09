import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
export type SellerPayoutKind = 'promptpay' | 'bank_account' | 'cod';

export type SellerPayoutAccount = {
  id: string;
  kind: SellerPayoutKind;
  enabled: boolean;
  label: string;
  /** PromptPay เบอร์/เลขบัตร หรือเลขบัญชี */
  accountNo?: string;
  accountName?: string;
  bankName?: string;
  updatedAt: string;
};

export const PAYOUT_KIND_META: Record<
  SellerPayoutKind,
  {
    title: string;
    hint: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    needsDetails: boolean;
  }
> = {
  promptpay: {
    title: 'พร้อมเพย์',
    hint: 'เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก',
    icon: 'qr-code-outline',
    needsDetails: true,
  },
  bank_account: {
    title: 'บัญชีธนาคาร',
    hint: 'บัญชีถอนยอดสุทธิจากแพลตฟอร์มหลังหัก GP',
    icon: 'business-outline',
    needsDetails: true,
  },
  cod: {
    title: 'เก็บเงินปลายทาง',
    hint: 'เปิดให้ลูกค้าจ่ายตอนรับของ',
    icon: 'cash-outline',
    needsDetails: false,
  },
};

export const THAI_BANKS = [
  'กสิกรไทย',
  'ไทยพาณิชย์',
  'กรุงเทพ',
  'กรุงไทย',
  'กรุงศรีอยุธยา',
  'ทหารไทยธนชาต',
  'ออมสิน',
  'ธ.ก.ส.',
] as const;

export function maskAccountNo(value?: string) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length < 4) return digits ? '••••' : '';
  return `•••• ${digits.slice(-4)}`;
}

export function validatePayout(input: {
  kind: SellerPayoutKind;
  accountNo?: string;
  accountName?: string;
  bankName?: string;
}): string | null {
  if (input.kind === 'promptpay') {
    const n = (input.accountNo ?? '').replace(/\D/g, '');
    if (n.length !== 10 && n.length !== 13) return 'พร้อมเพย์ต้องเป็นเบอร์ 10 หลัก หรือเลขบัตร 13 หลัก';
    return null;
  }
  if (input.kind === 'bank_account') {
    const n = (input.accountNo ?? '').replace(/\D/g, '');
    if (!input.bankName?.trim()) return 'เลือกธนาคาร';
    if (n.length < 10 || n.length > 15) return 'เลขบัญชีต้องมี 10–15 หลัก';
    if (!input.accountName?.trim()) return 'ใส่ชื่อบัญชี';
    return null;
  }
  return null;
}
