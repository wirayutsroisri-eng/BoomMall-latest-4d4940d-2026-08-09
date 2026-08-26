import type { FeedItem } from '@/modules/feed/domain/types';

export function isSecondhandListing(item: FeedItem) {
  const tags = item.product.tags.map((tag) => tag.toLowerCase());
  return !item.boardSide && (
    (item.product.tier === 'C2C' && item.product.basePrice > 0)
    || tags.some((tag) => tag.includes('มือสอง') || tag.includes('secondhand'))
  );
}

export function listingImage(item: FeedItem) {
  const asset = item.mediaAssets?.find((media) => media.type === 'image');
  return asset?.canonicalUrl || item.imageUris?.[0] || item.imageUri;
}

export function listingCondition(item: FeedItem) {
  const values = ['เหมือนใหม่', 'ใช้งานปกติ', 'มีตำหนิ', 'ใหม่', 'สภาพดี'];
  return values.find((value) => item.product.tags.some((tag) => tag.includes(value))) || 'สภาพดี';
}

export function listingCategory(item: FeedItem) {
  return item.product.tags.join(' ').toLowerCase();
}
