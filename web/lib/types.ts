/**
 * Mirrors the backend DTOs (backend/src/modules/shop/ShopIdentityService.ts,
 * backend/src/modules/ecommerce/CommerceService.ts). Backend stays the single
 * source of truth — keep these in sync by hand, do not fork the shapes.
 */

export type PublicShop = {
  id: string;
  slug: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type ProductMediaItem = {
  uri: string;
  type: 'image' | 'video';
  thumbnailUri?: string;
};

export type ProductVariant = {
  id: string;
  masterSkuId?: string;
  price: number;
};

/** `product` is the raw CommerceProduct payload — loosely typed like the backend's Record<string, unknown>. */
export type CatalogProduct = {
  id: string;
  /** SEO slug, set once at creation. Null for legacy rows — fall back to `id`. */
  slug: string | null;
  title: string;
  basePrice: number;
  currency?: string;
  channel?: 'B2B' | 'B2C' | 'C2C';
  ownerShopId?: string;
  shopName?: string;
  description?: string;
  media?: ProductMediaItem[];
  imageUris?: string[];
  imageUri?: string;
};

export type CatalogBundle = {
  product: CatalogProduct;
  variants: ProductVariant[];
  shop?: PublicShop | null;
};

export type ShopStorefrontResult = {
  shop: PublicShop;
  products: CatalogBundle[];
};

export type PublicCatalogSort = 'newest' | 'price_asc' | 'price_desc';

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};
