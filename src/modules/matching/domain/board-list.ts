import type { BoardSide, FeedItem } from '@/modules/feed/domain/types';
import { CHANTHABURI, distanceKm as haversineKm } from './geo';
import { extractJobKeywords } from './extract-keywords';
import { resolveBoardSide } from './board-side';
import type { GeoPoint } from './types';

export type BoardListItem = {
  item: FeedItem;
  skills: string[];
  distanceKm: number | null;
  side: BoardSide;
};

/** Sort board posts: user job posts first, then nearer, then by likes. */
export function buildBoardList(
  items: FeedItem[],
  origin: GeoPoint = CHANTHABURI,
  side?: BoardSide,
): BoardListItem[] {
  return items
    .map((item) => {
      const skills = extractJobKeywords(item.caption).skills;
      const dist = item.gps
        ? Math.round(haversineKm(origin, item.gps) * 10) / 10
        : null;
      const resolved = resolveBoardSide(item);
      return { item, skills, distanceKm: dist, side: resolved };
    })
    .filter((row) => (side ? row.side === side : true))
    .sort((a, b) => {
      if (a.item.isUserPost !== b.item.isUserPost) return a.item.isUserPost ? -1 : 1;
      if ((a.distanceKm ?? 99) !== (b.distanceKm ?? 99)) {
        return (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
      }
      return b.item.likes - a.item.likes;
    });
}
