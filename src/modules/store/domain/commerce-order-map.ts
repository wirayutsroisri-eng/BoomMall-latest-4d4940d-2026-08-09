import type { IncomingOrder, IncomingOrderLine, OrderStatus } from './types';

export type CommerceOrderSource = {
  id: string;
  buyerId: string;
  status: string;
  merchandiseThb: number;
  createdAt?: string;
  paidAt?: string | null;
  trackingNumber?: string | null;
  shippingStatus?: string | null;
  courierEvent?: string | null;
  returnStatus?: string | null;
  shipping?: {
    name?: string;
    phone?: string;
    line1?: string;
    district?: string;
    amphoe?: string;
    province?: string;
    postcode?: string;
    paymentMethod?: string;
  };
  lines: Array<{
    productId?: string;
    title?: string;
    name?: string;
    sku?: string;
    label?: string;
    color?: string;
    variant?: string;
    variantName?: string;
    qty?: number;
    quantity?: number;
    unitPrice?: number;
    price?: number;
    image?: string;
    imageUri?: string;
    variantId?: string;
    warehouseId?: string;
  }>;
};

const STATUS: Record<string, OrderStatus> = {
  PENDING_PAYMENT: 'pending',
  PENDING: 'pending',
  PAID: 'paid',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};

function colorFor(seed: string) {
  const palette = ['#F5A524', '#2E8CFF', '#00A86B', '#FE2C55', '#E5893A', '#C9A227'];
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length]!;
}

function formatAddress(shipping?: CommerceOrderSource['shipping']) {
  if (!shipping) return '';
  return [shipping.line1, shipping.district, shipping.amphoe, shipping.province, shipping.postcode]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ');
}

function optionOf(line: CommerceOrderSource['lines'][number]) {
  return [line.variantName, line.label, line.variant, line.color].find((v) => v?.trim())?.trim();
}

export function linesFromCommerceOrder(order: CommerceOrderSource): IncomingOrderLine[] {
  return order.lines
    .map((line) => ({
      title: (line.name ?? line.title ?? line.sku ?? 'สินค้า').trim() || 'สินค้า',
      option: optionOf(line),
      qty: Math.max(0, Math.trunc(line.quantity ?? line.qty ?? 0)),
      sku: line.sku,
      unitPrice: Number(line.price ?? line.unitPrice ?? 0) || 0,
      productId: line.productId,
      imageUri: (line.image ?? line.imageUri)?.trim() || undefined,
      variantId: line.variantId,
      warehouseId: line.warehouseId,
    }))
    .filter((line) => line.qty > 0);
}

/** Buyer checkout order → seller fulfillment card (same lines, one column). */
export function incomingFromCommerceOrder(order: CommerceOrderSource): IncomingOrder {
  const lines = linesFromCommerceOrder(order);
  const first = lines[0];
  const shipping = order.shipping;
  const paid = Boolean(order.paidAt) || order.status === 'PAID';
  const placed = order.createdAt ? new Date(order.createdAt) : new Date();
  let status: OrderStatus = STATUS[order.status] ?? (paid ? 'paid' : 'pending');
  const ship = (order.shippingStatus ?? '').toUpperCase();
  const courier = (order.courierEvent ?? '').toUpperCase();
  if (ship === 'PACKED' || ship === 'SHIPPED' || courier === 'PICKED_UP' || courier === 'OUT_FOR_DELIVERY') {
    status = 'shipped';
  }
  if (ship === 'DELIVERED' || courier === 'DELIVERED') status = 'delivered';
  return {
    id: order.id,
    masterSkuId: first?.productId ?? 'unknown',
    buyerId: order.buyerId,
    customerName: shipping?.name?.trim() || 'ลูกค้า',
    customerAvatarColor: colorFor(order.buyerId || order.id),
    productTitle: first?.title ?? 'คำสั่งซื้อ',
    qty: lines.reduce((n, l) => n + l.qty, 0),
    amount: order.merchandiseThb,
    currency: 'THB',
    status,
    placedAt: placed.toLocaleString('th-TH'),
    placedAtIso: placed.toISOString(),
    trackingNo: order.trackingNumber ?? undefined,
    courierEvent: order.courierEvent ?? undefined,
    returnRequested: order.returnStatus === 'REQUESTED' || courier === 'RETURNED',
    recipientPhone: shipping?.phone,
    shippingAddress: formatAddress(shipping),
    paymentMethod: shipping?.paymentMethod === 'cod' ? 'COD' : 'PAID',
    sku: first?.sku,
    variantLabel: first?.option,
    imageUri: first?.imageUri,
    shippingSpeed: 'standard',
    province: shipping?.province,
    lines,
  };
}
