import { create } from 'zustand';
import { useInventoryStore } from './inventory-store';
import type { CartLine, WarehouseId } from '../domain/types';

export function cartLineKey(line: Pick<CartLine, 'variantId' | 'warehouseId'>) {
  return `${line.variantId}::${line.warehouseId}`;
}

type CartState = {
  lines: CartLine[];
  addToCart: (input: {
    variantId: string;
    warehouseId: WarehouseId;
    qty: number;
    unitPrice: number;
  }) => { ok: boolean; message: string };
  setQty: (
    variantId: string,
    warehouseId: WarehouseId,
    qty: number,
  ) => { ok: boolean; message: string };
  removeLine: (variantId: string, warehouseId: WarehouseId) => void;
  toggleLine: (variantId: string, warehouseId: WarehouseId) => void;
  toggleShop: (variantIds: string[], selected: boolean) => void;
  toggleAll: (selected: boolean) => void;
  /** Deduct warehouse stock only when the order is placed */
  checkoutSelected: () => { ok: boolean; message: string; total: number; count: number };
  checkout: () => { ok: boolean; message: string; total: number };
  clear: () => void;
  lineCount: () => number;
  subtotal: () => number;
  selectedCount: () => number;
  selectedSubtotal: () => number;
  qtyOf: (variantId: string) => number;
};

function remainingStock(variantId: string, warehouseId: WarehouseId, alreadyInCart: number) {
  const available = useInventoryStore.getState().available(variantId, warehouseId);
  return Math.max(0, available - alreadyInCart);
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],

  qtyOf: (variantId) =>
    get()
      .lines.filter((l) => l.variantId === variantId)
      .reduce((n, l) => n + l.qty, 0),

  addToCart: ({ variantId, warehouseId, qty, unitPrice }) => {
    if (!Number.isFinite(qty) || qty < 1) {
      return { ok: false, message: 'จำนวนไม่ถูกต้อง' };
    }
    const existing = get().lines.find(
      (l) => l.variantId === variantId && l.warehouseId === warehouseId,
    );
    const already = existing?.qty ?? 0;
    const left = remainingStock(variantId, warehouseId, already);
    if (qty > left) {
      return {
        ok: false,
        message: left <= 0 ? 'สต็อกไม่พอ หรืออยู่ในตะกร้าครบแล้ว' : `สต็อกไม่พอ · เหลือใส่ได้อีก ${left} ชิ้น`,
      };
    }

    set((state) => {
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.variantId === variantId && l.warehouseId === warehouseId
              ? { ...l, qty: l.qty + qty, unitPrice, selected: true }
              : l,
          ),
        };
      }
      return {
        lines: [
          ...state.lines,
          { variantId, warehouseId, qty, unitPrice, selected: true },
        ],
      };
    });

    const available = useInventoryStore.getState().available(variantId, warehouseId);
    return { ok: true, message: `ใส่ตะกร้าแล้ว · มีสินค้า ${available} ชิ้น` };
  },

  setQty: (variantId, warehouseId, qty) => {
    const line = get().lines.find(
      (l) => l.variantId === variantId && l.warehouseId === warehouseId,
    );
    if (!line) return { ok: false, message: 'ไม่พบสินค้าในตะกร้า' };
    if (!Number.isFinite(qty) || qty < 1) {
      get().removeLine(variantId, warehouseId);
      return { ok: true, message: 'ลบออกจากตะกร้าแล้ว' };
    }
    const available = useInventoryStore.getState().available(variantId, warehouseId);
    if (qty > available) {
      return { ok: false, message: `สต็อกไม่พอ · มีสินค้า ${available} ชิ้น` };
    }
    set((state) => ({
      lines: state.lines.map((l) =>
        l.variantId === variantId && l.warehouseId === warehouseId ? { ...l, qty } : l,
      ),
    }));
    return { ok: true, message: `อัปเดตเป็น ${qty} ชิ้น` };
  },

  removeLine: (variantId, warehouseId) => {
    set((state) => ({
      lines: state.lines.filter(
        (l) => !(l.variantId === variantId && l.warehouseId === warehouseId),
      ),
    }));
  },

  toggleLine: (variantId, warehouseId) =>
    set((state) => ({
      lines: state.lines.map((l) =>
        l.variantId === variantId && l.warehouseId === warehouseId
          ? { ...l, selected: !(l.selected ?? true) }
          : l,
      ),
    })),

  toggleShop: (variantIds, selected) => {
    const setIds = new Set(variantIds);
    set((state) => ({
      lines: state.lines.map((l) =>
        setIds.has(l.variantId) ? { ...l, selected } : l,
      ),
    }));
  },

  toggleAll: (selected) =>
    set((state) => ({
      lines: state.lines.map((l) => ({ ...l, selected })),
    })),

  checkoutSelected: () => {
    const inventory = useInventoryStore.getState();
    const { lines } = get();
    const selected = lines.filter((l) => l.selected !== false);
    if (!selected.length) return { ok: false, message: 'ยังไม่ได้เลือกสินค้า', total: 0, count: 0 };

    let total = 0;
    for (const line of selected) {
      const result = inventory.sellAvailable(line.variantId, line.warehouseId, line.qty);
      if (!result.ok) {
        return {
          ok: false,
          message: `ตัดสต็อกไม่สำเร็จ (${line.variantId})`,
          total: 0,
          count: 0,
        };
      }
      total += line.unitPrice * line.qty;
    }

    const leftover = lines.filter((l) => l.selected === false);
    set({ lines: leftover });
    return {
      ok: true,
      message: 'สั่งซื้อสำเร็จ · ตัดสต็อกจากคลังแล้ว',
      total,
      count: selected.reduce((n, l) => n + l.qty, 0),
    };
  },

  checkout: () => {
    const result = get().checkoutSelected();
    return { ok: result.ok, message: result.message, total: result.total };
  },

  clear: () => set({ lines: [] }),

  lineCount: () => get().lines.reduce((n, l) => n + l.qty, 0),
  subtotal: () => get().lines.reduce((n, l) => n + l.qty * l.unitPrice, 0),
  selectedCount: () =>
    get()
      .lines.filter((l) => l.selected !== false)
      .reduce((n, l) => n + l.qty, 0),
  selectedSubtotal: () =>
    get()
      .lines.filter((l) => l.selected !== false)
      .reduce((n, l) => n + l.qty * l.unitPrice, 0),
}));
