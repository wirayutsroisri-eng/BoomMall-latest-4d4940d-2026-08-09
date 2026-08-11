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
  buildAddedVariant,
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
  UpdateProductInput,
  UpdateProductResult,
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
  /** เพิ่มรุ่นใต้สินค้าเดิม — Backend สร้าง SKU อัตโนมัติ */
  addVariantToMaster: (
    masterId: string,
    input: {
      label: string;
      price: number;
      onHand: number;
      warehouseId?: WarehouseId;
      sku?: string;
    },
  ) => string | null;
  /** สร้างแถวสต็อก 0 ถ้ายังไม่มี (ไม่แตะ reserved/ledger) */
  ensureStockRow: (variantId: string, warehouseId: WarehouseId) => void;
  /**
   * Quick inline edit จากคลังสินค้า — อัปเดตชื่อ / ราคาทุกรุ่น / ยอดขายได้รวม
   * โดยไม่ต้องเปิดหน้าแก้ไขเต็ม
   */
  quickUpdateProduct: (
    masterId: string,
    patch: { title?: string; price?: number; availableTotal?: number },
  ) => { ok: true } | { ok: false; reason: string };
  /** Full product edit — validates SKU/barcode uniqueness and applies stock delta */
  updateProduct: (masterId: string, patch: UpdateProductInput) => UpdateProductResult;
  /** Soft-delete product + variants + stock rows owned by this master */
  deleteProduct: (masterId: string) => UpdateProductResult;
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

        addVariantToMaster: (masterId, input) => {
          const master = get().masters.find((m) => m.id === masterId);
          if (!master) return null;
          lock();
          const now = Date.now();
          const warehouseId = input.warehouseId ?? 'WH-CTI-MAIN';
          const built = buildAddedVariant(
            master,
            {
              label: input.label,
              price: input.price,
              onHand: input.onHand,
              warehouseId,
              sku: input.sku,
            },
            now,
          );
          const key = stockKey(built.variant.id, built.stockRow.warehouseId);
          set((s) => ({
            masters: s.masters.map((m) => (m.id === masterId ? built.nextMaster : m)),
            variants: [built.variant, ...s.variants],
            stockByKey: { ...s.stockByKey, [key]: built.stockRow },
          }));
          if (built.ledgerDraft) journal([built.ledgerDraft]);
          return built.variant.id;
        },

        ensureStockRow: (variantId, warehouseId) => {
          const key = stockKey(variantId, warehouseId);
          if (get().stockByKey[key]) return;
          set((s) => ({
            stockByKey: {
              ...s.stockByKey,
              [key]: {
                variantId,
                warehouseId,
                onHand: 0,
                reserved: 0,
                revision: 1,
              },
            },
          }));
        },

        quickUpdateProduct: (masterId, patch) => {
          const master = get().masters.find((m) => m.id === masterId);
          if (!master) return { ok: false, reason: 'ไม่พบสินค้า' };

          const nextTitle = patch.title != null ? patch.title.trim() : undefined;
          if (nextTitle !== undefined && !nextTitle) {
            return { ok: false, reason: 'กรุณาใส่ชื่อสินค้า' };
          }
          if (patch.price != null && (!Number.isFinite(patch.price) || patch.price < 0)) {
            return { ok: false, reason: 'ราคาไม่ถูกต้อง' };
          }
          if (
            patch.availableTotal != null &&
            (!Number.isFinite(patch.availableTotal) || patch.availableTotal < 0)
          ) {
            return { ok: false, reason: 'จำนวนสต็อกไม่ถูกต้อง' };
          }

          lock();

          if (nextTitle !== undefined || patch.price != null) {
            set((s) => ({
              masters: s.masters.map((m) =>
                m.id === masterId
                  ? {
                      ...m,
                      ...(nextTitle !== undefined ? { title: nextTitle } : {}),
                      ...(patch.price != null ? { basePrice: Math.round(patch.price) } : {}),
                    }
                  : m,
              ),
              variants:
                patch.price != null
                  ? s.variants.map((v) =>
                      v.masterSkuId === masterId
                        ? { ...v, price: Math.round(patch.price!) }
                        : v,
                    )
                  : s.variants,
            }));
          }

          if (patch.availableTotal != null) {
            const target = Math.floor(patch.availableTotal);
            const variants = get().variants.filter((v) => v.masterSkuId === masterId);
            if (!variants.length) return { ok: false, reason: 'สินค้ายังไม่มีรุ่น' };

            let current = 0;
            for (const v of variants) current += get().totalAvailable(v.id);
            let delta = target - current;

            if (delta > 0) {
              const primary = variants[0];
              const rows = get().listStockRows(primary.id);
              const row =
                [...rows].sort((a, b) => availableOf(b) - availableOf(a))[0] ??
                (() => {
                  get().ensureStockRow(primary.id, 'WH-CTI-MAIN');
                  return get().stockByKey[stockKey(primary.id, 'WH-CTI-MAIN')];
                })();
              if (!row) return { ok: false, reason: 'ไม่พบแถวสต็อก' };
              const result = get().restock(primary.id, row.warehouseId, delta, 'Quick edit สต็อก');
              if (!result.ok) return { ok: false, reason: 'เพิ่มสต็อกไม่สำเร็จ' };
            } else if (delta < 0) {
              let need = -delta;
              const ranked = [...variants]
                .map((v) => ({
                  v,
                  rows: [...get().listStockRows(v.id)].sort(
                    (a, b) => availableOf(b) - availableOf(a),
                  ),
                }))
                .sort(
                  (a, b) =>
                    b.rows.reduce((s, r) => s + availableOf(r), 0) -
                    a.rows.reduce((s, r) => s + availableOf(r), 0),
                );

              for (const { v, rows } of ranked) {
                for (const row of rows) {
                  const avail = availableOf(row);
                  if (avail <= 0) continue;
                  const take = Math.min(avail, need);
                  const result = get().adjustStock(
                    v.id,
                    row.warehouseId,
                    row.onHand - take,
                    'Quick edit สต็อก',
                  );
                  if (!result.ok) return { ok: false, reason: 'ลดสต็อกไม่สำเร็จ (มียอดจอง)' };
                  need -= take;
                  if (need <= 0) break;
                }
                if (need <= 0) break;
              }
              if (need > 0) {
                return { ok: false, reason: 'ลดสต็อกไม่ครบ — มียอดจองค้างอยู่' };
              }
            }
          }

          return { ok: true };
        },

        updateProduct: (masterId, patch) => {
          const master = get().masters.find((m) => m.id === masterId);
          if (!master) return { ok: false, reason: 'ไม่พบสินค้า', field: 'title' };

          const nextTitle = patch.title != null ? patch.title.trim() : undefined;
          if (nextTitle !== undefined && !nextTitle) {
            return { ok: false, reason: 'กรุณาใส่ชื่อสินค้า', field: 'title' };
          }

          const nextSku = patch.masterSku != null ? patch.masterSku.trim() : undefined;
          if (nextSku !== undefined && !nextSku) {
            return { ok: false, reason: 'กรุณาใส่ SKU', field: 'sku' };
          }
          if (nextSku) {
            const skuTaken = get().masters.some(
              (m) => m.id !== masterId && m.masterSku.toLowerCase() === nextSku.toLowerCase(),
            );
            const variantTaken = get().variants.some(
              (v) =>
                v.masterSkuId !== masterId &&
                v.sku.toLowerCase() === nextSku.toLowerCase(),
            );
            if (skuTaken || variantTaken) {
              return {
                ok: false,
                reason: `SKU "${nextSku}" ถูกใช้แล้ว — เลือกโค้ดอื่น`,
                field: 'sku',
              };
            }
          }

          const nextBarcode =
            patch.barcode === null
              ? ''
              : patch.barcode != null
                ? patch.barcode.trim()
                : undefined;
          if (nextBarcode) {
            const barcodeTaken = get().masters.some(
              (m) =>
                m.id !== masterId &&
                (m.barcode ?? '').trim().toLowerCase() === nextBarcode.toLowerCase(),
            );
            if (barcodeTaken) {
              return {
                ok: false,
                reason: `บาร์โค้ด "${nextBarcode}" ถูกใช้แล้ว`,
                field: 'barcode',
              };
            }
          }

          if (patch.price != null && (!Number.isFinite(patch.price) || patch.price < 0)) {
            return { ok: false, reason: 'ราคาต้องเป็นตัวเลข 0 ขึ้นไป', field: 'price' };
          }
          if (patch.cost != null && (!Number.isFinite(patch.cost) || patch.cost < 0)) {
            return { ok: false, reason: 'ต้นทุนต้องเป็นตัวเลข 0 ขึ้นไป', field: 'cost' };
          }
          if (
            patch.availableTotal != null &&
            (!Number.isFinite(patch.availableTotal) ||
              patch.availableTotal < 0 ||
              !Number.isInteger(patch.availableTotal))
          ) {
            return {
              ok: false,
              reason: 'จำนวนสต็อกต้องเป็นจำนวนเต็มไม่ติดลบ',
              field: 'stock',
            };
          }

          lock();

          const imageUris =
            patch.imageUris != null
              ? persistProductImages(patch.imageUris, masterId)
              : undefined;

          const siblingVariants = get().variants.filter((v) => v.masterSkuId === masterId);
          const soleVariant = siblingVariants.length === 1;

          set((s) => ({
            masters: s.masters.map((m) => {
              if (m.id !== masterId) return m;
              return {
                ...m,
                ...(nextTitle !== undefined ? { title: nextTitle } : {}),
                ...(nextSku !== undefined ? { masterSku: nextSku } : {}),
                ...(nextBarcode !== undefined
                  ? { barcode: nextBarcode || undefined }
                  : {}),
                ...(patch.categoryKey !== undefined
                  ? { categoryKey: patch.categoryKey || undefined }
                  : {}),
                ...(patch.description !== undefined
                  ? { description: patch.description.trim() || undefined }
                  : {}),
                ...(patch.price != null ? { basePrice: Math.round(patch.price) } : {}),
                ...(patch.customFields !== undefined
                  ? { customFields: patch.customFields }
                  : {}),
                ...(imageUris !== undefined
                  ? { imageUris, imageUri: imageUris[0] }
                  : {}),
              };
            }),
            variants: s.variants.map((v) => {
              if (v.masterSkuId !== masterId) return v;
              return {
                ...v,
                ...(patch.price != null ? { price: Math.round(patch.price) } : {}),
                ...(patch.cost != null ? { cost: Math.round(patch.cost) } : {}),
                ...(nextSku !== undefined && soleVariant ? { sku: `${nextSku}-A` } : {}),
              };
            }),
          }));

          if (patch.availableTotal != null) {
            const stockResult = get().quickUpdateProduct(masterId, {
              availableTotal: patch.availableTotal,
            });
            if (!stockResult.ok) {
              return { ok: false, reason: stockResult.reason, field: 'stock' };
            }
          }

          return { ok: true };
        },

        deleteProduct: (masterId) => {
          const master = get().masters.find((m) => m.id === masterId);
          if (!master) return { ok: false, reason: 'ไม่พบสินค้า' };

          lock();
          const variantIds = new Set(
            get()
              .variants.filter((v) => v.masterSkuId === masterId)
              .map((v) => v.id),
          );

          set((s) => {
            const nextStock: Record<string, WarehouseStock> = {};
            for (const [key, row] of Object.entries(s.stockByKey)) {
              if (!variantIds.has(row.variantId)) nextStock[key] = row;
            }
            return {
              masters: s.masters.filter((m) => m.id !== masterId),
              variants: s.variants.filter((v) => v.masterSkuId !== masterId),
              stockByKey: nextStock,
            };
          });

          return { ok: true };
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
