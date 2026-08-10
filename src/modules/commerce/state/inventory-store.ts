import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  seedMasterSkus,
  seedVariants,
  seedWarehouseStock,
  externalMasterSkus,
  externalVariants,
  externalWarehouseStock,
  WAREHOUSES,
  DEFAULT_CUSTOM_FIELDS,
} from '../data/catalog';
import { persistProductImages } from '../data/product-media';
import {
  applyAdjust,
  applyCommitSale,
  applyRelease,
  applyReserve,
  applyRestock,
  applyReturn,
  applyTransfer,
  availableOf,
  buildMasterWithVariants,
  type CreateMasterInput,
  type LedgerDraft,
} from '../domain/stock-core';
import type {
  CustomFieldDef,
  MasterSku,
  SkuVariant,
  StockLedgerEntry,
  StockMutationResult,
  WarehouseId,
  WarehouseStock,
} from '../domain/types';

function stockKey(variantId: string, warehouseId: WarehouseId) {
  return `${variantId}::${warehouseId}`;
}

const LEDGER_CAP = 500;
const DEFAULT_ACTOR = 'Boom EV (เจ้าของร้าน)';

type InventoryState = {
  masters: MasterSku[];
  variants: SkuVariant[];
  stockByKey: Record<string, WarehouseStock>;
  customFieldDefs: CustomFieldDef[];
  warehouses: typeof WAREHOUSES;
  /** Audit trail — every stock mutation appends here (newest first) */
  ledger: StockLedgerEntry[];
  /** Serial lock counter — simulates thread-safe queueing on JS event loop */
  _lockEpoch: number;
  available: (variantId: string, warehouseId: WarehouseId) => number;
  totalAvailable: (variantId: string) => number;
  totalReserved: (variantId: string) => number;
  listStockRows: (variantId: string) => WarehouseStock[];
  reserveStock: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
    expectedRevision?: number,
    orderRef?: string,
  ) => StockMutationResult;
  commitSale: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
    orderRef?: string,
  ) => StockMutationResult;
  releaseReservation: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
    orderRef?: string,
  ) => StockMutationResult;
  restock: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
    reason?: string,
    actor?: string,
  ) => StockMutationResult;
  returnStock: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
    orderRef?: string,
  ) => StockMutationResult;
  adjustStock: (
    variantId: string,
    warehouseId: WarehouseId,
    newOnHand: number,
    reason: string,
    actor?: string,
  ) => StockMutationResult;
  transferStock: (
    variantId: string,
    fromWarehouseId: WarehouseId,
    toWarehouseId: WarehouseId,
    qty: number,
    actor?: string,
  ) => StockMutationResult;
  setLowStockThreshold: (variantId: string, threshold: number) => void;
  createMasterWithVariants: (
    input: Omit<CreateMasterInput, 'variants'> & {
      imageUris?: string[];
      variants: CreateMasterInput['variants'];
    },
  ) => string;
  addCustomFieldDef: (def: CustomFieldDef) => void;
};

const allSeedMasters = [...seedMasterSkus, ...externalMasterSkus];
const allSeedVariants = [...seedVariants, ...externalVariants];

const initialStock: Record<string, WarehouseStock> = {};
for (const row of [...seedWarehouseStock, ...externalWarehouseStock]) {
  initialStock[stockKey(row.variantId, row.warehouseId)] = { ...row };
}

type PersistedInventory = Pick<
  InventoryState,
  'masters' | 'variants' | 'stockByKey' | 'customFieldDefs' | 'ledger'
>;

/** Saved rows win; seed rows added later in code are appended so they still show up. */
function mergeById<T extends { id: string }>(seeds: T[], saved: T[]): T[] {
  const savedIds = new Set(saved.map((row) => row.id));
  return [...saved, ...seeds.filter((row) => !savedIds.has(row.id))];
}

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => {
      /** Append a ledger entry with sku code resolved + cap applied. */
      const journal = (drafts: LedgerDraft[], actor?: string) => {
        if (!drafts.length) return;
        const { variants } = get();
        const entries: StockLedgerEntry[] = drafts.map((d, i) => ({
          ...d,
          id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
          sku: variants.find((v) => v.id === d.variantId)?.sku ?? d.variantId,
          actor: d.actor ?? actor ?? DEFAULT_ACTOR,
          at: new Date().toISOString(),
        }));
        set((s) => ({ ledger: [...entries.reverse(), ...s.ledger].slice(0, LEDGER_CAP) }));
      };

      const commitRow = (key: string, next: WarehouseStock) =>
        set((s) => ({ stockByKey: { ...s.stockByKey, [key]: next } }));

      const lock = () => set((s) => ({ _lockEpoch: s._lockEpoch + 1 }));

      return {
        masters: allSeedMasters,
        variants: allSeedVariants,
        stockByKey: initialStock,
        customFieldDefs: DEFAULT_CUSTOM_FIELDS,
        warehouses: WAREHOUSES,
        ledger: [],
        _lockEpoch: 0,

        available: (variantId, warehouseId) => {
          const row = get().stockByKey[stockKey(variantId, warehouseId)];
          return row ? availableOf(row) : 0;
        },

        totalAvailable: (variantId) =>
          Object.values(get().stockByKey)
            .filter((s) => s.variantId === variantId)
            .reduce((sum, s) => sum + availableOf(s), 0),

        totalReserved: (variantId) =>
          Object.values(get().stockByKey)
            .filter((s) => s.variantId === variantId)
            .reduce((sum, s) => sum + s.reserved, 0),

        listStockRows: (variantId) =>
          Object.values(get().stockByKey).filter((s) => s.variantId === variantId),

        reserveStock: (variantId, warehouseId, qty, expectedRevision, orderRef) => {
          lock();
          const key = stockKey(variantId, warehouseId);
          const result = applyReserve(get().stockByKey[key], qty, expectedRevision, orderRef);
          if (!result.ok) return result;
          commitRow(key, result.next);
          journal([result.entry]);
          return { ok: true, revision: result.next.revision, available: availableOf(result.next) };
        },

        commitSale: (variantId, warehouseId, qty, orderRef) => {
          lock();
          const key = stockKey(variantId, warehouseId);
          const result = applyCommitSale(get().stockByKey[key], qty, orderRef);
          if (!result.ok) return result;
          commitRow(key, result.next);
          journal([result.entry]);
          return { ok: true, revision: result.next.revision, available: availableOf(result.next) };
        },

        releaseReservation: (variantId, warehouseId, qty, orderRef) => {
          lock();
          const key = stockKey(variantId, warehouseId);
          const result = applyRelease(get().stockByKey[key], qty, orderRef);
          if (!result.ok) return result;
          commitRow(key, result.next);
          journal([result.entry]);
          return { ok: true, revision: result.next.revision, available: availableOf(result.next) };
        },

        restock: (variantId, warehouseId, qty, reason, actor) => {
          lock();
          const key = stockKey(variantId, warehouseId);
          const result = applyRestock(get().stockByKey[key], qty, reason);
          if (!result.ok) return result;
          commitRow(key, result.next);
          journal([result.entry], actor);
          return { ok: true, revision: result.next.revision, available: availableOf(result.next) };
        },

        returnStock: (variantId, warehouseId, qty, orderRef) => {
          lock();
          const key = stockKey(variantId, warehouseId);
          const result = applyReturn(get().stockByKey[key], qty, orderRef);
          if (!result.ok) return result;
          commitRow(key, result.next);
          journal([result.entry]);
          return { ok: true, revision: result.next.revision, available: availableOf(result.next) };
        },

        adjustStock: (variantId, warehouseId, newOnHand, reason, actor) => {
          lock();
          const key = stockKey(variantId, warehouseId);
          const result = applyAdjust(get().stockByKey[key], newOnHand, reason);
          if (!result.ok) return result;
          commitRow(key, result.next);
          journal([result.entry], actor);
          return { ok: true, revision: result.next.revision, available: availableOf(result.next) };
        },

        transferStock: (variantId, fromWarehouseId, toWarehouseId, qty, actor) => {
          lock();
          const fromKey = stockKey(variantId, fromWarehouseId);
          const toKey = stockKey(variantId, toWarehouseId);
          const result = applyTransfer(
            get().stockByKey[fromKey],
            get().stockByKey[toKey],
            qty,
            toWarehouseId,
            variantId,
          );
          if (!result.ok) return result;
          set((s) => ({
            stockByKey: { ...s.stockByKey, [fromKey]: result.nextFrom, [toKey]: result.nextTo },
          }));
          journal(result.entries, actor);
          return {
            ok: true,
            revision: result.nextFrom.revision,
            available: availableOf(result.nextFrom),
          };
        },

        setLowStockThreshold: (variantId, threshold) =>
          set((s) => ({
            variants: s.variants.map((v) =>
              v.id === variantId ? { ...v, lowStockThreshold: Math.max(0, threshold) } : v,
            ),
          })),

        createMasterWithVariants: (input) => {
          const now = Date.now();
          const imageUris = input.imageUris?.length
            ? persistProductImages(input.imageUris, `ms-${now}`)
            : undefined;
          const bundle = buildMasterWithVariants(input, now, imageUris);

          const stockPatch: Record<string, WarehouseStock> = {};
          for (const row of bundle.stockRows) {
            stockPatch[stockKey(row.variantId, row.warehouseId)] = row;
          }
          set((s) => ({
            masters: [bundle.master, ...s.masters],
            variants: [...bundle.variants, ...s.variants],
            stockByKey: { ...s.stockByKey, ...stockPatch },
          }));
          journal(bundle.ledgerDrafts);
          return bundle.master.id;
        },

        addCustomFieldDef: (def) =>
          set((s) => ({
            customFieldDefs: s.customFieldDefs.some((d) => d.key === def.key)
              ? s.customFieldDefs
              : [...s.customFieldDefs, def],
          })),
      };
    },
    {
      name: 'boommall-inventory-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): PersistedInventory => ({
        masters: state.masters,
        variants: state.variants,
        stockByKey: state.stockByKey,
        customFieldDefs: state.customFieldDefs,
        ledger: state.ledger,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedInventory>;
        return {
          ...current,
          masters: saved.masters ? mergeById(current.masters, saved.masters) : current.masters,
          variants: saved.variants
            ? mergeById(current.variants, saved.variants)
            : current.variants,
          stockByKey: saved.stockByKey
            ? { ...current.stockByKey, ...saved.stockByKey }
            : current.stockByKey,
          ledger: saved.ledger ?? current.ledger,
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
