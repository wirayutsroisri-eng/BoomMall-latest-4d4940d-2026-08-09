import type { OrderSnapshotCard } from '@/modules/chat/domain/types';
import { ORDER_STATUS_LABEL, type IncomingOrder, type OrderStatus } from './types';

const SHIP_LABEL: Record<OrderStatus, string> = {
  pending: 'รอชำระเงิน / Unpaid',
  paid: 'รอจัดส่ง / To Ship',
  shipped: 'กำลังจัดส่ง / Shipped',
  delivered: 'สำเร็จแล้ว / Delivered',
  cancelled: 'ยกเลิกแล้ว / Cancelled',
};

export function shortOrderId(id: string) {
  const clean = id.replace(/^io-/, 'BM-').toUpperCase();
  return clean.startsWith('BM-') ? clean : `BM-${clean.slice(0, 8)}`;
}

export function buyerIdOf(order: IncomingOrder): string {
  if (order.buyerId?.trim()) return order.buyerId.trim();
  const slug = order.customerName
    .replace(/^(นาย|นางสาว|นาง|คุณ)\s*/i, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `buyer-${slug || order.id}`;
}

export function snapshotOfOrder(order: IncomingOrder, shopId: string): OrderSnapshotCard {
  if (!shopId.trim()) throw new Error('shopId required');
  return {
    orderId: order.id,
    buyerId: buyerIdOf(order),
    shopId,
    title: order.productTitle,
    option: order.variantLabel,
    qty: order.qty,
    amount: order.amount,
    currency: 'THB',
    imageUri: order.imageUri ?? order.lines?.[0]?.imageUri,
    paymentKind: order.paymentMethod === 'COD' ? 'COD' : 'PAID',
    orderStatus: order.status,
    orderStatusLabel: SHIP_LABEL[order.status] ?? ORDER_STATUS_LABEL[order.status],
    extraCount: Math.max(0, (order.lines?.length ?? 1) - 1),
  };
}
