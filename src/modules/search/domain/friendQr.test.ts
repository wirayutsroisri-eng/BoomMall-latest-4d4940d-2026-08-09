import { describe, expect, it } from 'vitest';
import { parseFriendQr } from './friendQr';

describe('friend QR payload', () => {
  const token = 'a'.repeat(43);
  it('reads the server-generated invite link', () => {
    expect(parseFriendQr(`boommall://add-friend?token=${token}`)).toBe(token);
  });
  it.each(['https://example.com/?token=', 'boommall://payment?token=', 'boommall://add-friend/other?token='])('rejects unrelated QR links: %s', (prefix) => {
    expect(parseFriendQr(prefix + token)).toBeNull();
  });
  it.each(['', 'not a link', 'boommall://add-friend?token=%E0%A4%A', 'boommall://add-friend?token=short'])('handles malformed QR without throwing: %s', (data) => {
    expect(parseFriendQr(data)).toBeNull();
  });
});
