import { getCatalogBundle, listCatalogBundles, type CatalogBundle, type StockRow } from '../../ecommerce/CommerceService';
import { AppError } from '../../../lib/errors';
import { persistChatMessage } from './ChatService';
import type { ChatMessageDto } from '../types';

export type ChatProductCardDto = {
  id: string;
  variantId?: string;
  title: string;
  sku: string;
  price: number;
  currency: 'THB';
  imageUri?: string;
  shopName?: string;
  shopId?: string;
  soldCount?: number;
  shippingHint?: string;
  returnHint?: string;
  stock?: number;
};

export type ChatCatalogItemDto = {
  productId: string;
  variantId: string;
  title: string;
  sku: string;
  label: string;
  price: number;
  currency: 'THB';
  imageUri?: string;
  shopName?: string;
  shopId: string;
  stock: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function imageOf(product: Record<string, unknown>, variant: Record<string, unknown>) {
  const fromVariant = str(variant.imageUri);
  if (fromVariant) return fromVariant;
  const fromProduct = str(product.imageUri);
  if (fromProduct) return fromProduct;
  const media = Array.isArray(product.media) ? product.media : [];
  for (const item of media) {
    const uri = str(asRecord(item).uri);
    if (uri) return uri;
  }
  const uris = Array.isArray(product.imageUris) ? product.imageUris : [];
  for (const item of uris) {
    const uri = str(item);
    if (uri) return uri;
  }
  return undefined;
}

function availableStock(stock: StockRow[], variantId: string) {
  return stock
    .filter((row) => row.variantId === variantId)
    .reduce((sum, row) => sum + Math.max(0, (row.onHand ?? 0) - (row.reserved ?? 0)), 0);
}

export function sanitizeProductCard(raw: unknown): ChatProductCardDto | null {
  const row = asRecord(raw);
  const id = str(row.id);
  const title = str(row.title);
  if (!id || !title) return null;
  const price = Math.max(0, Math.round(num(row.price)));
  return {
    id,
    variantId: str(row.variantId) || undefined,
    title,
    sku: str(row.sku) || id,
    price,
    currency: 'THB',
    imageUri: str(row.imageUri) || str(row.imageUrl) || undefined,
    shopName: str(row.shopName) || undefined,
    shopId: str(row.shopId) || undefined,
    soldCount: num(row.soldCount) || undefined,
    shippingHint: str(row.shippingHint) || 'ส่งด่วน · คาดส่งภายใน 5 ชม.',
    returnHint: str(row.returnHint) || 'คืนได้ใน 7 วัน · คืนเงินเร็ว',
    stock: row.stock == null ? undefined : num(row.stock),
  };
}

export function normalizeChatMetadata(raw?: Record<string, unknown>): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.kind === 'product') {
    const product = sanitizeProductCard(raw.product);
    return product ? { kind: 'product', product } : {};
  }
  return raw;
}

function cardFromBundle(
  bundle: CatalogBundle,
  variantId?: string,
  sku?: string,
): ChatProductCardDto | null {
  const product = asRecord(bundle.product);
  const productId = str(product.id);
  const title = str(product.title);
  if (!productId || !title) return null;

  const variants = Array.isArray(bundle.variants) ? bundle.variants.map(asRecord) : [];
  const wantedVariant = str(variantId);
  const wantedSku = str(sku);
  const variant =
    variants.find((row) => str(row.id) === wantedVariant) ??
    variants.find((row) => str(row.sku) === wantedSku) ??
    variants.find((row) => str(row.status) !== 'hidden') ??
    variants[0];
  if (!variant) return null;

  const id = str(variant.id);
  const price = Math.max(0, Math.round(num(variant.price)));
  return {
    id: productId,
    variantId: id || undefined,
    title,
    sku: str(variant.sku) || productId,
    price,
    currency: 'THB',
    imageUri: imageOf(product, variant),
    shopName: str(product.shopName) || undefined,
    shopId: str(product.ownerShopId) || undefined,
    shippingHint: 'ส่งด่วน · คาดส่งภายใน 5 ชม.',
    returnHint: 'คืนได้ใน 7 วัน · คืนเงินเร็ว',
    stock: availableStock(bundle.stock ?? [], id),
  };
}

function itemsFromBundle(bundle: CatalogBundle): ChatCatalogItemDto[] {
  const product = asRecord(bundle.product);
  const productId = str(product.id);
  const title = str(product.title);
  const shopId = str(product.ownerShopId) || str(product.shopName);
  if (!productId || !title || !shopId) return [];

  return (Array.isArray(bundle.variants) ? bundle.variants : [])
    .map(asRecord)
    .filter((variant) => str(variant.status) !== 'hidden')
    .map((variant) => {
      const variantId = str(variant.id);
      return {
        productId,
        variantId,
        title,
        sku: str(variant.sku) || variantId,
        label: str(variant.label) || str(variant.sku) || title,
        price: Math.max(0, Math.round(num(variant.price))),
        currency: 'THB' as const,
        imageUri: imageOf(product, variant),
        shopName: str(product.shopName) || undefined,
        shopId,
        stock: availableStock(bundle.stock ?? [], variantId),
      };
    })
    .filter((row) => row.variantId);
}

export async function listChatCatalog(shopId: string): Promise<ChatCatalogItemDto[]> {
  const merchantId = shopId.trim();
  if (!merchantId) return [];
  try {
    const bundles = await listCatalogBundles({ merchantId, limit: 200 });
    return bundles.flatMap(itemsFromBundle);
  } catch {
    return [];
  }
}

export async function sendWarehouseProductCard(input: {
  conversationId: string;
  senderId: string;
  productId?: string;
  variantId?: string;
  sku?: string;
  clientMsgId?: string;
  fallback?: unknown;
}): Promise<ChatMessageDto> {
  let card: ChatProductCardDto | null = null;
  const productId = str(input.productId);
  if (productId) {
    try {
      const bundle = await getCatalogBundle(productId);
      if (bundle) card = cardFromBundle(bundle, input.variantId, input.sku);
    } catch {
      card = null;
    }
  }
  if (!card) card = sanitizeProductCard(input.fallback);
  if (!card) throw new AppError('NOT_FOUND', 'product not in warehouse', 404);

  return persistChatMessage({
    conversationId: input.conversationId,
    senderId: input.senderId,
    body: `📦 ${card.title}`,
    clientMsgId: input.clientMsgId,
    type: 'PRODUCT',
    metadata: { kind: 'product', product: card },
  });
}
