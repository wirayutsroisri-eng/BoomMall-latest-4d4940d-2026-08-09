import { buildOwnerFeedItems } from '@/modules/profile/data/buildOwnerFeedItems';
import type { FeedItem } from '@/modules/feed/domain/types';

/**
 * พอร์ตโฟลิโอครีเอเตอร์ = คอนเทนต์ของ handle นั้นเท่านั้น
 * (โพสต์ใน store + catalog ที่ authorHandle ตรงกัน — ไม่เติมคลิปคนอื่น)
 */
export function buildCreatorPortfolio(
  handle: string,
  author: string,
  shopName: string,
  realItems: FeedItem[],
): FeedItem[] {
  return buildOwnerFeedItems(handle, realItems, {
    isSelf: false,
    displayName: author,
    shopName,
  });
}
