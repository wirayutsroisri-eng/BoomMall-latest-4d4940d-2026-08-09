import type { FeedItem, FeedTab } from './types';
import { extractJobKeywords } from '@/modules/matching/domain/extract-keywords';
import { distanceKm } from '@/modules/matching/domain/geo';
import type { GeoPoint } from '@/modules/matching/domain/types';
import { isLiveUgcFeedItem, isDemoCatalogFeedItem } from './isLiveUgcFeedItem';

function handleKey(handle: string) {
  return handle.replace(/^@/, '').toLowerCase();
}

export function isBoardPost(item: FeedItem): boolean {
  if (item.lane === 'board') return true;
  if (extractJobKeywords(item.caption).skills.length > 0) return true;
  return item.product.tags.some((t) => t === 'บริการ' || t === 'เว็บบอร์ด' || t === 'รับจ้าง');
}

/**
 * TikTok-style lane routing
 * - สำหรับคุณ: คลิป lane=foryou + โพสต์ผู้ใช้
 * - กำลังติดตาม: lane=following หรือคนที่ follow อยู่
 * - ใกล้คุณ: lane=nearby เท่านั้น (ไฮเปอร์โลคอล)
 * - เว็บบอร์ด: โพสต์หางาน/รับจ้าง + เลน board
 */
export function selectFeedByTab(
  items: FeedItem[],
  tab: FeedTab,
  followingHandles: Record<string, true> = {},
  nearbyOrigin?: GeoPoint,
  nearbyRadiusKm = 10,
  myHandle?: string,
): FeedItem[] {
  if (!items.length) return items;
  const me = handleKey(myHandle ?? '');

  if (tab === 'foryou') {
    return items.filter((i) => {
      if (!isLiveUgcFeedItem(i)) return false;
      if (isBoardPost(i)) return false;
      return i.isUserPost || i.lane === 'foryou' || !i.lane;
    });
  }

  if (tab === 'following') {
    return items
      .filter((i) => {
        if (!isLiveUgcFeedItem(i)) return false;
        if (isBoardPost(i)) return false;
        if (me && handleKey(i.authorHandle) === me) return true;
        if (i.isUserPost) return true;
        if (i.lane === 'following') return true;
        return Boolean(followingHandles[handleKey(i.authorHandle)]);
      })
      .sort((a, b) => Number(Boolean(b.isUserPost)) - Number(Boolean(a.isUserPost)));
  }

  if (tab === 'board') {
    return items.filter((i) => isBoardPost(i) && !isDemoCatalogFeedItem(i));
  }

  return items.filter((i) => {
    if (!isLiveUgcFeedItem(i)) return false;
    if (i.lane === 'nearby') return true;
    if (!nearbyOrigin || !i.gps) return false;
    return distanceKm(nearbyOrigin, i.gps) <= nearbyRadiusKm;
  });
}

export function pinPromotedFeedItems(items: FeedItem[], promotedProductIds: Set<string>): FeedItem[] {
  if (!promotedProductIds.size) return items;
  const hot: FeedItem[] = [];
  const rest: FeedItem[] = [];
  for (const item of items) {
    if (promotedProductIds.has(item.product.id)) hot.push(item);
    else rest.push(item);
  }
  return hot.length ? [...hot, ...rest] : items;
}
