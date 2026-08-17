import type { IncomingOrder } from './types';
import { linesOfOrder } from './pack-lines';

export type PickListRow = {
  sku: string;
  title: string;
  option: string;
  qty: number;
  warehouseId: string;
  orderIds: string[];
  imageUri?: string;
};

export type PickListWave = {
  rows: PickListRow[];
  skuCount: number;
  pieceCount: number;
  orderCount: number;
  lines: Array<{
    title: string;
    option?: string;
    sku?: string;
    qty: number;
    warehouseId?: string;
    orderId: string;
    imageUri?: string;
  }>;
};

/** Roll every รอแพ็ก card into one warehouse walk — same SKU stacks. */
export function consolidatePickList(orders: IncomingOrder[]): PickListWave {
  const map = new Map<string, PickListRow>();
  const lines: PickListWave['lines'] = [];
  for (const order of orders) {
    for (const line of linesOfOrder(order)) {
      if (line.qty <= 0) continue;
      const title = line.title.trim() || 'สินค้า';
      const option = (line.option ?? '').trim();
      const sku = (line.sku ?? '').trim() || title;
      const warehouseId = (line.warehouseId ?? 'WH-CTI-MAIN').trim() || 'WH-CTI-MAIN';
      lines.push({
        title,
        option: option || undefined,
        sku,
        qty: line.qty,
        warehouseId,
        orderId: order.id,
        imageUri: line.imageUri,
      });
      const key = `${warehouseId}|${sku}|${title}|${option}`.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.qty += line.qty;
        if (!existing.orderIds.includes(order.id)) existing.orderIds.push(order.id);
        continue;
      }
      map.set(key, {
        sku,
        title,
        option,
        qty: line.qty,
        warehouseId,
        orderIds: [order.id],
        imageUri: line.imageUri,
      });
    }
  }
  const rows = [...map.values()].sort((a, b) => {
    const sku = a.sku.localeCompare(b.sku, 'th');
    if (sku) return sku;
    return a.title.localeCompare(b.title, 'th');
  });
  return {
    rows,
    skuCount: rows.length,
    pieceCount: rows.reduce((n, row) => n + row.qty, 0),
    orderCount: orders.length,
    lines,
  };
}
