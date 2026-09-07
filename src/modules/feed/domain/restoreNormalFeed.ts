import type { FeedItem } from './types';

/** Restore cached normal order while retaining edits, reactions and newly created posts. */
export function restoreNormalFeed(items: FeedItem[], baselineIds: string[] | null): FeedItem[] {
  if (!baselineIds) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const baseline = new Set(baselineIds);
  const created = items.filter((item) => !baseline.has(item.id) && (item.isUserPost || item.id.startsWith('feed-user-') || item.lane === 'board'));
  return [...created, ...baselineIds.flatMap((id) => { const item = byId.get(id); return item ? [item] : []; })];
}
