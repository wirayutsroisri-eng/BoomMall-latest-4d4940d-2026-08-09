import { create } from 'zustand';
import { useInventoryStore } from './inventory-store';
import type { CartLine, WarehouseId } from '../domain/types';

type CartState = {
  lines: CartLine[];
  addToCart: (input: {
    variantId: string;
    warehouseId: WarehouseId;
    qty: number;
    unitPrice: number;
  }) => { ok: boolean; message: string };
  checkout: () => { ok: boolean; message: string; total: number };
  clear: () => void;
  lineCount: () => number;
  subtotal: () => number;
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
              ? { ...l, qty: l.qty + qty, unitPrice }
              : l,
          ),
        };
      }
      return {
        lines: [...state.lines, { variantId, warehouseId, qty, unitPrice }],
      };
    });

    return { ok: true, message: `จองสต็อกแล้ว · คงเหลือ ${result.available}` };
  },

  checkout: () => {
    const inventory = useInventoryStore.getState();
    const { lines } = get();
    if (!lines.length) return { ok: false, message: 'ตะกร้าว่าง', total: 0 };

    let total = 0;
    for (const line of lines) {
      const result = inventory.commitSale(line.variantId, line.warehouseId, line.qty);
      if (!result.ok) {
        return {
          ok: false,
          message: `ตัดสต็อกไม่สำเร็จ (${line.variantId})`,
          total: 0,
        };
      }
      total += line.unitPrice * line.qty;
    }
    set({ lines: [] });
    return { ok: true, message: 'ชำระเงินสำเร็จ · สต็อกซิงก์แล้ว', total };
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
}));
