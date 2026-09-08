import type { CatalogBundle, CursorPage, PublicCatalogSort, PublicShop, ShopStorefrontResult } from './types';

/**
 * Server-side only fetch against BoomMall's public, unauthenticated backend
 * endpoints (backend/src/modules/shop/http/routes.ts,
 * backend/src/modules/ecommerce/http/catalogPublicRoutes.ts). Never call this
 * from client components — it's meant to run in RSC / route handlers so the
 * backend base URL never ships to the browser.
 */
async function backendGet<T>(path: string, revalidateSeconds: number): Promise<T | null> {
  const base = process.env.BACKEND_API_URL;
  if (!base) throw new Error('BACKEND_API_URL is not set');

  const res = await fetch(`${base}${path}`, {
    next: { revalidate: revalidateSeconds },
  });
  if (res.status === 404) return null;

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.ok !== true) {
    if (res.status === 404) return null;
    throw new Error(json?.error?.message ?? `Backend request failed (${res.status}) for ${path}`);
  }
  return json.data as T;
}

/** Public shop identity — resolves by merchantId OR canonical slug/handle. */
export function fetchShop(shopKey: string) {
  return backendGet<PublicShop>(`/api/v1/shops/${encodeURIComponent(shopKey)}`, 60);
}

/** ACTIVE products of a shop. */
export function fetchShopProducts(shopKey: string) {
  return backendGet<ShopStorefrontResult>(`/api/v1/shops/${encodeURIComponent(shopKey)}/products`, 60);
}

/** Public shop directory — cursor pagination, excludes private accounts. */
export function fetchShopDirectory(opts: { cursor?: string; limit?: number; q?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.q) params.set('q', opts.q);
  const qs = params.toString();
  return backendGet<CursorPage<PublicShop>>(`/api/v1/shops${qs ? `?${qs}` : ''}`, 60);
}

/**
 * Cross-shop product browse — GET /api/v1/catalog/products. Cursor
 * pagination + filter + sort; never returns hidden/non-ACTIVE products or
 * products from a private account.
 */
export function fetchCatalogProducts(
  opts: {
    cursor?: string;
    limit?: number;
    q?: string;
    merchantId?: string;
    channel?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: PublicCatalogSort;
  } = {},
) {
  const params = new URLSearchParams();
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.q) params.set('q', opts.q);
  if (opts.merchantId) params.set('merchantId', opts.merchantId);
  if (opts.channel) params.set('channel', opts.channel);
  if (opts.minPrice != null) params.set('minPrice', String(opts.minPrice));
  if (opts.maxPrice != null) params.set('maxPrice', String(opts.maxPrice));
  if (opts.sort) params.set('sort', opts.sort);
  const qs = params.toString();
  return backendGet<CursorPage<CatalogBundle>>(`/api/v1/catalog/products${qs ? `?${qs}` : ''}`, 60);
}

/** Single ACTIVE product by slug OR id — GET /api/v1/catalog/products/:key. */
export function fetchCatalogProduct(key: string) {
  return backendGet<CatalogBundle>(`/api/v1/catalog/products/${encodeURIComponent(key)}`, 60);
}
