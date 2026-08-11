import { describe, expect, it } from 'vitest';
import { inferBoardSide, formatBoardBudget } from '../domain/board-side';
import { mergeProviders, supplyPostsToProviders } from '../domain/match-supply';
import { matchProviders } from '../domain/match-providers';
import { extractJobKeywords } from '../domain/extract-keywords';
import { CHANTHABURI, offsetKm } from '../domain/geo';
import { MOCK_PROVIDERS } from '../data/mockProviders';
import type { FeedItem } from '@/modules/feed/domain/types';

function fakeSupply(partial: Partial<FeedItem> & Pick<FeedItem, 'id' | 'caption'>): FeedItem {
  return {
    author: 'ช่างทดสอบ',
    authorHandle: '@test.pro',
    lane: 'board',
    boardSide: 'supply',
    location: 'จันทบุรี',
    gps: offsetKm(CHANTHABURI, 2, 1),
    likes: 1,
    comments: 0,
    shares: 0,
    isLive: false,
    musicTitle: 't',
    gradient: ['#0B3D2E', '#1A7A55'],
    product: {
      id: 'p',
      name: 'รับงาน',
      shopName: 't',
      tier: 'C2C',
      basePrice: 500,
      currency: 'THB',
      tags: ['เว็บบอร์ด', 'รับงาน'],
      variants: [],
    },
    ...partial,
  };
}

describe('Community Board side + cross-tab match', () => {
  it('infers demand vs supply from caption', () => {
    expect(inferBoardSide('หาคนตัดกอไผ่หน้าบ้าน')).toBe('demand');
    expect(inferBoardSide('รับตัดหญ้า พร้อมบริการ')).toBe('supply');
  });

  it('formats budget tags', () => {
    expect(formatBoardBudget(1500)).toBe('💰 1,500 บ.');
    expect(formatBoardBudget(0)).toBeNull();
  });

  it('matches demand against supply board cards within radius', () => {
    const supply = [
      fakeSupply({
        id: 's1',
        caption: 'รับตัดกอไผ่ ตัดหญ้า',
        authorHandle: '@near.garden',
        gps: offsetKm(CHANTHABURI, 2, 1),
      }),
      fakeSupply({
        id: 's2',
        caption: 'รับตัดกอไผ่',
        authorHandle: '@far.garden',
        gps: offsetKm(CHANTHABURI, 40, 0),
      }),
    ];
    const providers = mergeProviders([], supplyPostsToProviders(supply));
    const extracted = extractJobKeywords('หาคนตัดกอไผ่ด่วน');
    const matched = matchProviders(CHANTHABURI, extracted, providers, 10);
    expect(matched.map((m) => m.provider.handle)).toEqual(['near.garden']);
  });

  it('merges mock roster with board supply cards', () => {
    const supply = supplyPostsToProviders([
      fakeSupply({
        id: 's1',
        caption: 'รับล้างแอร์',
        authorHandle: 'air.cool.chan', // collide with mock
        gps: offsetKm(CHANTHABURI, 3, 3),
      }),
    ]);
    const merged = mergeProviders(MOCK_PROVIDERS, supply);
    const air = merged.find((p) => p.handle.replace(/^@/, '') === 'air.cool.chan');
    expect(air?.id.startsWith('supply-')).toBe(true);
  });
});
