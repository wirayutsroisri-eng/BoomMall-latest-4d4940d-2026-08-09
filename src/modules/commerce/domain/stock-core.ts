import type {
  CustomFieldValue,
  MasterSku,
  SkuVariant,
  StockLedgerEntry,
  StockLedgerType,
  StockStatus,
  WarehouseId,
  WarehouseStock,
} from './types';

/**
 * Pure stock/product logic shared by the Zustand store and node test scripts.
 * No React Native imports allowed in this file.
 */

export const DEFAULT_LOW_STOCK_THRESHOLD = 8;

export function availableOf(row: Pick<WarehouseStock, 'onHand' | 'reserved'>) {
  return Math.max(0, row.onHand - row.reserved);
}

export function stockStatusOf(available: number, threshold = DEFAULT_LOW_STOCK_THRESHOLD): StockStatus {
  if (available <= 0) return 'out';
  if (available <= threshold) return 'low';
  return 'ready';
}

/** "ควรเติมสินค้า" heuristic — architecture hook for dynamic reorder point */
export type ReorderInputs = {
  available: number;
  threshold: number;
  /** Future inputs for dynamic reorder point */
  averageDailySales?: number;
  leadTimeDays?: number;
  safetyStock?: number;
};

export function shouldReorder(inputs: ReorderInputs): boolean {
  const { available, threshold, averageDailySales, leadTimeDays, safetyStock } = inputs;
  if (averageDailySales != null && leadTimeDays != null) {
    const reorderPoint = averageDailySales * leadTimeDays + (safetyStock ?? 0);
    return available <= reorderPoint;
  }
  return available <= threshold;
}

// ---------------------------------------------------------------------------
// Stock mutations — each returns the next row + a ledger entry (audit trail)
// ---------------------------------------------------------------------------

export type MutationOutcome =
  | { ok: true; next: WarehouseStock; entry: LedgerDraft }
  | { ok: false; reason: 'INSUFFICIENT' | 'STALE_REVISION' | 'NOT_FOUND' | 'INVALID' };

export type LedgerDraft = Omit<StockLedgerEntry, 'id' | 'sku' | 'at' | 'actor'> & {
  actor?: string;
};

function draft(
  type: StockLedgerType,
  prev: WarehouseStock,
  next: WarehouseStock,
  extra?: Partial<Pick<StockLedgerEntry, 'reason' | 'orderRef'>>,
): LedgerDraft {
  return {
    type,
    variantId: next.variantId,
    warehouseId: next.warehouseId,
    availableBefore: availableOf(prev),
    qtyChange: availableOf(next) - availableOf(prev),
    availableAfter: availableOf(next),
    onHandAfter: next.onHand,
    reservedAfter: next.reserved,
    ...extra,
  };
}

export function applyReserve(
  row: WarehouseStock | undefined,
  qty: number,
  expectedRevision?: number,
  orderRef?: string,
): MutationOutcome {
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  if (expectedRevision != null && row.revision !== expectedRevision) {
    return { ok: false, reason: 'STALE_REVISION' };
  }
  if (qty > availableOf(row)) return { ok: false, reason: 'INSUFFICIENT' };
  const next: WarehouseStock = { ...row, reserved: row.reserved + qty, revision: row.revision + 1 };
  return { ok: true, next, entry: draft('ORDER_RESERVE', row, next, { orderRef }) };
}

export function applyCommitSale(
  row: WarehouseStock | undefined,
  qty: number,
  orderRef?: string,
): MutationOutcome {
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  if (row.reserved < qty || row.onHand < qty) return { ok: false, reason: 'INSUFFICIENT' };
  const next: WarehouseStock = {
    ...row,
    onHand: row.onHand - qty,
    reserved: row.reserved - qty,
    revision: row.revision + 1,
  };
  return { ok: true, next, entry: draft('SALE', row, next, { orderRef }) };
}

export function applyRelease(
  row: WarehouseStock | undefined,
  qty: number,
  orderRef?: string,
): MutationOutcome {
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  const next: WarehouseStock = {
    ...row,
    reserved: Math.max(0, row.reserved - qty),
    revision: row.revision + 1,
  };
  return { ok: true, next, entry: draft('ORDER_CANCEL', row, next, { orderRef }) };
}

export function applyRestock(
  row: WarehouseStock | undefined,
  qty: number,
  reason?: string,
): MutationOutcome {
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  const next: WarehouseStock = { ...row, onHand: row.onHand + qty, revision: row.revision + 1 };
  return { ok: true, next, entry: draft('RESTOCK', row, next, { reason }) };
}

export function applyReturn(
  row: WarehouseStock | undefined,
  qty: number,
  orderRef?: string,
): MutationOutcome {
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  const next: WarehouseStock = { ...row, onHand: row.onHand + qty, revision: row.revision + 1 };
  return { ok: true, next, entry: draft('RETURN', row, next, { orderRef }) };
}

/** Manual adjustment sets a new on-hand value; reserved is untouched. */
export function applyAdjust(
  row: WarehouseStock | undefined,
  newOnHand: number,
  reason: string,
): MutationOutcome {
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  if (!Number.isFinite(newOnHand) || newOnHand < 0) return { ok: false, reason: 'INVALID' };
  // Never allow on-hand below already-reserved stock (would make available negative)
  if (newOnHand < row.reserved) return { ok: false, reason: 'INSUFFICIENT' };
  const next: WarehouseStock = { ...row, onHand: newOnHand, revision: row.revision + 1 };
  return { ok: true, next, entry: draft('MANUAL_ADJUSTMENT', row, next, { reason }) };
}

/** Transfer between physical warehouses — produces two rows + two ledger drafts. */
export function applyTransfer(
  from: WarehouseStock | undefined,
  to: WarehouseStock | undefined,
  qty: number,
  toWarehouseId: WarehouseId,
  variantId: string,
):
  | { ok: true; nextFrom: WarehouseStock; nextTo: WarehouseStock; entries: LedgerDraft[] }
  | { ok: false; reason: 'INSUFFICIENT' | 'NOT_FOUND' | 'INVALID' } {
  if (!from) return { ok: false, reason: 'NOT_FOUND' };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'INVALID' };
  if (availableOf(from) < qty) return { ok: false, reason: 'INSUFFICIENT' };

  const nextFrom: WarehouseStock = { ...from, onHand: from.onHand - qty, revision: from.revision + 1 };
  const prevTo: WarehouseStock =
    to ?? { variantId, warehouseId: toWarehouseId, onHand: 0, reserved: 0, revision: 0 };
  const nextTo: WarehouseStock = { ...prevTo, onHand: prevTo.onHand + qty, revision: prevTo.revision + 1 };

  return {
    ok: true,
    nextFrom,
    nextTo,
    entries: [
      draft('TRANSFER', from, nextFrom, { reason: `โอนออกไป ${toWarehouseId}` }),
      draft('TRANSFER', prevTo, nextTo, { reason: `รับโอนจาก ${from.warehouseId}` }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Create-product pipeline (pure builder) — used by store + clone + tests
// ---------------------------------------------------------------------------

export type VariantInput = {
  label: string;
  sku: string;
  price: number;
  cost?: number;
  lowStockThreshold?: number;
  attrs: SkuVariant['attrs'];
  warehouseId: WarehouseId;
  onHand: number;
};

export type CreateMasterInput = {
  title: string;
  masterSku: string;
  channel: MasterSku['channel'];
  basePrice: number;
  tags: string[];
  customFields: CustomFieldValue[];
  description?: string;
  categoryKey?: string;
  ownerShopId?: string;
  brand?: string;
  shopName?: string;
  variants: VariantInput[];
};

export type CreatedBundle = {
  master: MasterSku;
  variants: SkuVariant[];
  stockRows: WarehouseStock[];
  ledgerDrafts: LedgerDraft[];
};

/** Always generates NEW product id / SKU ids / inventory rows (clone-safe). */
export function buildMasterWithVariants(
  input: CreateMasterInput,
  now: number,
  imageUris?: string[],
): CreatedBundle {
  const masterId = `ms-${now}`;
  const variants: SkuVariant[] = [];
  const stockRows: WarehouseStock[] = [];
  const ledgerDrafts: LedgerDraft[] = [];

  input.variants.forEach((v, index) => {
    const id = `sv-${now}-${index}`;
    variants.push({
      id,
      masterSkuId: masterId,
      sku: v.sku,
      label: v.label,
      attrs: v.attrs,
      price: v.price,
      cost: v.cost,
      lowStockThreshold: v.lowStockThreshold,
      status: 'active',
    });
    const row: WarehouseStock = {
      variantId: id,
      warehouseId: v.warehouseId,
      onHand: v.onHand,
      reserved: 0,
      revision: 1,
    };
    stockRows.push(row);
    if (v.onHand > 0) {
      ledgerDrafts.push({
        type: 'RESTOCK',
        variantId: id,
        warehouseId: v.warehouseId,
        availableBefore: 0,
        qtyChange: v.onHand,
        availableAfter: v.onHand,
        onHandAfter: v.onHand,
        reservedAfter: 0,
        reason: 'สต็อกเริ่มต้นตอนลงสินค้า',
      });
    }
  });

  const master: MasterSku = {
    id: masterId,
    masterSku: input.masterSku,
    title: input.title,
    brand: input.brand ?? 'Boom EV',
    shopName: input.shopName ?? 'Boom EV Shop Chanthaburi',
    channel: input.channel,
    basePrice: input.basePrice,
    currency: 'THB',
    tags: input.tags,
    customFields: input.customFields,
    variantIds: variants.map((v) => v.id),
    ownerShopId: input.ownerShopId,
    categoryKey: input.categoryKey,
    description: input.description?.trim() || undefined,
    imageUri: imageUris?.[0],
    imageUris,
    createdAt: new Date(now).toISOString(),
  };

  return { master, variants, stockRows, ledgerDrafts };
}

/** เพิ่มรุ่นใต้ Master เดิม — สร้าง SKU/สต็อกแถวใหม่โดยไม่แตะ Atomic Reservation */
export function buildAddedVariant(
  master: MasterSku,
  input: {
    label: string;
    price: number;
    onHand: number;
    warehouseId: WarehouseId;
    sku?: string;
    lowStockThreshold?: number;
  },
  now: number,
): {
  variant: SkuVariant;
  stockRow: WarehouseStock;
  ledgerDraft: LedgerDraft | null;
  nextMaster: MasterSku;
} {
  const id = `sv-${now}-${Math.floor(Math.random() * 900 + 100)}`;
  const sku =
    input.sku?.trim() ||
    `${master.masterSku}-${input.label.replace(/\s+/g, '').toUpperCase().slice(0, 8) || 'V'}-${`${now}`.slice(-4)}`;
  const variant: SkuVariant = {
    id,
    masterSkuId: master.id,
    sku,
    label: input.label.trim(),
    attrs: {},
    price: input.price,
    lowStockThreshold: input.lowStockThreshold,
    status: 'active',
  };
  const stockRow: WarehouseStock = {
    variantId: id,
    warehouseId: input.warehouseId,
    onHand: Math.max(0, input.onHand),
    reserved: 0,
    revision: 1,
  };
  const ledgerDraft: LedgerDraft | null =
    stockRow.onHand > 0
      ? {
          type: 'RESTOCK',
          variantId: id,
          warehouseId: input.warehouseId,
          availableBefore: 0,
          qtyChange: stockRow.onHand,
          availableAfter: stockRow.onHand,
          onHandAfter: stockRow.onHand,
          reservedAfter: 0,
          reason: 'เพิ่มรุ่นสินค้า',
        }
      : null;
  return {
    variant,
    stockRow,
    ledgerDraft,
    nextMaster: {
      ...master,
      variantIds: [...master.variantIds, id],
      basePrice: master.basePrice || input.price,
    },
  };
}

// ---------------------------------------------------------------------------
// Clone product — prefill only; NEVER carries ids, SKU codes, stock, history
// ---------------------------------------------------------------------------

export type ClonePrefill = {
  title: string;
  description?: string;
  channel: MasterSku['channel'];
  basePrice: number;
  tags: string[];
  categoryKey?: string;
  customFields: CustomFieldValue[];
  imageUris: string[];
  /** Variant STRUCTURE only — new SKU codes suggested, stock reset to 0 */
  variants: Array<{
    label: string;
    suggestedSku: string;
    price: number;
    attrs: SkuVariant['attrs'];
  }>;
};

/**
 * Builds prefill data for NEW PRODUCT MODE from an existing product.
 * Excluded on purpose: product id, sku ids, SKU codes (regenerated), inventory
 * rows, reserved stock, ledger history, orders, analytics.
 */
export function buildClonePrefill(
  master: MasterSku,
  variants: SkuVariant[],
  now: number,
): ClonePrefill {
  const stamp = `${now}`.slice(-4);
  return {
    title: `${master.title} (คัดลอก)`,
    description: master.description,
    channel: master.channel,
    basePrice: master.basePrice,
    tags: master.tags.filter((t) => t !== 'Custom'),
    categoryKey: master.categoryKey,
    customFields: master.customFields.map((f) => ({ ...f })),
    imageUris: master.imageUris ?? (master.imageUri ? [master.imageUri] : []),
    variants: variants.map((v, index) => ({
      label: v.label,
      suggestedSku: `${master.masterSku}-C${stamp}-${index + 1}`,
      price: v.price,
      attrs: { ...v.attrs },
    })),
  };
}
