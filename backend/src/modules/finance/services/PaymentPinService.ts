/**
 * Payment PIN — รหัส 6 หลักสำหรับถอนเงิน
 * แฮชด้วย scrypt (เดียวกับรหัสผ่านบัญชี — timing-safe verify)
 */
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { hashPassword, verifyPassword } from '../../auth/PasswordService';

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MS = 60 * 60_000; // 1 ชั่วโมง
export const BANK_COOLING_MS = 24 * 60 * 60_000; // 24 ชั่วโมง

export function assertPinFormat(pin: string) {
  if (!/^\d{6}$/.test(pin)) {
    throw new AppError('VALIDATION', 'PIN ต้องเป็นตัวเลข 6 หลัก', 400);
  }
  // กัน PIN อ่อนเกินไป
  if (/^(\d)\1{5}$/.test(pin)) {
    throw new AppError('VALIDATION', 'อย่าใช้ PIN ที่เป็นเลขซ้ำทั้งหมด', 400);
  }
  if (pin === '123456' || pin === '000000' || pin === '654321') {
    throw new AppError('VALIDATION', 'PIN นี้ไม่ปลอดภัย กรุณาเลือกชุดอื่น', 400);
  }
}

export async function hashPaymentPin(pin: string) {
  assertPinFormat(pin);
  return hashPassword(pin);
}

export async function verifyPaymentPin(pin: string, hash: string) {
  return verifyPassword(pin, hash);
}

export function remainingLockMs(lockedUntil: Date | null | undefined, now = new Date()) {
  if (!lockedUntil) return 0;
  return Math.max(0, lockedUntil.getTime() - now.getTime());
}

export function bankCoolingRemainingMs(bankUpdatedAt: Date | null | undefined, now = new Date()) {
  if (!bankUpdatedAt) return 0;
  const unlockAt = bankUpdatedAt.getTime() + BANK_COOLING_MS;
  return Math.max(0, unlockAt - now.getTime());
}

/**
 * ตั้งค่า / เปลี่ยน PIN
 * - ครั้งแรก: ยืนยันด้วยรหัสผ่านบัญชี
 * - เปลี่ยน: ยืนยันด้วย PIN เดิม หรือรหัสผ่านบัญชี
 */
export async function setStorePaymentPin(
  storeId: string,
  input: { pin: string; password?: string; currentPin?: string },
) {
  assertPinFormat(input.pin);
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError('NOT_FOUND', 'store not found', 404);

  const profile = await prisma.userProfile.findFirst({
    where: { OR: [{ userId: storeId }, { shopId: storeId }] },
    select: { passwordHash: true },
  });

  if (!store.paymentPinHash) {
    if (!input.password?.trim()) {
      throw new AppError('VALIDATION', 'ตั้ง PIN ครั้งแรกต้องยืนยันรหัสผ่านบัญชี', 400);
    }
    if (!profile?.passwordHash) {
      throw new AppError('VALIDATION', 'บัญชีนี้ยังไม่มีรหัสผ่าน — ตั้งรหัสผ่านก่อน', 400);
    }
    const ok = await verifyPassword(input.password, profile.passwordHash);
    if (!ok) throw new AppError('FORBIDDEN', 'รหัสผ่านบัญชีไม่ถูกต้อง', 403);
  } else {
    let authorized = false;
    if (input.currentPin) {
      assertPinFormat(input.currentPin);
      authorized = await verifyPaymentPin(input.currentPin, store.paymentPinHash);
    }
    if (!authorized && input.password && profile?.passwordHash) {
      authorized = await verifyPassword(input.password, profile.passwordHash);
    }
    if (!authorized) {
      throw new AppError('FORBIDDEN', 'ต้องยืนยัน PIN เดิม หรือรหัสผ่านบัญชี', 403);
    }
  }

  const paymentPinHash = await hashPaymentPin(input.pin);
  await prisma.store.update({
    where: { id: storeId },
    data: {
      paymentPinHash,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
    },
  });
  return { ok: true as const, pinSet: true };
}

/** ตรวจ PIN ก่อนถอน — อัปเดตตัวนับผิด / ล็อก */
export async function assertWithdrawPin(storeId: string, pin: string) {
  assertPinFormat(pin);
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError('NOT_FOUND', 'store not found', 404);

  const lockLeft = remainingLockMs(store.pinLockedUntil);
  if (lockLeft > 0) {
    const mins = Math.ceil(lockLeft / 60_000);
    throw new AppError(
      'FORBIDDEN',
      `ถอนเงินถูกระงับชั่วคราว เนื่องจากใส่ PIN ผิดหลายครั้ง — ลองใหม่ในอีกประมาณ ${mins} นาที`,
      423,
    );
  }

  if (!store.paymentPinHash) {
    throw new AppError('VALIDATION', 'ยังไม่ได้ตั้ง Payment PIN — ตั้ง PIN ก่อนถอนเงิน', 400);
  }

  const ok = await verifyPaymentPin(pin, store.paymentPinHash);
  if (ok) {
    if (store.pinFailedAttempts > 0 || store.pinLockedUntil) {
      await prisma.store.update({
        where: { id: storeId },
        data: { pinFailedAttempts: 0, pinLockedUntil: null },
      });
    }
    return;
  }

  const attempts = store.pinFailedAttempts + 1;
  const locked = attempts >= PIN_MAX_ATTEMPTS;
  await prisma.store.update({
    where: { id: storeId },
    data: {
      pinFailedAttempts: locked ? 0 : attempts,
      pinLockedUntil: locked ? new Date(Date.now() + PIN_LOCK_MS) : store.pinLockedUntil,
    },
  });

  if (locked) {
    throw new AppError(
      'FORBIDDEN',
      'ใส่ PIN ผิดเกิน 5 ครั้ง — ระงับการถอนเงิน 1 ชั่วโมง',
      423,
    );
  }
  throw new AppError(
    'FORBIDDEN',
    `PIN ไม่ถูกต้อง (เหลืออีก ${PIN_MAX_ATTEMPTS - attempts} ครั้ง)`,
    403,
  );
}

export function assertBankCoolingOff(bankUpdatedAt: Date | null | undefined) {
  const left = bankCoolingRemainingMs(bankUpdatedAt);
  if (left <= 0) return;
  throw new AppError(
    'FORBIDDEN',
    'บัญชีธนาคารเพิ่งมีการเปลี่ยนแปลง กรุณารอ 24 ชั่วโมง เพื่อความปลอดภัย',
    403,
  );
}
