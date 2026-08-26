import {
  mergeFeedItemsById,
  normalizeAuthorHandle,
  selectFeedByAuthor,
} from '@/modules/feed/domain/selectFeedByAuthor';
import { isBoardPost } from '@/modules/feed/domain/selectFeedByTab';
import { isLiveUgcFeedItem } from '@/modules/feed/domain/isLiveUgcFeedItem';
import type { FeedItem } from '@/modules/feed/domain/types';

type Options = {
  isSelf?: boolean;
  ownerUserId?: string;
  displayName?: string;
  shopName?: string;
  /** ตัดโพสต์เว็บบอร์ดออกจากกริดคลิป */
  excludeBoard?: boolean;
  /** ตัดช่องว่างที่ไม่มีรูป/วิดีโอ (บล็อกไล่สี) */
  requireMedia?: boolean;
};

/**
 * รายการคลิปของเจ้าของโปรไฟล์เท่านั้น (โพสต์จริงใน store)
 */
export function buildOwnerFeedItems(
  handle: string,
  storeItems: FeedItem[],
  options: Options = {},
): FeedItem[] {
  const key = normalizeAuthorHandle(handle);
  const ownerUserId = options.ownerUserId?.trim();
  if (!key && !ownerUserId) return [];
  const fromStore = options.isSelf
    ? storeItems.filter((i) =>
        ownerUserId
          ? i.authorId === ownerUserId
            || (!i.authorId && normalizeAuthorHandle(i.authorHandle) === key)
          : normalizeAuthorHandle(i.authorHandle) === key,
      )
    : selectFeedByAuthor(storeItems, key);

  const excludeBoard = options.excludeBoard !== false;
  const requireMedia = options.requireMedia !== false;

  return mergeFeedItemsById(fromStore, [])
    .filter((item) => {
      if (excludeBoard && isBoardPost(item)) return false;
      if (requireMedia && !isLiveUgcFeedItem(item)) return false;
      return true;
    })
    .map((item) => ({
      ...item,
      author: options.displayName?.trim() || item.author,
      authorHandle: key ? (key.startsWith('@') ? key : `@${key}`) : item.authorHandle,
      product: {
        ...item.product,
        shopName: options.shopName?.trim() || item.product.shopName,
      },
    }));
}
