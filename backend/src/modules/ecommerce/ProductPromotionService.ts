/**
 * Product promotion (warehouse boost) — seller requests, admin reviews.
 * Payment stays pending until a real PSP/admin confirms; never fake-success.
 * Storage: Prisma when migrated, else data/product-promotions.json.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export const PROMOTION_PACKAGES = {
  boost_3d: { packageType: 'boost_3d', label: '3 วัน', priceThb: 199, durationDays: 3 },
  boost_7d: { packageType: 'boost_7d', label: '7 วัน', priceThb: 399, durationDays: 7 },
  boost_15d: { packageType: 'boost_15d', label: '15 วัน', priceThb: 699, durationDays: 15 },
  boost_30d: { packageType: 'boost_30d', label: '30 วัน', priceThb: 1190, durationDays: 30 },
} as const;

export type PromotionPackageType = keyof typeof PROMOTION_PACKAGES;
export type PaymentStatus = 'pending' | 'paid' | 'failed';
export type AdStatus = 'pending_review' | 'active' | 'expired' | 'rejected' | 'stopped';

export type ProductPromotionDto = {
  id: string;
  productId: string;
  userId: string;
  shopName: string | null;
  productTitle: string;
  productImageUrl: string | null;
  productMediaType: string | null;
  packageType: string;
  packageLabel: string;
  priceThb: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  paymentStatus: PaymentStatus;
  adStatus: AdStatus;
  paymentProofUrl: string | null;
  transactionId: string | null;
  rejectReason: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SellerNotificationDto = {
  id: string;
  userId: string;
  title: string;
  body: string;
  kind: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
};

type Store = {
  promotions: ProductPromotionDto[];
  notifications: SellerNotificationDto[];
};

const DATA_FILE = path.join(process.cwd(), 'data', 'product-promotions.json');

const OPEN_AD_STATUSES: AdStatus[] = ['pending_review', 'active'];

let promotedProductIds = new Set<string>();

export function getCachedPromotedProductIds() {
  return promotedProductIds;
}

function packageMeta(type: string) {
  const row = PROMOTION_PACKAGES[type as PromotionPackageType];
  if (!row) {
    throw new AppError('VALIDATION', 'package_type ไม่ถูกต้อง', 400);
  }
  return row;
}

function packageLabelOf(type: string) {
  return PROMOTION_PACKAGES[type as PromotionPackageType]?.label ?? type;
}

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { promotions: [], notifications: [] };
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Partial<Store>;
    return {
      promotions: parsed.promotions ?? [],
      notifications: parsed.notifications ?? [],
    };
  } catch {
    return { promotions: [], notifications: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.productPromotion.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

function mapRow(row: {
  id: string;
  productId: string;
  userId: string;
  shopName: string | null;
  productTitle: string;
  productImageUrl: string | null;
  productMediaType: string | null;
  packageType: string;
  priceThb: number;
  durationDays: number;
  startDate: Date | string | null;
  endDate: Date | string | null;
  paymentStatus: string;
  adStatus: string;
  paymentProofUrl: string | null;
  transactionId: string | null;
  rejectReason: string | null;
  adminNote: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ProductPromotionDto {
  return {
    id: row.id,
    productId: row.productId,
    userId: row.userId,
    shopName: row.shopName,
    productTitle: row.productTitle,
    productImageUrl: row.productImageUrl,
    productMediaType: row.productMediaType,
    packageType: row.packageType,
    packageLabel: packageLabelOf(row.packageType),
    priceThb: row.priceThb,
    durationDays: row.durationDays,
    startDate: row.startDate ? new Date(row.startDate).toISOString() : null,
    endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
    paymentStatus: row.paymentStatus as PaymentStatus,
    adStatus: row.adStatus as AdStatus,
    paymentProofUrl: row.paymentProofUrl,
    transactionId: row.transactionId,
    rejectReason: row.rejectReason,
    adminNote: row.adminNote,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function mapNote(row: {
  id: string;
  userId: string;
  title: string;
  body: string;
  kind: string;
  refId: string | null;
  read: boolean;
  createdAt: Date | string;
}): SellerNotificationDto {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    body: row.body,
    kind: row.kind,
    refId: row.refId,
    read: row.read,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

async function refreshPromotedCache() {
  try {
    const rows = await listPromotions({ adStatus: 'active' });
    promotedProductIds = new Set(rows.map((r) => r.productId));
  } catch {
    /* keep last cache */
  }
}

async function setCatalogPromoted(productId: string, isPromoted: boolean) {
  try {
    await prisma.catalogItem.updateMany({
      where: { id: productId },
      data: { isPromoted },
    });
  } catch {
    /* catalog row may not exist for local warehouse SKUs */
  }
}

export async function notifySeller(input: {
  userId: string;
  title: string;
  body: string;
  kind: string;
  refId?: string;
}) {
  const id = randomUUID();
  const createdAt = new Date();
  if (await prismaReady()) {
    try {
      await prisma.sellerNotification.create({
        data: {
          id,
          userId: input.userId,
          title: input.title,
          body: input.body,
          kind: input.kind,
          refId: input.refId,
        },
      });
      void import('../notify/PushService')
        .then(({ sendPushToUsers }) =>
          sendPushToUsers({
            userIds: [input.userId],
            title: input.title,
            body: input.body,
            data: {
              type: 'seller',
              kind: input.kind,
              notificationId: id,
              refId: input.refId ?? '',
            },
          }),
        )
        .catch(() => undefined);
      return;
    } catch {
      /* fall through to file */
    }
  }
  const store = readStore();
  store.notifications.unshift({
    id,
    userId: input.userId,
    title: input.title,
    body: input.body,
    kind: input.kind,
    refId: input.refId ?? null,
    read: false,
    createdAt: createdAt.toISOString(),
  });
  store.notifications = store.notifications.slice(0, 400);
  writeStore(store);
  void import('../notify/PushService')
    .then(({ sendPushToUsers }) =>
      sendPushToUsers({
        userIds: [input.userId],
        title: input.title,
        body: input.body,
        data: {
          type: 'seller',
          kind: input.kind,
          notificationId: id,
          refId: input.refId ?? '',
        },
      }),
    )
    .catch(() => undefined);
}

export function listPackages() {
  return Object.values(PROMOTION_PACKAGES);
}

export async function createPromotion(input: {
  userId: string;
  productId: string;
  productTitle: string;
  shopName?: string;
  productImageUrl?: string;
  productMediaType?: string;
  packageType: string;
  paymentProofUrl?: string;
  transactionId?: string;
}): Promise<ProductPromotionDto> {
  const userId = input.userId.trim();
  const productId = input.productId.trim();
  const productTitle = input.productTitle.trim();
  if (!userId || !productId || !productTitle) {
    throw new AppError('VALIDATION', 'user_id, product_id และชื่อสินค้าจำเป็น', 400);
  }
  const pkg = packageMeta(input.packageType);
  const existing = await listPromotions({ productId, userId });
  const open = existing.find((r) => OPEN_AD_STATUSES.includes(r.adStatus));
  if (open) {
    throw new AppError(
      'CONFLICT',
      open.adStatus === 'active'
        ? 'สินค้านี้อยู่ระหว่างโฆษณาอยู่แล้ว'
        : 'มีคำขอโฆษณาของสินค้านี้อยู่แล้ว รอแอดมินตรวจสอบ',
      409,
    );
  }

  const now = new Date();
  const dto: ProductPromotionDto = {
    id: randomUUID(),
    productId,
    userId,
    shopName: input.shopName?.trim() || null,
    productTitle,
    productImageUrl: input.productImageUrl?.trim() || null,
    productMediaType: input.productMediaType === 'video' ? 'video' : 'image',
    packageType: pkg.packageType,
    packageLabel: pkg.label,
    priceThb: pkg.priceThb,
    durationDays: pkg.durationDays,
    startDate: null,
    endDate: null,
    paymentStatus: 'pending',
    adStatus: 'pending_review',
    paymentProofUrl: input.paymentProofUrl?.trim() || null,
    transactionId: input.transactionId?.trim() || null,
    rejectReason: null,
    adminNote: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  if (await prismaReady()) {
    const row = await prisma.productPromotion.create({
      data: {
        id: dto.id,
        productId: dto.productId,
        userId: dto.userId,
        shopName: dto.shopName,
        productTitle: dto.productTitle,
        productImageUrl: dto.productImageUrl,
        productMediaType: dto.productMediaType,
        packageType: dto.packageType,
        priceThb: dto.priceThb,
        durationDays: dto.durationDays,
        paymentStatus: dto.paymentStatus,
        adStatus: dto.adStatus,
        paymentProofUrl: dto.paymentProofUrl,
        transactionId: dto.transactionId,
      },
    });
    return mapRow(row);
  }

  const store = readStore();
  store.promotions.unshift(dto);
  writeStore(store);
  return dto;
}

export async function listPromotions(opts?: {
  adStatus?: AdStatus | AdStatus[];
  userId?: string;
  productId?: string;
  limit?: number;
}): Promise<ProductPromotionDto[]> {
  const limit = Math.min(opts?.limit ?? 200, 500);
  const statuses = opts?.adStatus
    ? Array.isArray(opts.adStatus)
      ? opts.adStatus
      : [opts.adStatus]
    : undefined;

  if (await prismaReady()) {
    const rows = await prisma.productPromotion.findMany({
      where: {
        ...(statuses ? { adStatus: { in: statuses } } : {}),
        ...(opts?.userId ? { userId: opts.userId } : {}),
        ...(opts?.productId ? { productId: opts.productId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapRow);
  }

  return readStore()
    .promotions.filter((r) => {
      if (statuses && !statuses.includes(r.adStatus)) return false;
      if (opts?.userId && r.userId !== opts.userId) return false;
      if (opts?.productId && r.productId !== opts.productId) return false;
      return true;
    })
    .slice(0, limit);
}

async function getPromotionOrThrow(id: string): Promise<ProductPromotionDto> {
  if (await prismaReady()) {
    const row = await prisma.productPromotion.findUnique({ where: { id } });
    if (!row) throw new AppError('NOT_FOUND', 'ไม่พบคำขอโฆษณา', 404);
    return mapRow(row);
  }
  const row = readStore().promotions.find((r) => r.id === id);
  if (!row) throw new AppError('NOT_FOUND', 'ไม่พบคำขอโฆษณา', 404);
  return row;
}

async function persistPromotion(next: ProductPromotionDto): Promise<ProductPromotionDto> {
  const now = new Date();
  next.updatedAt = now.toISOString();
  if (await prismaReady()) {
    const row = await prisma.productPromotion.update({
      where: { id: next.id },
      data: {
        durationDays: next.durationDays,
        startDate: next.startDate ? new Date(next.startDate) : null,
        endDate: next.endDate ? new Date(next.endDate) : null,
        paymentStatus: next.paymentStatus,
        adStatus: next.adStatus,
        paymentProofUrl: next.paymentProofUrl,
        transactionId: next.transactionId,
        rejectReason: next.rejectReason,
        adminNote: next.adminNote,
      },
    });
    return mapRow(row);
  }
  const store = readStore();
  const idx = store.promotions.findIndex((r) => r.id === next.id);
  if (idx < 0) throw new AppError('NOT_FOUND', 'ไม่พบคำขอโฆษณา', 404);
  store.promotions[idx] = next;
  writeStore(store);
  return next;
}

export async function updatePromotionStatus(input: {
  id: string;
  action?: 'approve' | 'reject' | 'stop' | 'extend';
  adStatus?: AdStatus;
  rejectReason?: string;
  extraDays?: number;
  paymentStatus?: PaymentStatus;
  adminNote?: string;
  actor?: string;
}): Promise<ProductPromotionDto> {
  const current = await getPromotionOrThrow(input.id);
  const action =
    input.action ??
    (input.adStatus === 'active'
      ? 'approve'
      : input.adStatus === 'rejected'
        ? 'reject'
        : input.adStatus === 'stopped'
          ? 'stop'
          : input.adStatus === 'expired'
            ? 'stop'
            : undefined);

  if (!action) {
    throw new AppError('VALIDATION', 'ระบุ action: approve | reject | stop | extend', 400);
  }

  const next: ProductPromotionDto = { ...current };
  if (input.paymentStatus) next.paymentStatus = input.paymentStatus;
  if (input.adminNote != null) next.adminNote = input.adminNote;
  const now = new Date();

  if (action === 'approve') {
    if (current.adStatus === 'rejected') {
      throw new AppError('CONFLICT', 'รายการนี้ถูกปฏิเสธแล้ว — ให้ร้านค้าส่งคำขอใหม่', 409);
    }
    const start = now;
    const end = new Date(start.getTime() + current.durationDays * 86_400_000);
    next.adStatus = 'active';
    next.startDate = start.toISOString();
    next.endDate = end.toISOString();
    const saved = await persistPromotion(next);
    await setCatalogPromoted(current.productId, true);
    await notifySeller({
      userId: current.userId,
      title: 'โฆษณาของคุณเริ่มทำงานแล้ว',
      body: `สินค้า「${current.productTitle}」ถูกดันขึ้นฟีดแล้ว (${current.durationDays} วัน)`,
      kind: 'promotion_approved',
      refId: current.id,
    });
    await refreshPromotedCache();
    return saved;
  }

  if (action === 'reject') {
    const reason = input.rejectReason?.trim();
    if (!reason) {
      throw new AppError('VALIDATION', 'ต้องระบุเหตุผลเมื่อปฏิเสธ', 400);
    }
    next.adStatus = 'rejected';
    next.rejectReason = reason;
    const saved = await persistPromotion(next);
    await setCatalogPromoted(current.productId, false);
    await notifySeller({
      userId: current.userId,
      title: 'คำขอโฆษณาถูกปฏิเสธ',
      body: `สินค้า「${current.productTitle}」: ${reason}`,
      kind: 'promotion_rejected',
      refId: current.id,
    });
    await refreshPromotedCache();
    return saved;
  }

  if (action === 'stop') {
    next.adStatus = 'stopped';
    next.endDate = now.toISOString();
    const saved = await persistPromotion(next);
    await setCatalogPromoted(current.productId, false);
    await notifySeller({
      userId: current.userId,
      title: 'โฆษณาถูกปิดก่อนกำหนด',
      body: `สินค้า「${current.productTitle}」หยุดดันฟีดแล้ว`,
      kind: 'promotion_stopped',
      refId: current.id,
    });
    await refreshPromotedCache();
    return saved;
  }

  const extra = Math.max(1, Math.min(90, Math.round(input.extraDays ?? 7)));
  const base = next.endDate && new Date(next.endDate) > now ? new Date(next.endDate) : now;
  const end = new Date(base.getTime() + extra * 86_400_000);
  next.endDate = end.toISOString();
  next.adStatus = 'active';
  if (!next.startDate) next.startDate = now.toISOString();
  next.durationDays = current.durationDays + extra;
  const saved = await persistPromotion(next);
  await setCatalogPromoted(current.productId, true);
  await notifySeller({
    userId: current.userId,
    title: 'ขยายเวลาโฆษณาแล้ว',
    body: `สินค้า「${current.productTitle}」ถูกขยายอีก ${extra} วัน`,
    kind: 'promotion_extended',
    refId: current.id,
  });
  await refreshPromotedCache();
  return saved;
}

export async function expireDuePromotions(): Promise<{ expired: number }> {
  const now = new Date();
  const active = await listPromotions({ adStatus: 'active', limit: 500 });
  let expired = 0;
  for (const row of active) {
    if (!row.endDate || new Date(row.endDate) > now) continue;
    const next: ProductPromotionDto = { ...row, adStatus: 'expired' };
    await persistPromotion(next);
    await setCatalogPromoted(row.productId, false);
    await notifySeller({
      userId: row.userId,
      title: 'โฆษณาหมดอายุแล้ว',
      body: `สินค้า「${row.productTitle}」หยุดดันฟีดเพราะครบกำหนด`,
      kind: 'promotion_expired',
      refId: row.id,
    });
    expired += 1;
  }
  await refreshPromotedCache();
  return { expired };
}

export function startPromotionExpiryJob(intervalMs = 60_000) {
  void expireDuePromotions().catch((err) => {
    console.error('[promotions] expire job', err);
  });
  return setInterval(() => {
    void expireDuePromotions().catch((err) => {
      console.error('[promotions] expire job', err);
    });
  }, intervalMs);
}

export async function listSellerNotifications(userId: string, unreadOnly = false) {
  if (await prismaReady()) {
    try {
      const rows = await prisma.sellerNotification.findMany({
        where: { userId, ...(unreadOnly ? { read: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      return rows.map(mapNote);
    } catch {
      /* file fallback */
    }
  }
  return readStore()
    .notifications.filter((n) => n.userId === userId && (!unreadOnly || !n.read))
    .slice(0, 50);
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  if (await prismaReady()) {
    try {
      await prisma.sellerNotification.updateMany({
        where: { userId, ...(ids?.length ? { id: { in: ids } } : { read: false }) },
        data: { read: true },
      });
      return { ok: true as const };
    } catch {
      /* file fallback */
    }
  }
  const store = readStore();
  const idSet = ids?.length ? new Set(ids) : null;
  store.notifications = store.notifications.map((n) => {
    if (n.userId !== userId) return n;
    if (idSet && !idSet.has(n.id)) return n;
    return { ...n, read: true };
  });
  writeStore(store);
  return { ok: true as const };
}

export function promotionDomainStatus() {
  return {
    domain: 'product-promotions',
    packages: listPackages(),
    storage: 'postgresql',
    payment: 'pending_until_admin_or_psp',
  };
}
