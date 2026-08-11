export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'รอชำระเงิน',
  paid: 'ชำระแล้ว · เตรียมจัดส่ง',
  shipped: 'จัดส่งแล้ว',
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
