/**
 * Courier tracking webhook + lab simulator.
 * Events: PICKED_UP → SHIPPED, OUT_FOR_DELIVERY → in transit,
 * DELIVERED → สำเร็จ, RETURNED → return + restock if already packed.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { notifySeller } from '../ProductPromotionService';
import { commitPackedOrder, restoreReturnedOrder } from '../inventory/StockService';
import { normalizeCourierEvent, shippingFromCourierEvent, type CourierEvent } from '../inventory/stockMath';

export const COURIER_EVENTS = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'] as const;

export type CourierWebhookInput = {
  trackingNumber: string;
  event: string;
  occurredAt?: string;
  carrier?: string;
  payload?: unknown;
};

export function courierWebhookSecret() {
  return process.env.COURIER_WEBHOOK_SECRET?.trim() || '';
}

export function verifyCourierSignature(input: {
  trackingNumber: string;
  event: string;
  occurredAt: string;
  signature?: string;
}) {
  const secret = courierWebhookSecret();
  if (!secret) return true;
  const got = (input.signature ?? '').replace(/^sha256=/i, '').trim();
  if (!got) return false;
  const expected = createHmac('sha256', secret)
    .update(`${input.trackingNumber}|${input.event}|${input.occurredAt}`)
    .digest('hex');
  const a = Buffer.from(got, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function eventHeadline(event: CourierEvent, tracking: string) {
  if (event === 'PICKED_UP') return `ขนส่งรับพัสดุแล้ว · ${tracking}`;
  if (event === 'OUT_FOR_DELIVERY') return `กำลังนำส่ง · ${tracking}`;
  if (event === 'DELIVERED') return `ส่งถึงแล้ว · ${tracking}`;
  return `พัสดุตีกลับ · ${tracking}`;
}

export async function applyCourierTrackingEvent(input: CourierWebhookInput) {
  const trackingNumber = input.trackingNumber.trim();
  if (!trackingNumber) throw new AppError('VALIDATION', 'trackingNumber required', 400);
  const event = normalizeCourierEvent(input.event);
  if (!event) {
    throw new AppError('VALIDATION', 'event must be PICKED_UP | OUT_FOR_DELIVERY | DELIVERED | RETURNED', 400);
  }
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) throw new AppError('VALIDATION', 'occurredAt invalid', 400);
  const carrier = (input.carrier ?? 'Kerry').trim() || 'Kerry';
  const mapped = shippingFromCourierEvent(event);

  const existing = await prisma.shipmentTrackingEvent.findUnique({
    where: {
      trackingNumber_event_occurredAt: { trackingNumber, event, occurredAt },
    },
  });
  if (existing?.processed) {
    return { ok: true as const, duplicate: true, trackingNumber, event, orderIds: existing.orderIdsJson };
  }

  const orders = await prisma.commerceOrder.findMany({
    where: { trackingNumber },
  });
  if (!orders.length) {
    throw new AppError('NOT_FOUND', `ไม่พบออเดอร์สำหรับเลขพัสดุ ${trackingNumber}`, 404);
  }

  const orderIds = orders.map((row) => row.id);
  await prisma.$transaction(async (tx) => {
    await tx.shipmentTrackingEvent.upsert({
      where: {
        trackingNumber_event_occurredAt: { trackingNumber, event, occurredAt },
      },
      create: {
        trackingNumber,
        carrier,
        event,
        occurredAt,
        payloadJson: (input.payload ?? input) as object,
        orderIdsJson: orderIds,
        processed: true,
      },
      update: {
        processed: true,
        orderIdsJson: orderIds,
        payloadJson: (input.payload ?? input) as object,
      },
    });

    for (const order of orders) {
      const nextStatus =
        mapped.orderStatus &&
        order.status !== 'COMPLETED' &&
        order.status !== 'REFUNDED' &&
        order.status !== 'CANCELLED'
          ? mapped.orderStatus
          : order.status;
      await tx.commerceOrder.update({
        where: { id: order.id },
        data: {
          courierEvent: event,
          shippingStatus: mapped.shippingStatus,
          shippingCarrier: order.shippingCarrier || carrier,
          status: nextStatus,
          shippedAt:
            mapped.shippingStatus === 'SHIPPED' || mapped.shippingStatus === 'DELIVERED'
              ? order.shippedAt ?? occurredAt
              : order.shippedAt,
          deliveredAt: event === 'DELIVERED' ? order.deliveredAt ?? occurredAt : order.deliveredAt,
          returnStatus: mapped.returnStatus ?? order.returnStatus,
          returnRequestedAt: mapped.returnStatus === 'REQUESTED' ? order.returnRequestedAt ?? occurredAt : order.returnRequestedAt,
        },
      });
    }
  });

  for (const order of orders) {
    try {
      if (event === 'RETURNED') await restoreReturnedOrder(order);
      else await commitPackedOrder(order);
    } catch {
      /* stock mutation best-effort after status write */
    }
  }

  for (const order of orders) {
    if (!order.merchantId) continue;
    try {
      await notifySeller({
        userId: order.merchantId,
        title: eventHeadline(event, trackingNumber),
        body: `ออเดอร์ ${order.id.slice(0, 8)} อัปเดตจากขนส่งโดยอัตโนมัติ`,
        kind: `courier_${event.toLowerCase()}`,
        refId: order.id,
      });
    } catch {
      /* inbox best-effort */
    }
  }

  return { ok: true as const, duplicate: false, trackingNumber, event, orderIds, shippingStatus: mapped.shippingStatus };
}

export async function listTrackingEvents(trackingNumber: string) {
  const rows = await prisma.shipmentTrackingEvent.findMany({
    where: { trackingNumber: trackingNumber.trim() },
    orderBy: { occurredAt: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    trackingNumber: row.trackingNumber,
    carrier: row.carrier,
    event: row.event,
    occurredAt: row.occurredAt.toISOString(),
    orderIds: row.orderIdsJson,
    processed: row.processed,
  }));
}
