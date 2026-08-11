import { mockFeedsData } from '@/modules/feed/data/mockFeedsData';
import { mockMyContent } from '@/modules/feed/data/mockMyContent';
import {
  mergeFeedItemsById,
  normalizeAuthorHandle,
  selectFeedByAuthor,
} from '@/modules/feed/domain/selectFeedByAuthor';
import type { FeedItem } from '@/modules/feed/domain/types';

type Options = {
  /** โปรไฟล์ของเรา — รวม mockMyContent ที่เป็นเจ้าของบัญชี */
  isSelf?: boolean;
  displayName?: string;
  shopName?: string;
};

/**
 * รายการคลิปของเจ้าของโปรไฟล์เท่านั้น (store + catalog ของ handle นั้น)
 * ไม่เติมเทมเพลตคนอื่น — กริดกับฟีดเล่นใช้ชุดเดียวกัน
 */
export function buildOwnerFeedItems(
  handle: string,
  storeItems: FeedItem[],
  options: Options = {},
): FeedItem[] {
  const key = normalizeAuthorHandle(handle);
  if (!key) return [];

  const fromStore = options.isSelf
    ? storeItems.filter(
        (i) => i.isUserPost || normalizeAuthorHandle(i.authorHandle) === key,
      )
    : selectFeedByAuthor(storeItems, key);
  const fromCatalog = selectFeedByAuthor(mockFeedsData, key);

  let merged = mergeFeedItemsById(fromStore, fromCatalog).map((item) => ({
    ...item,
    author: options.displayName?.trim() || item.author,
    authorHandle: key.startsWith('@') ? key : `@${key}`,
  }));

  if (options.isSelf) {
    const seen = new Set(merged.map((i) => i.id));
    const seeded = mockMyContent
      .filter((m) => !seen.has(m.id))
      .map((m) => ({
        ...m,
        author: options.displayName?.trim() || m.author,
        authorHandle: `@${key}`,
        isUserPost: true as const,
        product: {
          ...m.product,
          shopName: options.shopName?.trim() || m.product.shopName,
        },
      }));
    merged = [...merged, ...seeded];
  }

  return merged;
}
