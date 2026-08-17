import type { IncomingOrder, OrderStatus } from './types';

/** ค่าเริ่มต้นตรงกับ backend DEFAULT_GP_BPS (5.00%) */
export const DEFAULT_GP_BPS = 500;

export type GpSplit = {
  gmv: number;
  gpBps: number;
  gp: number;
  net: number;
};

/** สูตรเดียวกับ backend quoteGp: floor(gmv * bps / 10000) */
export function splitGp(gmv: number, gpBps = DEFAULT_GP_BPS): GpSplit {
  const amount = Math.max(0, Math.round(gmv));
  const bps = Math.max(0, Math.min(10_000, Math.round(gpBps)));
  const gp = Math.floor((amount * bps) / 10_000);
  return { gmv: amount, gpBps: bps, gp, net: amount - gp };
}

export function isEarningOrder(status: OrderStatus) {
  return status === 'paid' || status === 'shipped' || status === 'delivered';
}

/** Local seed only — live money uses settlementStatus from the platform ledger. */
export function isAvailableOrder(status: OrderStatus) {
  return status === 'delivered';
}

export type SellerMoneyTotals = {
  gmv: number;
  gp: number;
  net: number;
  available: number;
  pending: number;
};

export function sellerMoneyFromOrders(orders: IncomingOrder[], gpBps = DEFAULT_GP_BPS): SellerMoneyTotals {
  const totals: SellerMoneyTotals = { gmv: 0, gp: 0, net: 0, available: 0, pending: 0 };
  for (const o of orders) {
    if (!isEarningOrder(o.status)) continue;
    const split = splitGp(o.amount, gpBps);
    totals.gmv += split.gmv;
    totals.gp += split.gp;
    totals.net += split.net;
    if (isAvailableOrder(o.status)) totals.available += split.net;
    else totals.pending += split.net;
  }
  return totals;
}
