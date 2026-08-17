/**
 * SMS delivery for phone OTP. Never claims "sent" in production without a provider.
 */

import { AppError } from '../../lib/errors';

export type SmsChannel = 'twilio' | 'http' | 'dev';

function allowDevAuth() {
  return process.env.ALLOW_DEV_AUTH === '1' || process.env.NODE_ENV !== 'production';
}

export async function sendOtpSms(toE164: string, code: string): Promise<{ channel: SmsChannel }> {
  const body = `รหัสยืนยัน BoomMall คือ ${code} ใช้ได้ 5 นาที ห้ามบอกผู้อื่น`;
  const provider = (process.env.SMS_PROVIDER ?? '').trim().toLowerCase();

  if (provider === 'twilio' || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)) {
    await sendTwilio(toE164, body);
    return { channel: 'twilio' };
  }

  if (provider === 'http' || process.env.SMS_HTTP_URL?.trim()) {
    await sendHttp(toE164, body);
    return { channel: 'http' };
  }

  if (process.env.NODE_ENV === 'production' && !allowDevAuth()) {
    throw new AppError(
      'SMS_NOT_CONFIGURED',
      'ระบบส่ง SMS ยังไม่ได้ตั้งค่า — ใส่ SMS_PROVIDER ใน backend/.env',
      503,
    );
  }

  console.warn(`[dev-sms] ${toE164} => ${body}`);
  return { channel: 'dev' };
}

async function sendTwilio(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM?.trim();
  if (!sid || !token || !from) {
    throw new AppError('SMS_NOT_CONFIGURED', 'ต้องมี TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM', 503);
  }
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('Twilio SMS failed', res.status, text.slice(0, 400));
    throw new AppError('SMS_FAILED', 'ส่ง SMS ไม่สำเร็จ', 502);
  }
}

async function sendHttp(to: string, body: string) {
  const url = process.env.SMS_HTTP_URL?.trim();
  if (!url) throw new AppError('SMS_NOT_CONFIGURED', 'SMS_HTTP_URL required', 503);
  const token = process.env.SMS_HTTP_TOKEN?.trim();
  const from = process.env.SMS_HTTP_FROM?.trim() ?? 'BoomMall';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ to, from, message: body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('HTTP SMS failed', res.status, text.slice(0, 400));
    throw new AppError('SMS_FAILED', 'ส่ง SMS ไม่สำเร็จ', 502);
  }
}
