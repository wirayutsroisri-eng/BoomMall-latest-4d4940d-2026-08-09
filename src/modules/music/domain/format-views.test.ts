import { describe, expect, it } from 'vitest';
import { formatViewCount, formatWatchAgo } from './format-views';

describe('formatViewCount', () => {
  it('formats compact Thai tiers', () => {
    expect(formatViewCount(42)).toBe('42');
    expect(formatViewCount(1200)).toBe('1.2พัน');
    expect(formatViewCount(15_000)).toBe('1.5หมื่น');
    expect(formatViewCount(2_500_000)).toBe('2.5ล้าน');
  });
});

describe('formatWatchAgo', () => {
  it('shows relative Thai time', () => {
    const now = Date.parse('2026-08-11T12:00:00.000Z');
    expect(formatWatchAgo('2026-08-11T11:50:00.000Z', now)).toBe('10 นาทีที่แล้ว');
  });
});
