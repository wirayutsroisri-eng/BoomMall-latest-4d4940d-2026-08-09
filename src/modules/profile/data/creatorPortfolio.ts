import { buildOwnerFeedItems } from '@/modules/profile/data/buildOwnerFeedItems';
import type { FeedItem } from '@/modules/feed/domain/types';

/** Build another creator's portfolio exclusively from API/store items owned by that handle. */
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
