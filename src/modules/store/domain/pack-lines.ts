import type { IncomingOrder, IncomingOrderLine, OrderSkuItem } from './types';

export type PackLineGroup = {
  title: string;
  productId?: string;
  imageUri?: string;
  variants: IncomingOrderLine[];
  qty: number;
};

export type PackSummary = {
  skuCount: number;
  groupCount: number;
  pieceCount: number;
  label: string;
};

type LooseSkuLine = Partial<IncomingOrderLine> &
  Partial<OrderSkuItem> & {
    variantName?: string;
    quantity?: number;
    image?: string;
    price?: number;
    name?: string;
    label?: string;
    variant?: string;
  };

/** Flatten checkout / seed / API rows into one SKU list. */
export function toOrderSkuItem(line: LooseSkuLine): OrderSkuItem {
  const name = (line.name ?? line.title ?? line.sku ?? 'สินค้า').trim() || 'สินค้า';
  const variantName = (line.variantName ?? line.option ?? line.label ?? line.variant ?? '').trim();
  const quantity = Math.max(0, Math.trunc(line.quantity ?? line.qty ?? 0));
  const price = Number(line.price ?? line.unitPrice ?? 0) || 0;
  const image = (line.image ?? line.imageUri)?.trim() || undefined;
  const productId = (line.productId ?? name).trim() || name;
  return {
    productId,
    name,
    variantName,
    quantity,
    image,
    price,
    sku: line.sku?.trim() || undefined,
  };
}

export function toOrderSkuItems(lines: LooseSkuLine[]): OrderSkuItem[] {
  return lines.map(toOrderSkuItem).filter((item) => item.quantity > 0);
}

export function linesOfOrder(order: IncomingOrder): IncomingOrderLine[] {
  if (order.lines?.length) return order.lines;
  return [
    {
      title: order.productTitle,
      option: order.variantLabel,
      qty: order.qty,
      sku: order.sku,
      unitPrice: order.qty > 0 ? Math.round(order.amount / order.qty) : order.amount,
      imageUri: order.imageUri,
      productId: order.masterSkuId,
      variantId: order.lines?.[0]?.variantId,
      warehouseId: order.lines?.[0]?.warehouseId,
    },
  ];
}

export function itemsOfOrder(order: IncomingOrder): OrderSkuItem[] {
  return toOrderSkuItems(linesOfOrder(order));
}

/** Same product (มอเตอร์ / ตัวควบคุม) stays one block; SKU options stack in one column. */
export function groupPackLines(lines: IncomingOrderLine[]): PackLineGroup[] {
  const groups: PackLineGroup[] = [];
  const index = new Map<string, number>();
  for (const line of lines) {
    const key = (line.productId?.trim() || line.title.trim() || line.sku || 'item').toLowerCase();
    const at = index.get(key);
    if (at !== undefined) {
      const group = groups[at]!;
      group.variants.push(line);
      group.qty += line.qty;
      if (!group.imageUri && line.imageUri) group.imageUri = line.imageUri;
      continue;
    }
    index.set(key, groups.length);
    groups.push({
      title: line.title.trim() || 'สินค้า',
      productId: line.productId,
      imageUri: line.imageUri,
      variants: [line],
      qty: line.qty,
    });
  }
  return groups;
}

export function groupOrderSkuItems(items: OrderSkuItem[]): PackLineGroup[] {
  return groupPackLines(
    items.map((item) => ({
      productId: item.productId,
      title: item.name,
      option: item.variantName,
      qty: item.quantity,
      sku: item.sku,
      unitPrice: item.price,
      imageUri: item.image,
    })),
  );
}

/** Badge text: [3000W] [รุ่น 680] [สีดำ] */
export function skuBadgeLabel(variantName?: string | null) {
  const raw = variantName?.trim() ?? '';
  if (!raw) return '';
  if (/^รุ่น\s/i.test(raw) || /^สี/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `รุ่น ${raw}`;
  return raw;
}

export function variantLineLabel(line: IncomingOrderLine) {
  const badge = skuBadgeLabel(line.option);
  const sku = line.sku?.trim();
  if (badge && sku) return `${badge} · SKU ${sku} · x${line.qty}`;
  if (badge) return `${badge} · x${line.qty}`;
  if (sku) return `SKU ${sku} · x${line.qty}`;
  return `x${line.qty}`;
}

export function extraSkuCount(lines: IncomingOrderLine[]) {
  return Math.max(0, lines.length - 1);
}

export function packSummary(lines: IncomingOrderLine[]): PackSummary {
  const groups = groupPackLines(lines);
  const pieceCount = lines.reduce((n, line) => n + Math.max(0, line.qty), 0);
  const skuCount = lines.length;
  const groupCount = Math.max(groups.length, skuCount ? 1 : 0);
  return {
    skuCount,
    groupCount,
    pieceCount,
    label: `รวม ${groupCount} รายการ (${pieceCount} ชิ้น)`,
  };
}

export const MAX_VISIBLE_PACK_SKUS = 6;
