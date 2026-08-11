import type { CommerceChannel } from './types';

/** สภาพสินค้าที่ร้านใช้จริง — ไม่ใช้ B2B/B2C/C2C แล้ว */
export type ProductCondition = 'new' | 'used';

export function conditionLabel(condition: ProductCondition): string {
  return condition === 'new' ? 'มือหนึ่ง' : 'มือสอง';
}

export function conditionHint(condition: ProductCondition): string {
  return condition === 'new'
    ? 'ของใหม่ยังไม่เคยใช้'
    : 'ของมือสองใช้แล้ว แต่ยังขายได้';
}

/** เก็บในระบบเดิมเป็น channel — มือหนึ่ง≈B2C, มือสอง≈C2C */
export function conditionToChannel(condition: ProductCondition): CommerceChannel {
  return condition === 'used' ? 'C2C' : 'B2C';
}

export function channelToCondition(channel: CommerceChannel): ProductCondition {
  return channel === 'C2C' ? 'used' : 'new';
}
