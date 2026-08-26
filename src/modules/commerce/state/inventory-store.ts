import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WAREHOUSES, DEFAULT_CUSTOM_FIELDS } from '../data/catalog';
import { persistProductImages, persistProductMedia } from '../data/product-media';
import { firstImageUri, fromLegacyImages, imageUrisOf } from '../domain/product-media';
import {
  applyAdjust,
  applyCommitSale,
  applyDirectSale,
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

type CommerceHooks = {
  onUpsert?: (masterId: string) => void;
  onDelete?: (masterId: string) => void;
};

let commerceHooks: CommerceHooks = {};

export function setCommerceHooks(hooks: CommerceHooks) {
  commerceHooks = hooks;
}

function stockKey(variantId: string, warehouseId: string) {
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
  /** Deduct on-hand at purchase — cart itself never reserves. */
  sellAvailable: (
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
      media?: CreateMasterInput['media'];
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
      imageUri?: string;
      attrs?: SkuVariant['attrs'];
    },
  ) => string | null;
  /** Replace the variant list (label / price / stock) without flattening to one price */
  replaceMasterVariants: (
    masterId: string,
    rows: Array<{
      id?: string;
      label: string;
      price: number;
      stock: number;
      imageUri?: string | null;
      attrs?: SkuVariant['attrs'];
    }>,
  ) => UpdateProductResult;
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
  setProductPromoted: (masterId: string, isPromoted: boolean) => void;
  syncPromotedFromIds: (activeProductIds: string[]) => void;
  addCustomFieldDef: (def: CustomFieldDef) => void;
  hydrateFromServer: (input: {
    masters: MasterSku[];
    variants: SkuVariant[];
    stock: WarehouseStock[];
  }) => void;
};

const initialStock: Record<string, WarehouseStock> = {};

type PersistedInventory = Pick<
  InventoryState,
  'masters' | 'variants' | 'stockByKey' | 'customFieldDefs' | 'ledger'
>;

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
        masters: [],
        variants: [],
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

        sellAvailable: (variantId, warehouseId, qty, orderRef) => {
          lock();
          const key = stockKey(variantId, warehouseId);
          const result = applyDirectSale(get().stockByKey[key], qty, orderRef);
          if (!result.ok) return result;
          commitRow(key, result.next);
          journal([result.entry]);
          const masterId = get().variants.find((v) => v.id === variantId)?.masterSkuId;
          if (masterId) commerceHooks.onUpsert?.(masterId);
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
          const media = persistProductMedia(
            input.media?.length ? input.media : fromLegacyImages(input.imageUris),
            `ms-${now}`,
          );
          const variants = input.variants.map((v, index) => ({
            ...v,
            imageUri: v.imageUri
              ? (persistProductImages([v.imageUri], `ms-${now}-v${index}`)[0] ?? v.imageUri)
              : undefined,
          }));
          const specImages = persistProductMedia(input.specImages ?? [], `ms-${now}-spec`);
          const usageImages = persistProductMedia(input.usageImages ?? [], `ms-${now}-usage`);
          const bundle = buildMasterWithVariants(
            { ...input, variants, media, specImages, usageImages },
            now,
            imageUrisOf(media),
          );

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
          commerceHooks.onUpsert?.(bundle.master.id);
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
              imageUri: input.imageUri
                ? (persistProductImages([input.imageUri], `sv-${now}`)[0] ?? input.imageUri)
                : undefined,
              attrs: input.attrs,
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
          commerceHooks.onUpsert?.(masterId);
          return built.variant.id;
        },

        replaceMasterVariants: (masterId, rows) => {
          const master = get().masters.find((m) => m.id === masterId);
          if (!master) return { ok: false, reason: 'ไม่พบสินค้า' };
          if (!rows.length) {
            return { ok: false, reason: 'เพิ่มอย่างน้อย 1 ตัวเลือกย่อย หรือปิดสวิตช์ตัวเลือกย่อย' };
          }

          for (const row of rows) {
            if (!row.label.trim()) {
              return { ok: false, reason: 'ใส่ชื่อตัวเลือกย่อยทุกใบ' };
            }
            if (!Number.isFinite(row.price) || row.price <= 0) {
              return { ok: false, reason: 'ราคาต้องมากกว่า 0' };
            }
            if (!Number.isInteger(row.stock) || row.stock < 0) {
              return { ok: false, reason: 'สต็อกต้องเป็นจำนวนเต็มไม่ติดลบ' };
            }
          }

          const existing = get().variants.filter((v) => v.masterSkuId === masterId);
          const keep = new Set(rows.map((r) => r.id).filter((id): id is string => Boolean(id)));
          for (const v of existing) {
            if (!keep.has(v.id) && get().totalReserved(v.id) > 0) {
              return { ok: false, reason: `ลบ "${v.label}" ไม่ได้ — มียอดจองค้าง` };
            }
          }

          const removeIds = new Set(
            existing.filter((v) => !keep.has(v.id)).map((v) => v.id),
          );

          lock();

          if (removeIds.size) {
            set((s) => {
              const nextStock: Record<string, WarehouseStock> = {};
              for (const [key, row] of Object.entries(s.stockByKey)) {
                if (!removeIds.has(row.variantId)) nextStock[key] = row;
              }
              return {
                variants: s.variants.filter((v) => !removeIds.has(v.id)),
                stockByKey: nextStock,
                masters: s.masters.map((m) =>
                  m.id === masterId
                    ? { ...m, variantIds: m.variantIds.filter((id) => !removeIds.has(id)) }
                    : m,
                ),
              };
            });
          }

          const prices: number[] = [];
          for (const row of rows) {
            const price = Math.round(row.price);
            prices.push(price);
            const live = get().variants.find((v) => v.id === row.id);
            if (row.id && live) {
              const persistedPhoto = row.imageUri
                ? (persistProductImages([row.imageUri], `${masterId}-${row.id}`)[0] ?? row.imageUri)
                : undefined;
              set((s) => ({
                variants: s.variants.map((v) =>
                  v.id === row.id
                    ? {
                        ...v,
                        label: row.label.trim(),
                        price,
                        status: 'active',
                        ...(persistedPhoto !== undefined ? { imageUri: persistedPhoto } : {}),
                        ...(row.attrs !== undefined ? { attrs: row.attrs } : {}),
                      }
                    : v,
                ),
              }));

              const current = get().totalAvailable(row.id);
              const delta = row.stock - current;
              if (delta === 0) continue;

              const ranked = [...get().listStockRows(row.id)].sort(
                (a, b) => availableOf(b) - availableOf(a),
              );
              const warehouseId = ranked[0]?.warehouseId ?? 'WH-CTI-MAIN';
              if (!ranked.length) get().ensureStockRow(row.id, warehouseId);

              if (delta > 0) {
                const result = get().restock(row.id, warehouseId, delta, 'แก้ตัวเลือกย่อย');
                if (!result.ok) return { ok: false, reason: 'เพิ่มสต็อกไม่สำเร็จ' };
              } else {
                let need = -delta;
                const fresh = [...get().listStockRows(row.id)].sort(
                  (a, b) => availableOf(b) - availableOf(a),
                );
                for (const stockRow of fresh) {
                  const avail = availableOf(stockRow);
                  if (avail <= 0) continue;
                  const take = Math.min(avail, need);
                  const result = get().adjustStock(
                    stockRow.variantId,
                    stockRow.warehouseId,
                    stockRow.onHand - take,
                    'แก้ตัวเลือกย่อย',
                  );
                  if (!result.ok) {
                    return { ok: false, reason: 'ลดสต็อกไม่สำเร็จ (มียอดจอง)' };
                  }
                  need -= take;
                  if (need <= 0) break;
                }
                if (need > 0) {
                  return { ok: false, reason: 'ลดสต็อกไม่ครบ — มียอดจองค้างอยู่' };
                }
              }
            } else {
              const created = get().addVariantToMaster(masterId, {
                label: row.label.trim(),
                price,
                onHand: row.stock,
                imageUri: row.imageUri ?? undefined,
                attrs: row.attrs,
              });
              if (!created) return { ok: false, reason: 'เพิ่มตัวเลือกย่อยไม่สำเร็จ' };
            }
          }

          const minPrice = Math.min(...prices);
          set((s) => ({
            masters: s.masters.map((m) =>
              m.id === masterId ? { ...m, basePrice: minPrice } : m,
            ),
          }));

          commerceHooks.onUpsert?.(masterId);
          return { ok: true };
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

          commerceHooks.onUpsert?.(masterId);
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

          const media =
            patch.media != null
              ? persistProductMedia(patch.media, masterId)
              : patch.imageUris != null
                ? persistProductMedia(fromLegacyImages(patch.imageUris), masterId)
                : undefined;
          const specImages =
            patch.specImages != null
              ? persistProductMedia(patch.specImages, `${masterId}-spec`)
              : undefined;
          const usageImages =
            patch.usageImages != null
              ? persistProductMedia(patch.usageImages, `${masterId}-usage`)
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
                ...(patch.usageGuide !== undefined
                  ? { usageGuide: patch.usageGuide.trim() || undefined }
                  : {}),
                ...(specImages !== undefined
                  ? { specImages: specImages.length ? specImages : undefined }
                  : {}),
                ...(usageImages !== undefined
                  ? { usageImages: usageImages.length ? usageImages : undefined }
                  : {}),
                ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
                ...(patch.price != null ? { basePrice: Math.round(patch.price) } : {}),
                ...(patch.customFields !== undefined
                  ? { customFields: patch.customFields }
                  : {}),
                ...(media !== undefined
                  ? {
                      media,
                      imageUris: imageUrisOf(media),
                      imageUri: firstImageUri(media),
                    }
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

          commerceHooks.onUpsert?.(masterId);
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

          commerceHooks.onDelete?.(masterId);
          return { ok: true };
        },

        setProductPromoted: (masterId, isPromoted) => {
          set((s) => ({
            masters: s.masters.map((m) =>
              m.id === masterId && m.isPromoted !== isPromoted ? { ...m, isPromoted } : m,
            ),
          }));
          commerceHooks.onUpsert?.(masterId);
        },

        syncPromotedFromIds: (activeProductIds) => {
          const ids = new Set(activeProductIds);
          set((s) => ({
            masters: s.masters.map((m) => {
              const next = ids.has(m.id);
              if (Boolean(m.isPromoted) === next) return m;
              return { ...m, isPromoted: next };
            }),
          }));
        },

        addCustomFieldDef: (def) =>
          set((s) => ({
            customFieldDefs: s.customFieldDefs.some((d) => d.key === def.key)
              ? s.customFieldDefs
              : [...s.customFieldDefs, def],
          })),

        hydrateFromServer: (input) => {
          // The authenticated shop's server catalog is authoritative. Merging
          // local-only rows here leaked products from a previous account and
          // could upload them into the next shop during pull reconciliation.
          set({
            masters: input.masters,
            variants: input.variants,
            stockByKey: Object.fromEntries(
              input.stock.map((row) => [stockKey(row.variantId, row.warehouseId), row]),
            ),
            ledger: [],
          });
        },
      };
    },
    {
      // v4 intentionally drops the pre-production, cross-account demo catalog.
      name: 'boommall-inventory-storage-v4',
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
        const realMasters = (saved.masters ?? current.masters).filter(
          (master) => !/^ms-(0[1-9]|1\d|20)$/.test(master.id),
        );
        const realMasterIds = new Set(realMasters.map((master) => master.id));
        const realVariants = (saved.variants ?? current.variants).filter((variant) =>
          realMasterIds.has(variant.masterSkuId),
        );
        const realVariantIds = new Set(realVariants.map((variant) => variant.id));
        const realStock = Object.fromEntries(
          Object.entries(saved.stockByKey ?? current.stockByKey).filter(([, row]) =>
            realVariantIds.has(row.variantId),
          ),
        );
        // Trust persisted real catalog; the bundled initial catalog is empty.
        return {
          ...current,
          masters: realMasters,
          variants: realVariants,
          stockByKey: realStock,
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
