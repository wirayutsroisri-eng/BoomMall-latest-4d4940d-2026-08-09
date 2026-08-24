import { describe, expect, it } from 'vitest';
import { normalizeThaiPhone } from './PhoneAuth';

describe('normalizeThaiPhone', () => {
  it.each([
    ['0812345678', '+66812345678'],
    ['0912345678', '+66912345678'],
    ['0612345678', '+66612345678'],
  ])('accepts a normal 10-digit Thai mobile number: %s', (input, expected) => {
    expect(normalizeThaiPhone(input)).toBe(expected);
  });

  it('keeps international input backward compatible for existing clients', () => {
    expect(normalizeThaiPhone('+66 81 234 5678')).toBe('+66812345678');
    expect(normalizeThaiPhone('999266218')).toBe('+66999266218');
  });

  it.each(['0212345678', '081234567'])('rejects an invalid phone: %s', (input) => {
    expect(() => normalizeThaiPhone(input)).toThrow(/10 หลัก/);
  });
});
