import type { IncomingOrder, ShippingSpeed } from './types';

export type FulfillmentRank = 1 | 2 | 3;

export type FulfillmentPriority = {
  rank: FulfillmentRank;
  urgent: boolean;
  express: boolean;
  overdue: boolean;
  remainingMs: number;
  packByAt: number;
  placedAtMs: number;
  countdownLabel: string;
  badgeLabel: string;
};

const EXPRESS_SLA_MS = 4 * 60 * 60 * 1000;
const STANDARD_SLA_MS = 24 * 60 * 60 * 1000;
const RISK_WINDOW_MS = 2 * 60 * 60 * 1000;
const FRESH_MS = 30 * 60 * 1000;

export function slaMsFor(speed?: ShippingSpeed) {
  return speed === 'express' ? EXPRESS_SLA_MS : STANDARD_SLA_MS;
}

export function placedAtMsOf(order: Pick<IncomingOrder, 'placedAtIso' | 'placedAt'>): number {
  if (order.placedAtIso) {
    const ms = Date.parse(order.placedAtIso);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

export function provinceFromAddress(address?: string, fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  const raw = (address ?? '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/จังหวัด/g, 'จ.').replace(/จ\.\s*/g, '');
  const beforeZip = normalized.match(/([ก-๙A-Za-z]+)(?:\s+\d{5})\s*$/);
  if (beforeZip?.[1]) return beforeZip[1];
  return '';
}

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'เลยกำหนดแพ็คแล้ว';
  const totalMin = Math.round(remainingMs / 60000);
  if (totalMin < 60) return `เหลือเวลาแพ็ค ${totalMin} นาที`;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `เหลือเวลาแพ็ค ${days} วัน`;
  }
  return mins > 0 ? `เหลือเวลาแพ็ค ${hours} ชม. ${mins} นาที` : `เหลือเวลาแพ็ค ${hours} ชม.`;
}

export function fulfillmentPriorityOf(
  order: IncomingOrder,
  now = Date.now(),
): FulfillmentPriority {
  const placedAtMs = placedAtMsOf(order);
  const express = order.shippingSpeed === 'express';
  const packByAt = placedAtMs + slaMsFor(order.shippingSpeed);
  const remainingMs = packByAt - now;
  const overdue = remainingMs <= 0;
  const slaRisk = remainingMs <= RISK_WINDOW_MS;
  const urgent = express || overdue || slaRisk;
  const fresh = now - placedAtMs <= FRESH_MS;
  const rank: FulfillmentRank = urgent ? 1 : !fresh ? 2 : 3;

  return {
    rank,
    urgent,
    express,
    overdue,
    remainingMs,
    packByAt,
    placedAtMs,
    countdownLabel: formatCountdown(remainingMs),
    badgeLabel: overdue
      ? '🔥 เลยกำหนด / รีบจัดส่ง'
      : express
        ? '🔥 ส่งด่วน / รีบจัดส่ง'
        : slaRisk
          ? '🔥 ใกล้หมดเวลา / รีบจัดส่ง'
          : rank === 2
            ? 'รอคิว FIFO'
            : 'เข้าใหม่',
  };
}

/** 1) ส่งด่วน/ใกล้เลยกำหนด  2) เข้ามาก่อน (FIFO)  3) เพิ่งเข้าใหม่ */
export function sortFulfillmentQueue<T extends IncomingOrder>(orders: T[], now = Date.now()): T[] {
  return [...orders].sort((a, b) => {
    const pa = fulfillmentPriorityOf(a, now);
    const pb = fulfillmentPriorityOf(b, now);
    if (pa.rank !== pb.rank) return pa.rank - pb.rank;
    if (pa.rank === 1) return pa.remainingMs - pb.remainingMs;
    if (pa.rank === 2) return pa.placedAtMs - pb.placedAtMs;
    return pb.placedAtMs - pa.placedAtMs;
  });
}
