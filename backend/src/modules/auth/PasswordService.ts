import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AppError } from '../../lib/errors';

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = (await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LEN)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function assertPasswordPolicy(password: string) {
  if (password.length < 8) {
    throw new AppError('VALIDATION', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 400);
  }
}

export function randomTempPassword() {
  return randomBytes(9).toString('base64url').slice(0, 12);
}
