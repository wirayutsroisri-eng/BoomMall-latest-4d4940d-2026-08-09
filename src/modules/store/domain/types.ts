export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'รอชำระเงิน',
  paid: 'รอแพ็ก',
  shipped: 'กำลังจัดส่ง',
  delivered: 'สำเร็จแล้ว',
  cancelled: 'ยกเลิกแล้ว',
};

/** A purchase I made as a customer, shown under Profile → [🛍️ คำสั่งซื้อของฉัน]. */
export type MyOrder = {
  id: string;
  productTitle: string;
  variantLabel: string;
  thumbnailColor: string;
  /** Optional product photo for order cards */
  imageUri?: string;
  qty: number;
  amount: number;
  currency: 'THB';
  status: OrderStatus;
  placedAt: string;
  shopName: string;
  trackingNo?: string;
  /** Short logistics headline under the truck icon */
  shippingHeadline?: string;
  /** Estimated delivery / logistics detail line */
  shippingDetail?: string;
  /** Delivered orders waiting for a review */
  needsReview?: boolean;
  isMall?: boolean;
};

export type ShippingSpeed = 'express' | 'standard' | 'locker';

export type IncomingOrderLine = {
  title: string;
  option?: string;
  qty: number;
  sku?: string;
  unitPrice?: number;
  imageUri?: string;
  /** Master product id — groups 3000W + 2000W under the same motor */
  productId?: string;
  variantId?: string;
  warehouseId?: string;
};

/** Canonical multi-SKU row for the seller card + packing label. */
export type OrderSkuItem = {
  productId: string;
  name: string;
  variantName: string;
  quantity: number;
  image?: string;
  price: number;
  sku?: string;
};

/** An order a customer placed with my shop, shown in the Store Dashboard's incoming orders list. */
export type IncomingOrder = {
  id: string;
  masterSkuId: string;
  customerName: string;
  customerAvatarColor: string;
  productTitle: string;
  qty: number;
  amount: number;
  currency: 'THB';
  status: OrderStatus;
  placedAt: string;
  /** ISO time — used for FIFO / SLA countdown */
  placedAtIso?: string;
  trackingNo?: string;
  courierEvent?: string;
  /** Customer asked to return this delivered order */
  returnRequested?: boolean;
  recipientPhone?: string;
  shippingAddress?: string;
  paymentMethod?: 'PAID' | 'COD';
  sku?: string;
  variantLabel?: string;
  imageUri?: string;
  shippingSpeed?: ShippingSpeed;
  province?: string;
  lines?: IncomingOrderLine[];
  /** Buyer account id — used to open seller↔buyer chat */
  buyerId?: string;
};

/** A chat/inquiry about a product listing — drives the top-right alert badge on shop content. */
export type ProductInquiry = {
  id: string;
  masterSkuId: string;
  customerName: string;
  customerAvatarColor: string;
  message: string;
  placedAt: string;
  unread: boolean;
};
