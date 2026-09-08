/**
 * Single place that maps a BoomMall entity to:
 *   - its canonical public web URL (SEO-indexable)
 *   - its mobile deep link (must match the RN app's actual expo-router routes,
 *     app/shop/store/[shopKey].tsx and app/shop/product/[id].tsx — scheme
 *     "boommall" from app.json)
 *
 * Both resolve to the same backend entity id/slug. If the RN route paths ever
 * change, update APP_SCHEME paths here too — this is the one place they must
 * stay in sync across Web ↔ Mobile ↔ Backend.
 */

const APP_SCHEME = 'boommall';

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
}

export function shopWebPath(shopSlug: string) {
  return `/shop/${encodeURIComponent(shopSlug)}`;
}

export function shopWebUrl(shopSlug: string) {
  return `${siteUrl()}${shopWebPath(shopSlug)}`;
}

export function shopDeepLink(shopSlug: string) {
  return `${APP_SCHEME}://shop/store/${encodeURIComponent(shopSlug)}`;
}

/** `productKey` should be the product's SEO slug when available, else its id. */
export function productWebPath(shopSlug: string, productKey: string) {
  return `${shopWebPath(shopSlug)}/product/${encodeURIComponent(productKey)}`;
}

export function productWebUrl(shopSlug: string, productKey: string) {
  return `${siteUrl()}${productWebPath(shopSlug, productKey)}`;
}

export function productDeepLink(productId: string) {
  return `${APP_SCHEME}://shop/product/${encodeURIComponent(productId)}`;
}
