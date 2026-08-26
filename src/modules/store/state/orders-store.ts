import { create } from 'zustand';
import type { IncomingOrder, MyOrder, OrderStatus, ProductInquiry } from '../domain/types';

const STATUS_FLOW: OrderStatus[] = ['pending', 'paid', 'shipped', 'delivered'];

function nextStatus(status: OrderStatus): OrderStatus {
  const idx = STATUS_FLOW.indexOf(status);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return status;
  return STATUS_FLOW[idx + 1];
}

type OrdersState = {
  myOrders: MyOrder[];
  incomingOrders: IncomingOrder[];
  inquiries: ProductInquiry[];
  advanceIncomingOrder: (id: string) => void;
  acceptIncomingReturn: (id: string) => { ok: true } | { ok: false; reason: string };
  cancelIncomingOrder: (id: string) => { ok: true } | { ok: false; reason: string };
  cancelMyOrder: (id: string) => void;
  markInquiryRead: (id: string) => void;
  markProductAlertsSeen: (masterSkuId: string) => void;
  upsertIncoming: (orders: IncomingOrder[]) => void;
};

/** Production order state starts empty and is populated only from authenticated APIs. */
export const useOrdersStore = create<OrdersState>((set, get) => ({
  myOrders: [],
  incomingOrders: [],
  inquiries: [],
  advanceIncomingOrder: (id) =>
    set((state) => ({
      incomingOrders: state.incomingOrders.map((order) => {
        if (order.id !== id) return order;
        const status = nextStatus(order.status);
        const trackingNo =
          order.status === 'paid' && status === 'shipped'
            ? order.trackingNo ?? `BEV-TH-${`${Date.now()}`.slice(-8)}`
            : order.trackingNo;
        return { ...order, status, trackingNo };
      }),
    })),
  acceptIncomingReturn: (id) => {
    const order = get().incomingOrders.find((row) => row.id === id);
    if (!order) return { ok: false, reason: 'ไม่พบออเดอร์' };
    if (!order.returnRequested || order.status !== 'delivered') {
      return { ok: false, reason: 'รายการนี้ไม่ได้ขอคืนสินค้า' };
    }
    set((state) => ({
      incomingOrders: state.incomingOrders.map((row) =>
        row.id === id ? { ...row, status: 'cancelled', returnRequested: false } : row,
      ),
    }));
    return { ok: true };
  },
  cancelIncomingOrder: (id) => {
    const order = get().incomingOrders.find((row) => row.id === id);
    if (!order) return { ok: false, reason: 'ไม่พบออเดอร์' };
    if (order.status !== 'pending') {
      return { ok: false, reason: 'ยกเลิกได้เฉพาะออเดอร์ที่ยังไม่ชำระ' };
    }
    set((state) => ({
      incomingOrders: state.incomingOrders.map((row) =>
        row.id === id ? { ...row, status: 'cancelled' } : row,
      ),
    }));
    return { ok: true };
  },
  cancelMyOrder: (id) =>
    set((state) => ({
      myOrders: state.myOrders.map((order) =>
        order.id === id ? { ...order, status: 'cancelled' } : order,
      ),
    })),
  markInquiryRead: (id) =>
    set((state) => ({
      inquiries: state.inquiries.map((inquiry) =>
        inquiry.id === id ? { ...inquiry, unread: false } : inquiry,
      ),
    })),
  markProductAlertsSeen: (masterSkuId) =>
    set((state) => ({
      inquiries: state.inquiries.map((inquiry) =>
        inquiry.masterSkuId === masterSkuId ? { ...inquiry, unread: false } : inquiry,
      ),
    })),
  upsertIncoming: (orders) =>
    set((state) => {
      if (!orders.length) return state;
      const next = [...state.incomingOrders];
      for (const order of orders) {
        const at = next.findIndex((row) => row.id === order.id);
        if (at >= 0) next[at] = { ...next[at], ...order, lines: order.lines ?? next[at]?.lines };
        else next.unshift(order);
      }
      return { incomingOrders: next };
    }),
}));
