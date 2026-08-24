import { describe, expect, it } from 'vitest';
import { shouldUseConfiguredApiUrl } from './apiBasePolicy';

describe('shouldUseConfiguredApiUrl', () => {
  it('keeps an explicit HTTPS production API in Expo development', () => {
    expect(shouldUseConfiguredApiUrl('https://api.boommall.app', false)).toBe(true);
  });

  it('keeps an explicitly pinned development API', () => {
    expect(shouldUseConfiguredApiUrl('http://10.0.0.20:4000', true)).toBe(true);
  });

  it('allows local HTTP development URLs to follow the Metro LAN host', () => {
    expect(shouldUseConfiguredApiUrl('http://192.168.1.89:4000', false)).toBe(false);
    expect(shouldUseConfiguredApiUrl('', false)).toBe(false);
  });
});
