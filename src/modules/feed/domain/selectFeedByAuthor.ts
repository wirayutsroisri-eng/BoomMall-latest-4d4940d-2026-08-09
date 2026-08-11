import type { FeedItem } from './types';

export function normalizeAuthorHandle(handle: string) {
  return handle.replace(/^@/, '').trim().toLowerCase();
}

/**
 * คอนเทนต์ของเจ้าของโปรไฟล์เท่านั้น — ใช้ทั้งกริดและฟีดตอนกดเล่น
 */
export function selectFeedByAuthor(items: FeedItem[], handle: string): FeedItem[] {
  const key = normalizeAuthorHandle(handle);
  if (!key) return [];
  return items.filter((item) => normalizeAuthorHandle(item.authorHandle) === key);
}

/** รวมรายการไม่ซ้ำ ตามลำดับ sources */
export function mergeFeedItemsById(...sources: FeedItem[][]): FeedItem[] {
  const out: FeedItem[] = [];
  const seen = new Set<string>();
  for (const list of sources) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}
