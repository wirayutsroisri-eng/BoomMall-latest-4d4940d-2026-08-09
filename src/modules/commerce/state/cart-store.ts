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
  /** Commit only selected lines; release reservations on unselected leftovers */
  checkoutSelected: () => { ok: boolean; message: string; total: number; count: number };
  checkout: () => { ok: boolean; message: string; total: number };
  clear: () => void;
  lineCount: () => number;
  subtotal: () => number;
  selectedCount: () => number;
  selectedSubtotal: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],

  addToCart: ({ variantId, warehouseId, qty, unitPrice }) => {
    const inventory = useInventoryStore.getState();
    const result = inventory.reserveStock(variantId, warehouseId, qty);
    if (!result.ok) {
      return {
        ok: false,
        message:
          result.reason === 'INSUFFICIENT'
            ? 'สต็อกไม่พอ (Real-time sync)'
            : result.reason === 'STALE_REVISION'
              ? 'สต็อกถูกอัปเดต — ลองอีกครั้ง (thread-safe)'
              : 'ไม่พบสต็อกคลังนี้',
      };
    }

    set((state) => {
      const existing = state.lines.find(
        (l) => l.variantId === variantId && l.warehouseId === warehouseId,
      );
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

    return { ok: true, message: `จองสต็อกแล้ว · คงเหลือ ${result.available}` };
  },

  setQty: (variantId, warehouseId, qty) => {
    const inventory = useInventoryStore.getState();
    const line = get().lines.find(
      (l) => l.variantId === variantId && l.warehouseId === warehouseId,
    );
    if (!line) return { ok: false, message: 'ไม่พบสินค้าในตะกร้า' };
    if (!Number.isFinite(qty) || qty < 1) {
      get().removeLine(variantId, warehouseId);
      return { ok: true, message: 'ลบออกจากตะกร้าแล้ว' };
    }
    const delta = qty - line.qty;
    if (delta === 0) return { ok: true, message: 'ไม่เปลี่ยนแปลง' };
    if (delta > 0) {
      const result = inventory.reserveStock(variantId, warehouseId, delta);
      if (!result.ok) {
        return {
          ok: false,
          message: result.reason === 'INSUFFICIENT' ? 'สต็อกไม่พอ' : 'อัปเดตจำนวนไม่สำเร็จ',
        };
      }
    } else {
      inventory.releaseReservation(variantId, warehouseId, -delta);
    }
    set((state) => ({
      lines: state.lines.map((l) =>
        l.variantId === variantId && l.warehouseId === warehouseId ? { ...l, qty } : l,
      ),
    }));
    return { ok: true, message: `อัปเดตเป็น ${qty} ชิ้น` };
  },

  removeLine: (variantId, warehouseId) => {
    const inventory = useInventoryStore.getState();
    const line = get().lines.find(
      (l) => l.variantId === variantId && l.warehouseId === warehouseId,
    );
    if (line) inventory.releaseReservation(variantId, warehouseId, line.qty);
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
      const result = inventory.commitSale(line.variantId, line.warehouseId, line.qty);
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

    // Release reservations for unselected leftover lines
    const leftover = lines.filter((l) => l.selected === false);
    for (const line of leftover) {
      inventory.releaseReservation(line.variantId, line.warehouseId, line.qty);
    }

    set({ lines: [] });
    return {
      ok: true,
      message: 'สั่งซื้อสำเร็จ · สต็อกซิงก์แล้ว',
      total,
      count: selected.reduce((n, l) => n + l.qty, 0),
    };
  },

  checkout: () => {
    const result = get().checkoutSelected();
    return { ok: result.ok, message: result.message, total: result.total };
  },

  clear: () => {
    const inventory = useInventoryStore.getState();
    for (const line of get().lines) {
      inventory.releaseReservation(line.variantId, line.warehouseId, line.qty);
    }
    set({ lines: [] });
  },

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
