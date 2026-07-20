import { invokeLLM } from "./llm";

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, string>;
}

/**
 * Send push notification to user via Manus Notification API
 */
export async function sendPushNotification(
  userId: number,
  payload: PushNotificationPayload
): Promise<boolean> {
  try {
    // Use Manus Notification API
    const response = await fetch(
      `${process.env.BUILT_IN_FORGE_API_URL}/notification/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.BUILT_IN_FORGE_API_KEY}`,
        },
        body: JSON.stringify({
          userId,
          title: payload.title,
          body: payload.body,
          icon: payload.icon,
          badge: payload.badge,
          tag: payload.tag,
          data: payload.data,
        }),
      }
    );

    if (!response.ok) {
      console.error(
        `[Push Notification] Failed to send: ${response.statusText}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[Push Notification] Error:", error);
    return false;
  }
}

/**
 * Send notification for new message
 */
export async function notifyNewMessage(
  userId: number,
  senderName: string,
  productTitle: string
): Promise<boolean> {
  // Send via Manus Notification API (in-app)
  const result = await sendPushNotification(userId, {
    title: `ข้อความใหม่จาก ${senderName}`,
    body: `เกี่ยวกับสินค้า: ${productTitle}`,
    tag: "message",
    data: {
      type: "message",
      userId: String(userId),
    },
  });
  // Also send Web Push (mobile browser)
  try {
    const { pushNewMessage } = await import("../webPush");
    await pushNewMessage(userId, senderName, `เกี่ยวกับสินค้า: ${productTitle}`);
  } catch (e) { /* ignore */ }
  return result;
}

/**
 * Send notification for order status change
 */
export async function notifyOrderStatusChange(
  userId: number,
  orderId: number,
  newStatus: string,
  productTitle: string
): Promise<boolean> {
  const statusLabel: Record<string, string> = {
    pending_payment: "รอชำระเงิน",
    waiting_buyer_confirm: "กรุณายอมรับเงื่อนไข COD",
    payment_confirmed: "ชำระเงินแล้ว",
    seller_confirmed: "ผู้ซื้อยอมรับแล้ว พร้อมจัดส่ง",
    shipped: "ส่งสินค้าแล้ว",
    delivered: "ได้รับสินค้าแล้ว",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิก",
    refunded: "คืนเงินแล้ว",
  };

  const result = await sendPushNotification(userId, {
    title: `สถานะคำสั่งซื้อเปลี่ยนแปลง`,
    body: `${productTitle}: ${statusLabel[newStatus] || newStatus}`,
    tag: `order-${orderId}`,
    data: {
      type: "order",
      orderId: String(orderId),
      status: newStatus,
    },
  });
  try {
    const { pushOrderStatusChange } = await import("../webPush");
    await pushOrderStatusChange(userId, orderId, newStatus);
  } catch (e) { /* ignore */ }
  return result;
}

/**
 * Send notification for product sold
 */
export async function notifyProductSold(
  userId: number,
  productTitle: string,
  buyerName: string
): Promise<boolean> {
  const result = await sendPushNotification(userId, {
    title: "สินค้าขายแล้ว!",
    body: `${productTitle} ขายให้ ${buyerName}`,
    tag: "product-sold",
    data: {
      type: "product_sold",
    },
  });
  try {
    const { pushProductSold } = await import("../webPush");
    await pushProductSold(userId, productTitle, 0);
  } catch (e) { /* ignore */ }
  return result;
}

/**
 * Send notification for payment received
 */
export async function notifyPaymentReceived(
  userId: number,
  amount: number,
  productTitle: string
): Promise<boolean> {
  return sendPushNotification(userId, {
    title: "ได้รับเงินแล้ว",
    body: `${amount.toFixed(2)} บาท จาก ${productTitle}`,
    tag: "payment-received",
    data: {
      type: "payment_received",
      amount: String(amount),
    },
  });
}
