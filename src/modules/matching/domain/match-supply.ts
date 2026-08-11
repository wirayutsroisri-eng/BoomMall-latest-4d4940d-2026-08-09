import type { FeedItem } from '@/modules/feed/domain/types';
import { CHANTHABURI } from './geo';
import { extractJobKeywords } from './extract-keywords';
import { resolveBoardSide } from './board-side';
import type { ServiceProvider } from './types';

/**
 * Map active supply-side board cards into ServiceProvider shape
 * so demand posts can match across Tab 2 listings.
 */
export function supplyPostsToProviders(items: FeedItem[]): ServiceProvider[] {
  return items
    .filter((item) => {
      if (item.lane !== 'board' && !item.product.tags.includes('เว็บบอร์ด')) return false;
      return resolveBoardSide(item) === 'supply';
    })
    .map((item) => {
      const extracted = extractJobKeywords(item.caption);
      return {
        id: `supply-${item.id}`,
        name: item.author,
        handle: item.authorHandle.replace(/^@/, ''),
        avatarColor: item.gradient?.[0] ?? '#1A7A55',
        skills: extracted.skills.length > 0 ? extracted.skills : [item.product.name],
        categories: extracted.categories,
        gps: item.gps ?? CHANTHABURI,
        isActive: true,
      } satisfies ServiceProvider;
    });
}

/** Merge mock roster + live supply cards; prefer live card when handle collides. */
export function mergeProviders(
  mock: ServiceProvider[],
  fromBoard: ServiceProvider[],
): ServiceProvider[] {
  const byHandle = new Map<string, ServiceProvider>();
  for (const p of mock) {
    byHandle.set(p.handle.replace(/^@/, '').toLowerCase(), p);
  }
  for (const p of fromBoard) {
    byHandle.set(p.handle.replace(/^@/, '').toLowerCase(), p);
  }
  return [...byHandle.values()];
}
