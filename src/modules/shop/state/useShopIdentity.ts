import { useMemo } from 'react';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import type { ShopInfo } from '@/modules/shop/domain/shopInfo';
import {
  buildShopIdentity,
  type ShopIdentity,
} from '@/modules/shop/domain/shop-identity';

/**
 * Shop identity for the currently viewed shop.
 *
 * V2 rule: identity fields (displayName/avatar/slug) are taken from the Backend
 * `ShopInfo` object resolved by the screen. The Auth store contributes ONLY the
 * signed-in shop id used to decide `isOwner` — never the displayed identity.
 *
 * `fallbackName` is an offline/degraded label from the synced product row only.
 */
export function useShopIdentity(
  shop: ShopInfo | null | undefined,
  fallbackName?: string | null,
): ShopIdentity {
  const currentShopId = useAuthStore((s) => s.user?.shopId ?? '');
  return useMemo(
    () =>
      buildShopIdentity({
        shop: shop ?? null,
        fallbackName,
        currentShopId: currentShopId || null,
      }),
    [shop, fallbackName, currentShopId],
  );
}

