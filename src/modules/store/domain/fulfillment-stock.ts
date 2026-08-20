import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import type { WarehouseId } from '@/modules/commerce/domain/types';
import { linesOfOrder } from './pack-lines';
import type { IncomingOrder } from './types';

/** Commit reserved units after the seller marks packed. No-op if already deducted. */
export function commitPackedOrdersLocally(orders: IncomingOrder[]) {
  const inv = useInventoryStore.getState();
  for (const order of orders) {
    for (const line of linesOfOrder(order)) {
      const variantId = line.variantId?.trim();
      if (!variantId || line.qty <= 0) continue;
      const warehouseId = line.warehouseId?.trim() || 'WH-CTI-MAIN';
      const row = inv.listStockRows(variantId).find((item) => item.warehouseId === warehouseId);
      if (!row || row.reserved < line.qty) continue;
      inv.commitSale(variantId, warehouseId as WarehouseId, line.qty, order.id);
    }
  }
}
