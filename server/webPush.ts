import webpush from "web-push";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { pushSubscriptions } from "../drizzle/schema";
import { eq, and, like } from "drizzle-orm";

// Configure VAPID
function getWebPush() {
  if (!ENV.vapidPublicKey || !ENV.vapidPrivateKey) {
    console.warn("[WebPush] VAPID keys not configured");
    return null;
  }
  webpush.setVapidDetails(
    "mailto:support@boommall.app",
    ENV.vapidPublicKey,
    ENV.vapidPrivateKey
  );
  return webpush;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Save subscription to database
export async function saveWebPushSubscription(
  userId: number,
  subscription: WebPushSubscription
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const subscriptionJson = JSON.stringify({
    endpoint: subscription.endpoint,
    keys: subscription.keys,
  });

  // Check if already exists for this user with this endpoint
  const existing = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  // Find matching subscription by endpoint
  const match = existing.find((sub) => {
    try {
      const parsed = JSON.parse(sub.fcmToken);
      return parsed.endpoint === subscription.endpoint;
    } catch {
      return sub.fcmToken === subscription.endpoint;
    }
  });

  if (match) {
    // Update existing — refresh keys and mark active
    await db
      .update(pushSubscriptions)
      .set({
        fcmToken: subscriptionJson,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(pushSubscriptions.id, match.id));
    console.log(`[WebPush] Updated subscription for userId=${userId}`);
  } else {
    // Insert new
    await db.insert(pushSubscriptions).values({
      userId,
      fcmToken: subscriptionJson,
      isActive: true,
    });
    console.log(`[WebPush] New subscription saved for userId=${userId}`);
  }
}

// Remove subscription from database
export async function removeWebPushSubscription(
  userId: number,
  endpoint: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  for (const sub of subs) {
    try {
      const parsed = JSON.parse(sub.fcmToken);
      if (parsed.endpoint === endpoint) {
        await db
          .update(pushSubscriptions)
          .set({ isActive: false })
          .where(eq(pushSubscriptions.id, sub.id));
      }
    } catch {
      // Legacy format: fcmToken is the endpoint string directly
      if (sub.fcmToken === endpoint) {
        await db
          .update(pushSubscriptions)
          .set({ isActive: false })
          .where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }
}

// Send push notification to a specific user
export async function sendWebPush(
  userId: number,
  payload: { title: string; body: string; url?: string; icon?: string }
): Promise<void> {
  const wp = getWebPush();
  if (!wp) {
    console.warn(`[WebPush] Cannot send — VAPID not configured`);
    return;
  }

  const db = await getDb();
  if (!db) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.isActive, true)
      )
    );

  if (subs.length === 0) {
    console.log(`[WebPush] No active subscriptions for userId=${userId}`);
    return;
  }

  const payloadStr = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    icon: payload.icon ?? "/icon-192x192.png",
    badge: "/icon-72x72.png",
    timestamp: Date.now(),
  });

  const results = await Promise.allSettled(
    subs.map(async (sub: any) => {
      try {
        const parsed = JSON.parse(sub.fcmToken);
        // Support both old format (just endpoint string) and new format (JSON with keys)
        const subscription: webpush.PushSubscription = parsed.keys
          ? { endpoint: parsed.endpoint, keys: parsed.keys }
          : { endpoint: parsed, keys: { p256dh: "", auth: "" } };

        await wp.sendNotification(subscription, payloadStr);
      } catch (err: any) {
        // If subscription expired/invalid, mark inactive
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db
            .update(pushSubscriptions)
            .set({ isActive: false })
            .where(eq(pushSubscriptions.id, sub.id));
          console.log(`[WebPush] Marked subscription ${sub.id} as inactive (expired)`);
        }
        throw err;
      }
    })
  );

  const failed = results.filter((r: any) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(`[WebPush] ${failed.length}/${subs.length} notifications failed for userId=${userId}`);
  } else {
    console.log(`[WebPush] Sent ${subs.length} notifications to userId=${userId}`);
  }
}

// Convenience wrappers
export async function pushNewMessage(userId: number, senderName: string, preview: string) {
  await sendWebPush(userId, {
    title: `💬 ข้อความจาก ${senderName}`,
    body: preview.length > 80 ? preview.slice(0, 80) + "…" : preview,
    url: "/chats",
  });
}

export async function pushOrderStatusChange(userId: number, orderId: number, newStatus: string) {
  const statusLabels: Record<string, string> = {
    payment_confirmed: "ยืนยันการชำระเงินแล้ว",
    seller_confirmed: "ผู้ขายยืนยันรับออเดอร์แล้ว",
    shipped: "สินค้าถูกจัดส่งแล้ว",
    completed: "คำสั่งซื้อเสร็จสิ้น",
    cancelled: "คำสั่งซื้อถูกยกเลิก",
  };
  const label = statusLabels[newStatus] ?? `สถานะ: ${newStatus}`;
  await sendWebPush(userId, {
    title: `📦 คำสั่งซื้อ #${orderId}`,
    body: label,
    url: `/my-orders`,
  });
}

export async function pushProductSold(userId: number, productTitle: string, orderId: number) {
  await sendWebPush(userId, {
    title: "🎉 สินค้าของคุณขายได้แล้ว!",
    body: productTitle.length > 60 ? productTitle.slice(0, 60) + "…" : productTitle,
    url: `/seller/orders`,
  });
}

// New: notify seller of new COD order
export async function pushNewCodOrder(sellerId: number, productTitle: string, buyerName: string) {
  await sendWebPush(sellerId, {
    title: "🛒 มีออเดอร์ COD ใหม่!",
    body: `${buyerName} สั่งซื้อ: ${productTitle.length > 40 ? productTitle.slice(0, 40) + "…" : productTitle}`,
    url: "/seller/orders",
  });
}
