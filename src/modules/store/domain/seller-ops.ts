import type { IncomingOrder } from './types';

export function countAwaitingShipment(orders: IncomingOrder[]) {
  return orders.filter((o) => o.status === 'paid').length;
}

export function countAwaitingReturn(orders: IncomingOrder[]) {
  return orders.filter((o) => Boolean(o.returnRequested) && o.status === 'delivered').length;
}

export function sumDeliveredSales(orders: IncomingOrder[]) {
  return orders.filter((o) => o.status === 'delivered').reduce((sum, o) => sum + o.amount, 0);
}
