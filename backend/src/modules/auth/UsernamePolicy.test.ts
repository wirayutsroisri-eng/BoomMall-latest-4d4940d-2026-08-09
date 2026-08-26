import { describe, expect, it } from 'vitest';
import { createDefaultUsername, normalizeUsername, validateUsername } from './UsernamePolicy';

describe('production username policy', () => {
  it('creates an opaque, unbranded username', () => {
    const username = createDefaultUsername('08f1ac17-c27a-4e01-a34a-a23bcf98280a');
    expect(username).toBe('user_08f1ac17c27a');
    expect(username).not.toContain('boom');
  });

  it('normalizes the visual @ prefix and casing', () => {
    expect(normalizeUsername(' @New.User_99 ')).toBe('new.user_99');
  });

  it('rejects malformed or too-short usernames', () => {
    expect(validateUsername('@ab')).toBeNull();
    expect(validateUsername('@.broken')).toBeNull();
    expect(validateUsername('@bad#name')).toBeNull();
    expect(validateUsername('@valid_user')).toBe('valid_user');
  });
});
