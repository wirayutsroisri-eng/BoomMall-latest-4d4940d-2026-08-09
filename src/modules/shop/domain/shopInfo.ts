/**
 * Public shop identity as returned by the Backend Shop Identity API.
 * Source of truth: UserProfile(s) — never built from the signed-in auth profile.
 */
export type ShopInfo = {
  /** merchantId / UserProfile.shopId */
  id: string;
  /** canonical URL-safe slug (handle without "@", or shopId when no handle). */
  slug: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function shopDisplayName(shop: ShopInfo | null | undefined, fallbackName?: string | null) {
  return shop?.displayName?.trim() || fallbackName?.trim() || '';
}

export function shopInitial(name: string) {
  const first = [...(name.trim() || 'ร้านค้า')][0];
  return (first ?? 'ร้านค้า').toUpperCase();
}
