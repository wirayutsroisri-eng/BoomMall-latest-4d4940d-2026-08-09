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
import { prepareBundleForServer } from './uploadProductMedia';
import {
  isCommerceRequestError,
  isRetryableCommerceError,
  type CommerceRequestKind,
} from '@/modules/commerce/domain/commerceRequest';

type SyncOperation = 'pull' | 'upsert' | 'delete' | 'event';
type SyncErrorHandler = (input: {
  operation: SyncOperation;
  message: string;
  kind?: CommerceRequestKind;
}) => void;

let syncErrorHandler: SyncErrorHandler | null = null;
let lastErrorKey = '';
let lastErrorAt = 0;

export function setCommerceSyncErrorHandler(handler: SyncErrorHandler | null) {
  syncErrorHandler = handler;
}

function reportSyncError(operation: SyncOperation, error: unknown) {
  const message = error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
  const kind = isCommerceRequestError(error) ? error.kind : undefined;
  const key = `${operation}:${message}`;
  const now = Date.now();
  if (key === lastErrorKey && now - lastErrorAt < 30_000) return;
  lastErrorKey = key;
  lastErrorAt = now;
  // A temporary network/server restart must not trigger React Native LogBox.
  // The user-facing handler still reports a failure after retries are exhausted.
  console.warn(`[COMMERCE_SYNC:${operation}]`, error);
  syncErrorHandler?.({ operation, message, kind });
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

/**
 * After a successful upsert the server is authoritative and returns canonical
 * object-storage URLs. Mirror them into the local store so:
 *  - the next edit does not re-upload the same images, and
 *  - the running UI keeps working from the same source of truth as the DB.
 */
function adoptServerMedia(bundle: CatalogBundle) {
  const product = bundle.product as MasterSku;
  const variants = bundle.variants as SkuVariant[];
  useInventoryStore.setState((s) => {
    const byVariantId = new Map(variants.map((v) => [v.id, v] as const));
    return {
      masters: s.masters.map((m) =>
        m.id === product.id
          ? {
              ...m,
              media: product.media ?? m.media,
              specImages: product.specImages ?? m.specImages,
              usageImages: product.usageImages ?? m.usageImages,
              imageUri: product.imageUri ?? m.imageUri,
              imageUris: product.imageUris ?? m.imageUris,
            }
          : m,
      ),
      variants: s.variants.map((v) =>
        byVariantId.has(v.id)
          ? { ...v, imageUri: byVariantId.get(v.id)!.imageUri ?? v.imageUri }
          : v,
      ),
    };
  });
}

const PULL_RETRY_MAX = 3;
let pullInFlight: Promise<void> | null = null;

/** Pull never clears cached inventory just because one refresh request failed. */
export function pullCommerceCatalog(): Promise<void> {
  // Prevent duplicate in-flight requests (8s interval + manual refresh + focus).
  if (pullInFlight) return pullInFlight;
  pullInFlight = runPullCommerceCatalog().finally(() => {
    pullInFlight = null;
  });
  return pullInFlight;
}

async function runPullCommerceCatalog() {
  const auth = useAuthStore.getState();
  const shopId = auth.user?.shopId?.trim();
  if (!auth.sessionToken || !shopId) {
    applyBundles([]);
    return;
  }
  let lastError: unknown;
  for (let attempt = 0; attempt < PULL_RETRY_MAX; attempt += 1) {
    try {
      const remote = await fetchCommerceCatalog(shopId);
      // Pull is one-way server → device. Products are uploaded only from an
      // explicit create/edit action, never merely because they exist in cache.
      applyBundles(remote.data ?? []);
      return;
    } catch (error) {
      lastError = error;
      // Retry only network/timeout/server (5xx). Never loop on 4xx or parse errors.
      if (!isRetryableCommerceError(error)) break;
      if (attempt < PULL_RETRY_MAX - 1) await wait(350 * (attempt + 1));
    }
  }
  reportSyncError('pull', lastError);
}

const pushing = new Set<string>();
const queuedPush = new Set<string>();

/**
 * Upload local media → object storage, then PUT the product. Only one network
 * request per master at a time; edits made while a push is in-flight are queued
 * and re-pushed with the latest store state (no lost updates, no duplicates).
 */
export async function pushCommerceProduct(masterId: string) {
  if (pushing.has(masterId)) {
    queuedPush.add(masterId);
    return;
  }
  const bundle = bundleOf(masterId);
  if (!bundle) return;
  pushing.add(masterId);
  try {
    const remoteBundle = await prepareBundleForServer(bundle);
    const saved = await upsertCommerceProduct(remoteBundle);
    if (saved?.data) adoptServerMedia(saved.data);
  } catch (error) {
    reportSyncError('upsert', error);
  } finally {
    pushing.delete(masterId);
    if (queuedPush.delete(masterId)) void pushCommerceProduct(masterId);
  }
}

const deleting = new Set<string>();

export function pushCommerceDelete(masterId: string) {
  if (deleting.has(masterId)) return;
  deleting.add(masterId);
  void deleteCommerceProduct(masterId)
    .catch((error: unknown) => reportSyncError('delete', error))
    .finally(() => deleting.delete(masterId));
}

export function trackCommerceEvent(name: string, entityType?: string, entityId?: string) {
  void recordCommerceEvent({ name, entityType, entityId }).catch((error: unknown) =>
    reportSyncError('event', error),
  );
}
