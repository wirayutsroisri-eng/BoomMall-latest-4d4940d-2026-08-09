import type { MasterSku, SkuVariant, WarehouseStock } from '@/modules/commerce/domain/types';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import {
  deleteCommerceProduct,
  fetchCommerceCatalog,
  recordCommerceEvent,
  upsertCommerceProduct,
  type CatalogBundle,
} from './commerceApi';

type SyncOperation = 'pull' | 'upsert' | 'delete' | 'event';
type SyncErrorHandler = (input: { operation: SyncOperation; message: string }) => void;

let syncErrorHandler: SyncErrorHandler | null = null;
let lastErrorKey = '';
let lastErrorAt = 0;

export function setCommerceSyncErrorHandler(handler: SyncErrorHandler | null) {
  syncErrorHandler = handler;
}

function reportSyncError(operation: SyncOperation, error: unknown) {
  const message = error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
  const key = `${operation}:${message}`;
  const now = Date.now();
  if (key === lastErrorKey && now - lastErrorAt < 30_000) return;
  lastErrorKey = key;
  lastErrorAt = now;
  // A temporary network/server restart must not trigger React Native LogBox.
  // The user-facing handler still reports a failure after retries are exhausted.
  console.warn(`[COMMERCE_SYNC:${operation}]`, error);
  syncErrorHandler?.({ operation, message });
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function bundleOf(masterId: string): CatalogBundle | null {
  const { masters, variants, stockByKey } = useInventoryStore.getState();
  const product = masters.find((m) => m.id === masterId);
  if (!product) return null;
  const skus = variants.filter((v) => v.masterSkuId === masterId);
  const ids = new Set(skus.map((v) => v.id));
  const stock = Object.values(stockByKey).filter((row) => ids.has(row.variantId));
  return { product, variants: skus, stock };
}

function applyBundles(bundles: CatalogBundle[]) {
  useInventoryStore.getState().hydrateFromServer({
    masters: bundles.map((b) => b.product as MasterSku),
    variants: bundles.flatMap((b) => b.variants as SkuVariant[]),
    stock: bundles.flatMap((b) => b.stock as WarehouseStock[]),
  });
}

export async function pullCommerceCatalog() {
  const auth = useAuthStore.getState();
  const shopId = auth.user?.shopId?.trim();
  if (!auth.sessionToken || !shopId) {
    applyBundles([]);
    return;
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const remote = await fetchCommerceCatalog(shopId);
      // Pull is one-way server → device. Products are uploaded only from an
      // explicit create/edit action, never merely because they exist in cache.
      applyBundles(remote.data ?? []);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await wait(350 * (attempt + 1));
    }
  }
  reportSyncError('pull', lastError);
}

export function pushCommerceProduct(masterId: string) {
  const bundle = bundleOf(masterId);
  if (!bundle) return;
  void upsertCommerceProduct(bundle).catch((error: unknown) => reportSyncError('upsert', error));
}

export function pushCommerceDelete(masterId: string) {
  void deleteCommerceProduct(masterId).catch((error: unknown) => reportSyncError('delete', error));
}

export function trackCommerceEvent(name: string, entityType?: string, entityId?: string) {
  void recordCommerceEvent({ name, entityType, entityId }).catch((error: unknown) =>
    reportSyncError('event', error),
  );
}
