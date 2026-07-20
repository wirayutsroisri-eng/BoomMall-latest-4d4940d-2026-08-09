export type OrderStatus =
  | "pending_payment"
  | "seller_confirmed"
  | "waiting_buyer_confirm"
  | "payment_submitted"
  | "payment_confirmed"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "รอผู้ขายยืนยัน",
  seller_confirmed: "ยืนยันแล้ว รอจัดส่ง",
  waiting_buyer_confirm: "รอผู้ซื้อยอมรับเงื่อนไข",
  payment_submitted: "รอยืนยันสลิป",
  payment_confirmed: "ยืนยันการชำระแล้ว",
  shipped: "จัดส่งแล้ว",
  completed: "สำเร็จ",
  cancelled: "ยกเลิก",
  refunded: "คืนเงิน",
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  seller_confirmed: "bg-teal-100 text-teal-800",
  waiting_buyer_confirm: "bg-amber-100 text-amber-800",
  payment_submitted: "bg-blue-100 text-blue-800",
  payment_confirmed: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-gray-100 text-gray-800",
};

export const CONDITION_LABELS: Record<string, string> = {
  new: "ใหม่",
  like_new: "เหมือนใหม่",
  good: "ดี",
  fair: "พอใช้",
  poor: "ต้องซ่อม",
};

export const KYC_STATUS_LABELS: Record<string, string> = {
  none: "ยังไม่ยืนยัน",
  pending: "รอตรวจสอบ",
  approved: "ยืนยันแล้ว",
  rejected: "ถูกปฏิเสธ",
};

export type ChatMode = "c2c" | "b2b";
export type ListingType = "c2c" | "b2b" | "both";

export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  c2c: "ซื้อของมือสอง",
  b2b: "ราคาส่ง B2B",
};

export const CHAT_MODE_COLORS: Record<ChatMode, string> = {
  c2c: "bg-blue-600",
  b2b: "bg-red-600",
};

export const LISTING_TYPE_LABELS: Record<ListingType, string> = {
  c2c: "มือสอง (C2C)",
  b2b: "ราคาส่ง (B2B)",
  both: "ทั้งสองโหมด",
};

export function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(num);
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
