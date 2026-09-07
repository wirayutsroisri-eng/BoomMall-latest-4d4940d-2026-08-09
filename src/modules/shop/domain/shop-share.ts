import { Platform, Share } from 'react-native';
import { normalizeShopKey } from './shop-identity';

export const SHOP_SHARE_HOST = 'https://boommall.app';

/** Canonical shop URL — always built from the backend slug, never from displayName. */
export function buildShopShareUrl(slug: string): string {
  const key = encodeURIComponent(normalizeShopKey(slug) || 'home');
  return `${SHOP_SHARE_HOST}/shop/${key}`;
}

export function shopShareMessage(displayName: string): string {
  const name = displayName.trim() || 'ร้านค้า';
  return `ดูร้าน "${name}" บน BoomMall`;
}

/**
 * Opens the system share sheet with the canonical shop link.
 * iOS supports a dedicated `url` field; Android gets the URL appended to the message.
 */
export async function shareShopNative(input: {
  /** canonical backend slug (handle or shopId). */
  slug: string;
  displayName: string;
}): Promise<'shared' | 'dismissed'> {
  const title = input.displayName.trim() || 'ร้านค้า';
  const url = buildShopShareUrl(input.slug);
  const message = shopShareMessage(input.displayName);
  const result = await Share.share(
    Platform.OS === 'ios'
      ? { title, url, message }
      : { title, message: `${message}\n${url}` },
  );
  return result.action === Share.sharedAction ? 'shared' : 'dismissed';
}
