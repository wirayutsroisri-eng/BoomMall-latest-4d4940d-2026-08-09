import { MY_SHOP_ID } from '@/modules/warehouse/data/seed';
import { mergeSameAddressOrders, type MergeableOrder } from './address-merge';
import { sortFulfillmentQueue } from './fulfillment-priority';
import { linesOfOrder, packSummary, type PackSummary } from './pack-lines';
import type { IncomingOrder, IncomingOrderLine } from './types';

export type PackingManifest = {
  orders: IncomingOrder[];
  orderIds: string[];
  lines: IncomingOrderLine[];
  summary: PackSummary;
  amount: number;
  paymentKind: 'PAID' | 'COD' | 'MIXED';
  codAmountThb: number;
};

export function toSellerMergeable(order: IncomingOrder, merchantId = MY_SHOP_ID): MergeableOrder {
  const lines = linesOfOrder(order).map((line) => ({
    title: line.title,
    sku: line.sku,
    label: line.option,
    qty: line.qty,
    unitPrice: line.unitPrice ?? 0,
    productId: line.productId,
    imageUri: line.imageUri,
  }));
  return {
    id: order.id,
    merchantId,
    status: order.status === 'paid' ? 'PAID' : order.status.toUpperCase(),
    shippingStatus: order.status === 'paid' ? 'PENDING' : order.status.toUpperCase(),
    merchandiseThb: order.amount,
    shipping: {
      name: order.customerName,
      phone: order.recipientPhone ?? '',
      line1: order.shippingAddress ?? '',
      paymentMethod: order.paymentMethod === 'COD' ? 'cod' : 'prepaid',
      codAmountThb: order.paymentMethod === 'COD' ? order.amount : undefined,
    },
    lines,
    trackingNumber: order.trackingNo,
  };
}

/** Same order set the seller card shows — never the first merge bucket. */
export function ordersForShipment(
  order: IncomingOrder,
  paid: IncomingOrder[],
  now = Date.now(),
): IncomingOrder[] {
  const pool = paid.filter((row) => row.status === 'paid' && !row.returnRequested);
  const source = pool.some((row) => row.id === order.id) ? pool : [order, ...pool];
  const groups = mergeSameAddressOrders(source.map((row) => toSellerMergeable(row)));
  const group = groups.find((g) => g.orderIds.includes(order.id));
  const byId = new Map(source.map((row) => [row.id, row]));
  const ids = group?.orderIds ?? [order.id];
  const orders = ids.map((id) => byId.get(id)).filter((row): row is IncomingOrder => Boolean(row));
  return sortFulfillmentQueue(orders.length ? orders : [order], now);
}

export function packingManifestOf(orders: IncomingOrder[]): PackingManifest {
  const lines = orders.flatMap(linesOfOrder);
  const amount = orders.reduce((sum, row) => sum + row.amount, 0);
  const kinds = new Set(orders.map((row) => (row.paymentMethod === 'COD' ? 'COD' : 'PAID')));
  const paymentKind: PackingManifest['paymentKind'] =
    kinds.size > 1 ? 'MIXED' : kinds.has('COD') ? 'COD' : 'PAID';
  const codAmountThb = orders
    .filter((row) => row.paymentMethod === 'COD')
    .reduce((sum, row) => sum + row.amount, 0);
  return {
    orders,
    orderIds: orders.map((row) => row.id),
    lines,
    summary: packSummary(lines),
    amount,
    paymentKind,
    codAmountThb,
  };
}

export function packingManifestForOrder(order: IncomingOrder, paid: IncomingOrder[], now = Date.now()) {
  return packingManifestOf(ordersForShipment(order, paid, now));
}
