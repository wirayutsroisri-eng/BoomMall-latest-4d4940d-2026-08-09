import { describe, expect, it } from 'vitest';
import { createAccountUserId } from './AuthService';

describe('real account identity policy', () => {
  it('creates opaque unique UUIDs that do not encode provider data', () => {
    const first = createAccountUserId();
    const second = createAccountUserId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first).not.toBe(second);
    expect(first).not.toContain('apple');
    expect(first).not.toContain('phone');
    expect(first).not.toContain('email');
  });
});
