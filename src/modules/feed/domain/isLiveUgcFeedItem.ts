import type { FeedItem } from './types';
import { isPlaceholderMusicText } from './feedMusic';

/** รูปสต็อก / เดโมที่เคยฝังใน mock feed */
const STOCK_MEDIA =
  /picsum\.photos|pravatar\.cc|unsplash\.com|images\.unsplash|loremflickr|placeholder\.com|dummyimage|placekitten|via\.placeholder/i;

/** แคตตาล็อกจำลองรุ่นเก่าที่ persist ไว้ในเครื่อง */
const DEMO_FEED_ID = /^(fy|fl|nb|bd)[-_]|^(feed[_-]chan|feed[_-]demo|mock-|seed-)/i;

export function mediaUriLooksLive(uri: string | undefined | null): boolean {
  const u = uri?.trim() ?? '';
  if (!u) return false;
  if (STOCK_MEDIA.test(u)) return false;
  return /^(file:|content:|ph:|assets-library:|http:|https:|data:image)/i.test(u);
}

export function isPlaceholderClip(item: FeedItem): boolean {
  if (isPlaceholderMusicText(item.musicTitle)) return true;
  if (isPlaceholderMusicText(item.overlayText)) return true;
  if (isPlaceholderMusicText(item.product?.name)) return true;
  if (isPlaceholderMusicText(item.caption)) return true;
  return false;
}

export function isDemoCatalogFeedItem(item: FeedItem): boolean {
  if (DEMO_FEED_ID.test(item.id)) return true;
  if (isPlaceholderClip(item)) return true;
  const uris = [item.imageUri, item.videoUri, ...(item.imageUris ?? [])];
  const present = uris.filter((u): u is string => Boolean(u?.trim()));
  if (present.length > 0 && present.every((u) => STOCK_MEDIA.test(u))) return true;
  return false;
}

/** คลิป/รูปที่ผู้ใช้ถ่ายหรืออัปโหลดจริง — ไม่ใช่ไล่สีหรือรูปสุ่ม */
export function isLiveUgcFeedItem(item: FeedItem): boolean {
  if (isDemoCatalogFeedItem(item)) return false;
  const uris = [item.imageUri, item.videoUri, ...(item.imageUris ?? [])];
  return uris.some((u) => mediaUriLooksLive(u));
}

export function keepLiveUgcFeedItems(items: FeedItem[]): FeedItem[] {
  return items.filter(isLiveUgcFeedItem);
}

/** เก็บโพสต์จริงตอน persist — คลิปมีสื่อ + บอร์ดข้อความ (ตัดแคตตาล็อกปลอม) */
export function keepPersistedFeedItems(items: FeedItem[]): FeedItem[] {
  return items.filter((item) => {
    if (isDemoCatalogFeedItem(item)) return false;
    if (item.lane === 'board') return true;
    return isLiveUgcFeedItem(item);
  });
}
