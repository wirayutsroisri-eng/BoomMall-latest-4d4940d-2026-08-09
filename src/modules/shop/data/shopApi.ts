import { getApiBase, useAuthStore } from '@/modules/auth/state/auth-store';
import type { ShopInfo } from '@/modules/shop/domain/shopInfo';
import type { CatalogBundle } from '@/modules/commerce/data/commerceApi';

function headers() {
  const token = useAuthStore.getState().sessionToken;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function request<T>(path: string): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${base}${path}`, {
      signal: controller.signal,
      headers: headers(),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json?.ok !== true) {
      const message = json?.error?.message ?? `ร้านค้าไม่พร้อมใช้งาน (${response.status})`;
      throw new Error(message);
    }
    return json.data as T;
  } catch (e) {
    if (controller.signal.aborted) throw new Error('เซิร์ฟเวอร์ไม่ตอบสนอง กรุณาลองใหม่');
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

/** Public shop identity — resolves by merchantId OR canonical slug/handle. */
export function fetchShop(shopKey: string) {
  return request<ShopInfo>(`/api/v1/shops/${encodeURIComponent(shopKey)}`);
}

export type ShopStorefrontResult = {
  shop: ShopInfo;
  products: CatalogBundle[];
};

/** ACTIVE products of a shop (works for any user's shop, not only the signed-in shop). */
export function fetchShopProducts(shopKey: string) {
  return request<ShopStorefrontResult>(`/api/v1/shops/${encodeURIComponent(shopKey)}/products`);
}
