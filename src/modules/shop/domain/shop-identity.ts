/**
 * Shop identity (front-end) — V2.
 *
 * Identity (displayName / avatarUrl / slug) MUST come from the Backend shop API.
 * The Auth store is used ONLY for ownership detection (auth.user.shopId === shop.id).
 * No pravatar / no local mock / no substituting the signed-in profile for a shop.
 */

import type { ShopInfo } from './shopInfo';

export function normalizeShopKey(value?: string | null): string {
  return (value ?? '').trim().replace(/^@+/, '').toLowerCase();
}

export type ShopIdentity = {
  shopId: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  /** True when the viewing account owns the shop (Auth for ownership only). */
  isOwner: boolean;
};

export function buildShopIdentity(input: {
  shop?: ShopInfo | null;
  /** Offline/degraded fallback label from the synced product row (never mock). */
  fallbackName?: string | null;
  /** Signed-in shop id — only used to detect ownership. */
  currentShopId?: string | null;
}): ShopIdentity {
  const shop = input.shop ?? null;
  const displayName =
    shop?.displayName?.trim() || input.fallbackName?.trim() || 'ร้านค้า';
  return {
    shopId: shop?.id ?? '',
    slug: shop?.slug ?? shop?.id ?? '',
    displayName,
    avatarUrl: shop?.avatarUrl ?? null,
    isOwner: Boolean(shop?.id && input.currentShopId && shop.id === input.currentShopId),
  };
}
