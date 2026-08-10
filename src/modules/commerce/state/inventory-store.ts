import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  seedMasterSkus,
  seedVariants,
  seedWarehouseStock,
  WAREHOUSES,
  DEFAULT_CUSTOM_FIELDS,
} from '../data/catalog';
import { persistProductImages } from '../data/product-media';
import type {
  CustomFieldDef,
  CustomFieldValue,
  MasterSku,
  SkuVariant,
  StockMutationResult,
  WarehouseId,
  WarehouseStock,
} from '../domain/types';

function stockKey(variantId: string, warehouseId: WarehouseId) {
  return `${variantId}::${warehouseId}`;
}

type InventoryState = {
  masters: MasterSku[];
  variants: SkuVariant[];
  stockByKey: Record<string, WarehouseStock>;
  customFieldDefs: CustomFieldDef[];
  warehouses: typeof WAREHOUSES;
  /** Serial lock counter — simulates thread-safe queueing on JS event loop */
  _lockEpoch: number;
  available: (variantId: string, warehouseId: WarehouseId) => number;
  totalAvailable: (variantId: string) => number;
  listStockRows: (variantId: string) => WarehouseStock[];
  reserveStock: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
    expectedRevision?: number,
  ) => StockMutationResult;
  commitSale: (variantId: string, warehouseId: WarehouseId, qty: number) => StockMutationResult;
  releaseReservation: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
  ) => StockMutationResult;
  restock: (variantId: string, warehouseId: WarehouseId, qty: number) => StockMutationResult;
  createMasterWithVariants: (input: {
    title: string;
    masterSku: string;
    channel: MasterSku['channel'];
    basePrice: number;
    tags: string[];
    customFields: CustomFieldValue[];
    /** Free-text description shown on product detail */
    description?: string;
    /** Picked image URIs (will be copied to permanent storage) */
    imageUris?: string[];
    variants: Array<{
      label: string;
      sku: string;
      price: number;
      attrs: SkuVariant['attrs'];
      warehouseId: WarehouseId;
      onHand: number;
    }>;
  }) => string;
  addCustomFieldDef: (def: CustomFieldDef) => void;
};

const initialStock: Record<string, WarehouseStock> = {};
for (const row of seedWarehouseStock) {
  initialStock[stockKey(row.variantId, row.warehouseId)] = { ...row };
}

type PersistedInventory = Pick<
  InventoryState,
  'masters' | 'variants' | 'stockByKey' | 'customFieldDefs'
>;

/** Saved rows win; seed rows added later in code are appended so they still show up. */
function mergeById<T extends { id: string }>(seeds: T[], saved: T[]): T[] {
  const savedIds = new Set(saved.map((row) => row.id));
  return [...saved, ...seeds.filter((row) => !savedIds.has(row.id))];
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      masters: seedMasterSkus,
      variants: seedVariants,
      stockByKey: initialStock,
      customFieldDefs: DEFAULT_CUSTOM_FIELDS,
      warehouses: WAREHOUSES,
      _lockEpoch: 0,

      available: (variantId, warehouseId) => {
        const row = get().stockByKey[stockKey(variantId, warehouseId)];
        if (!row) return 0;
        return Math.max(0, row.onHand - row.reserved);
      },

      totalAvailable: (variantId) => {
        const { stockByKey } = get();
        return Object.values(stockByKey)
          .filter((s) => s.variantId === variantId)
          .reduce((sum, s) => sum + Math.max(0, s.onHand - s.reserved), 0);
      },

      listStockRows: (variantId) =>
        Object.values(get().stockByKey).filter((s) => s.variantId === variantId),

      reserveStock: (variantId, warehouseId, qty, expectedRevision) => {
        // Acquire serial lock epoch (single-threaded JS = atomic within tick)
        set((s) => ({ _lockEpoch: s._lockEpoch + 1 }));
        const key = stockKey(variantId, warehouseId);
        const row = get().stockByKey[key];
        if (!row) return { ok: false, reason: 'NOT_FOUND' };
        if (expectedRevision != null && row.revision !== expectedRevision) {
          return { ok: false, reason: 'STALE_REVISION' };
        }
        const available = row.onHand - row.reserved;
        if (qty > available) return { ok: false, reason: 'INSUFFICIENT' };

        const next: WarehouseStock = {
          ...row,
          reserved: row.reserved + qty,
          revision: row.revision + 1,
        };
        set((s) => ({ stockByKey: { ...s.stockByKey, [key]: next } }));
        return { ok: true, revision: next.revision, available: next.onHand - next.reserved };
      },

      commitSale: (variantId, warehouseId, qty) => {
        set((s) => ({ _lockEpoch: s._lockEpoch + 1 }));
        const key = stockKey(variantId, warehouseId);
        const row = get().stockByKey[key];
        if (!row) return { ok: false, reason: 'NOT_FOUND' };
        if (row.reserved < qty || row.onHand < qty) {
          return { ok: false, reason: 'INSUFFICIENT' };
        }
        const next: WarehouseStock = {
          ...row,
          onHand: row.onHand - qty,
          reserved: row.reserved - qty,
          revision: row.revision + 1,
        };
        set((s) => ({ stockByKey: { ...s.stockByKey, [key]: next } }));
        return { ok: true, revision: next.revision, available: next.onHand - next.reserved };
      },

      releaseReservation: (variantId, warehouseId, qty) => {
        set((s) => ({ _lockEpoch: s._lockEpoch + 1 }));
        const key = stockKey(variantId, warehouseId);
        const row = get().stockByKey[key];
        if (!row) return { ok: false, reason: 'NOT_FOUND' };
        const next: WarehouseStock = {
          ...row,
          reserved: Math.max(0, row.reserved - qty),
          revision: row.revision + 1,
        };
        set((s) => ({ stockByKey: { ...s.stockByKey, [key]: next } }));
        return { ok: true, revision: next.revision, available: next.onHand - next.reserved };
      },

      restock: (variantId, warehouseId, qty) => {
        set((s) => ({ _lockEpoch: s._lockEpoch + 1 }));
        const key = stockKey(variantId, warehouseId);
        const row = get().stockByKey[key];
        if (!row) return { ok: false, reason: 'NOT_FOUND' };
        const next: WarehouseStock = {
          ...row,
          onHand: row.onHand + qty,
          revision: row.revision + 1,
        };
        set((s) => ({ stockByKey: { ...s.stockByKey, [key]: next } }));
        return { ok: true, revision: next.revision, available: next.onHand - next.reserved };
      },

      createMasterWithVariants: (input) => {
        const masterId = `ms-${Date.now()}`;
        const imageUris = input.imageUris?.length
          ? persistProductImages(input.imageUris, masterId)
          : undefined;
        const variantIds: string[] = [];
        const newVariants: SkuVariant[] = [];
        const stockPatch: Record<string, WarehouseStock> = {};

        input.variants.forEach((v, index) => {
          const id = `sv-${Date.now()}-${index}`;
          variantIds.push(id);
          newVariants.push({
            id,
            masterSkuId: masterId,
            sku: v.sku,
            label: v.label,
            attrs: v.attrs,
            price: v.price,
          });
          stockPatch[stockKey(id, v.warehouseId)] = {
            variantId: id,
            warehouseId: v.warehouseId,
            onHand: v.onHand,
            reserved: 0,
            revision: 1,
          };
        });

        const master: MasterSku = {
          id: masterId,
          masterSku: input.masterSku,
          title: input.title,
          brand: 'Boom EV',
          shopName: 'Boom EV Shop Chanthaburi',
          channel: input.channel,
          basePrice: input.basePrice,
          currency: 'THB',
          tags: input.tags,
          customFields: input.customFields,
          variantIds,
          description: input.description?.trim() || undefined,
          imageUri: imageUris?.[0],
          imageUris,
          createdAt: new Date().toISOString(),
        };

        set((s) => ({
          masters: [master, ...s.masters],
          variants: [...newVariants, ...s.variants],
          stockByKey: { ...s.stockByKey, ...stockPatch },
        }));

        return masterId;
      },

      addCustomFieldDef: (def) =>
        set((s) => ({
          customFieldDefs: s.customFieldDefs.some((d) => d.key === def.key)
            ? s.customFieldDefs
            : [...s.customFieldDefs, def],
        })),
    }),
    {
      name: 'boommall-inventory-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): PersistedInventory => ({
        masters: state.masters,
        variants: state.variants,
        stockByKey: state.stockByKey,
        customFieldDefs: state.customFieldDefs,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedInventory>;
        return {
          ...current,
          masters: saved.masters ? mergeById(current.masters, saved.masters) : current.masters,
          variants: saved.variants ? mergeById(current.variants, saved.variants) : current.variants,
          stockByKey: saved.stockByKey
            ? { ...current.stockByKey, ...saved.stockByKey }
            : current.stockByKey,
          customFieldDefs: saved.customFieldDefs
            ? [
                ...saved.customFieldDefs,
                ...current.customFieldDefs.filter(
                  (def) => !saved.customFieldDefs!.some((d) => d.key === def.key),
                ),
              ]
            : current.customFieldDefs,
        };
      },
    },
  ),
);
