import type { MetadataRoute } from 'next';
import { fetchCatalogProducts, fetchShopDirectory } from '@/lib/api';
import { productWebUrl, shopWebUrl } from '@/lib/canonical';

// Rendered per-request (not at build time): the backend base URL and its data
// are only known at runtime, and the build must not fail if the backend is
// unreachable while building. The backend's own cursor pages already cache
// for 60s (lib/api.ts); `revalidate` caps how often we re-walk the catalog.
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const PAGE_SIZE = 60;
// Both browse endpoints use keyset (cursor) pagination for correctness under
// concurrent writes at scale — see backend/src/lib/cursorPagination.ts. That
// makes "jump to page N" impossible, so a single sitemap has to walk pages
// sequentially from the start. These caps keep that walk (and the resulting
// file) bounded and well under the 50,000-URL/sitemap limit. Once the real
// catalog outgrows this, the correct next step is a sitemap *index* built by
// a scheduled job that persists cursor checkpoints — not naive chunking,
// which cursor pagination can't support without re-walking every time.
const MAX_SHOPS = 2000;
const MAX_PRODUCTS = 5000;

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? '';
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: siteUrl() || '/', changeFrequency: 'daily', priority: 1 },
  ];

  let cursor: string | undefined;
  let shopCount = 0;
  do {
    const page = await fetchShopDirectory({ cursor, limit: PAGE_SIZE });
    if (!page) break;
    for (const shop of page.items) {
      entries.push({ url: shopWebUrl(shop.slug), changeFrequency: 'daily', priority: 0.7 });
    }
    shopCount += page.items.length;
    cursor = page.nextCursor ?? undefined;
  } while (cursor && shopCount < MAX_SHOPS);

  cursor = undefined;
  let productCount = 0;
  do {
    const page = await fetchCatalogProducts({ cursor, limit: PAGE_SIZE, sort: 'newest' });
    if (!page) break;
    for (const bundle of page.items) {
      if (!bundle.shop) continue;
      entries.push({
        url: productWebUrl(bundle.shop.slug, bundle.product.slug ?? bundle.product.id),
        changeFrequency: 'daily',
        priority: 0.5,
      });
    }
    productCount += page.items.length;
    cursor = page.nextCursor ?? undefined;
  } while (cursor && productCount < MAX_PRODUCTS);

  return entries;
}
