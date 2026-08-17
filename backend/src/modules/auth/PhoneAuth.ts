/**
 * Phone SMS OTP — hashed codes, rate limits, Thai E.164 numbers.
 * Production refuses to issue a session unless SMS actually sends (or ALLOW_DEV_AUTH on LAN).
 */

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../lib/errors';
import { sendOtpSms } from './SmsService';

const OTP_TTL_MS = 5 * 60_000;
const RESEND_MS = 45_000;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 8;
const LOCK_MS = 15 * 60_000;

type OtpRecord = {
  salt: string;
  hash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  hourCount: number;
  hourWindowStart: number;
  lockedUntil: number;
};

const store = new Map<string, OtpRecord>();

function allowDevAuth() {
  return process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
}

function hashCode(phone: string, code: string, salt: string) {
  return createHash('sha256').update(`${phone}:${code}:${salt}`).digest('hex');
}

function safeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Accept 08xxxxxxxx / 8xxxxxxxx / +668xxxxxxxx → +66XXXXXXXXX */
export function normalizeThaiPhone(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) throw new AppError('VALIDATION', 'กรอกเบอร์โทรศัพท์', 400);
  const digits = raw.replace(/\D/g, '');
  let national: string | null = null;
  if (digits.startsWith('66') && digits.length === 11) national = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 10) national = digits.slice(1);
  else if (digits.length === 9 && digits.startsWith('8')) national = digits;
  if (!national || !/^8\d{8}$/.test(national)) {
    throw new AppError('VALIDATION', 'เบอร์โทรไม่ถูกต้อง — ใช้เบอร์มือถือไทย 10 หลัก', 400);
  }
  return `+66${national}`;
}

export function maskPhone(e164: string) {
  const d = e164.replace(/\D/g, '');
  return `••• ••• ${d.slice(-4)}`;
}

function getOrInit(phone: string): OtpRecord {
  const now = Date.now();
  const existing = store.get(phone);
  if (!existing) {
    const fresh: OtpRecord = {
      salt: '',
      hash: '',
      expiresAt: 0,
      attempts: 0,
      lastSentAt: 0,
      hourCount: 0,
      hourWindowStart: now,
      lockedUntil: 0,
    };
    store.set(phone, fresh);
    return fresh;
  }
  if (now - existing.hourWindowStart > 60 * 60_000) {
    existing.hourCount = 0;
    existing.hourWindowStart = now;
  }
  if (existing.lockedUntil && now > existing.lockedUntil) {
    existing.lockedUntil = 0;
    existing.attempts = 0;
  }
  return existing;
}

export async function requestPhoneOtp(input: { phone: string; ipHint?: string }) {
  void input.ipHint;
  const phone = normalizeThaiPhone(input.phone);
  const rec = getOrInit(phone);
  const now = Date.now();

  if (rec.lockedUntil && now < rec.lockedUntil) {
    throw new AppError('RATE_LIMIT', 'ลองใหม่ภายหลัง — มีการยืนยันผิดหลายครั้ง', 429);
  }
  if (rec.lastSentAt && now - rec.lastSentAt < RESEND_MS) {
    const wait = Math.ceil((RESEND_MS - (now - rec.lastSentAt)) / 1000);
    throw new AppError('RATE_LIMIT', `ส่งรหัสได้อีกครั้งใน ${wait} วินาที`, 429);
  }
  if (rec.hourCount >= MAX_SENDS_PER_HOUR) {
    throw new AppError('RATE_LIMIT', 'ส่งรหัสครบจำนวนแล้วในชั่วโมงนี้', 429);
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const salt = randomBytes(16).toString('hex');
  rec.salt = salt;
  rec.hash = hashCode(phone, code, salt);
  rec.expiresAt = now + OTP_TTL_MS;
  rec.attempts = 0;
  rec.lastSentAt = now;
  rec.hourCount += 1;

  const sms = await sendOtpSms(phone, code);
  const debugCode = sms.channel === 'dev' && allowDevAuth() ? code : undefined;

  return {
    sent: true,
    phoneMasked: maskPhone(phone),
    expiresInSec: Math.round(OTP_TTL_MS / 1000),
    resendInSec: Math.round(RESEND_MS / 1000),
    channel: sms.channel,
    debugCode,
  };
}

export function consumePhoneOtp(input: { phone: string; code: string }): string {
  const phone = normalizeThaiPhone(input.phone);
  const code = String(input.code ?? '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) {
    throw new AppError('VALIDATION', 'กรอกรหัส 6 หลัก', 400);
  }

  const rec = store.get(phone);
  const now = Date.now();
  if (!rec?.hash || !rec.salt) {
    throw new AppError('UNAUTHORIZED', 'ยังไม่ได้ส่งรหัส หรือรหัสหมดอายุแล้ว', 401);
  }
  if (rec.lockedUntil && now < rec.lockedUntil) {
    throw new AppError('RATE_LIMIT', 'ลองใหม่ภายหลัง — มีการยืนยันผิดหลายครั้ง', 429);
  }
  if (now > rec.expiresAt) {
    store.delete(phone);
    throw new AppError('UNAUTHORIZED', 'รหัสหมดอายุแล้ว — ส่งรหัสใหม่', 401);
  }

  rec.attempts += 1;
  const ok = safeEqualHex(rec.hash, hashCode(phone, code, rec.salt));
  if (!ok) {
    if (rec.attempts >= MAX_VERIFY_ATTEMPTS) {
      rec.lockedUntil = now + LOCK_MS;
      rec.hash = '';
    }
    throw new AppError('UNAUTHORIZED', 'รหัสไม่ถูกต้อง', 401);
  }

  store.delete(phone);
  return phone;
}
