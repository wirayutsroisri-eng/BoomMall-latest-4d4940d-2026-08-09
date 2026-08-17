import type { MasterSku, SkuVariant, WarehouseStock } from '@/modules/commerce/domain/types';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import {
  deleteCommerceProduct,
  fetchCommerceCatalog,
  recordCommerceEvent,
  syncCommerceCatalog,
  upsertCommerceProduct,
  type CatalogBundle,
} from './commerceApi';

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
  try {
    const remote = await fetchCommerceCatalog();
    const remoteIds = new Set((remote.data ?? []).map((b) => String(b.product.id)));
    if (remote.data?.length) applyBundles(remote.data);
    const localOnly = useInventoryStore
      .getState()
      .masters.filter((m) => !remoteIds.has(m.id))
      .map((m) => bundleOf(m.id))
      .filter((b): b is CatalogBundle => Boolean(b));
    if (localOnly.length) {
      await syncCommerceCatalog(localOnly).catch(() => undefined);
    }
  } catch {
    /* offline — keep local warehouse */
  }
}

export function pushCommerceProduct(masterId: string) {
  const bundle = bundleOf(masterId);
  if (!bundle) return;
  void upsertCommerceProduct(bundle).catch(() => undefined);
}

export function pushCommerceDelete(masterId: string) {
  void deleteCommerceProduct(masterId).catch(() => undefined);
}

export function trackCommerceEvent(name: string, entityType?: string, entityId?: string) {
  void recordCommerceEvent({ name, entityType, entityId }).catch(() => undefined);
}
