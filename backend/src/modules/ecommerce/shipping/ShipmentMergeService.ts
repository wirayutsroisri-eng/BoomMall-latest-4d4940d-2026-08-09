import { randomBytes, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import {
  formatAddress,
  isUnshippedPaid,
  mergeSameAddressOrders,
  parseShippingJson,
  snapshotMergeKey,
  type MergeableOrder,
  type MergeableOrderLine,
  type MergedShipment,
} from './addressMerge';
import { renderShippingLabelHtml, type LabelPageModel, type LabelShop } from './labelTemplate';
import { renderShippingLabelsPdf, toLabelPage } from './ShippingLabelPdfService';
import { renderCode128Png, renderQrPng, trackingScanPayload } from './barcodes';
import { commitPackedOrderIds } from '../inventory/StockService';

const PRINTABLE = new Set(['PAID']);
const NOT_YET_SHIPPED = new Set(['', 'PENDING', 'PACKED']);

export type PrintPackingLine = {
  title?: string;
  option?: string;
  sku?: string;
  qty: number;
  unitPrice?: number;
  productId?: string;
  imageUri?: string;
};

export type PrintLabelsInput = {
  merchantId: string;
  orderIds?: string[];
  carrier?: string;
  persist?: boolean;
  packingLines?: PrintPackingLine[];
};

function applyCardPackingLines(group: MergedShipment, lines: PrintPackingLine[]): MergedShipment {
  const packed = lines
    .filter((line) => line.qty > 0)
    .map((line) => {
      const qty = Math.max(0, Math.trunc(line.qty));
      const unitPrice = Number(line.unitPrice ?? 0) || 0;
      return {
        title: (line.title ?? line.sku ?? 'สินค้า').trim() || 'สินค้า',
        option: (line.option ?? '').trim(),
        sku: (line.sku ?? '').trim(),
        qty,
        unitPrice,
        lineTotal: qty * unitPrice,
        productId: line.productId,
        imageUri: line.imageUri,
      };
    });
  return {
    ...group,
    lines: packed,
    totalQty: packed.reduce((n, line) => n + line.qty, 0),
  };
}

function asLines(value: unknown): MergeableOrderLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const str = (k: string) => (typeof row[k] === 'string' ? row[k] : undefined);
    return {
      title: str('title') ?? str('name'),
      sku: str('sku'),
      label: str('label') ?? str('variantName'),
      color: str('color'),
      variant: str('variant') ?? str('variantName'),
      qty: Number(row.qty ?? row.quantity ?? 0) || 0,
      unitPrice: Number(row.unitPrice ?? row.price ?? 0) || 0,
      productId: str('productId'),
      imageUri: str('imageUri') ?? str('image'),
    };
  });
}

function toMergeable(row: {
  id: string;
  merchantId: string | null;
  status: string;
  shippingStatus: string | null;
  merchandiseThb: number;
  shippingFeeThb: number;
  linesJson: unknown;
  shippingJson: unknown;
  trackingNumber: string | null;
  shippingCarrier: string | null;
}): MergeableOrder | null {
  if (!row.merchantId) return null;
  return {
    id: row.id,
    merchantId: row.merchantId,
    status: row.status,
    shippingStatus: row.shippingStatus,
    merchandiseThb: row.merchandiseThb,
    shippingFeeThb: row.shippingFeeThb,
    shipping: parseShippingJson(row.shippingJson),
    lines: asLines(row.linesJson),
    trackingNumber: row.trackingNumber,
    shippingCarrier: row.shippingCarrier,
  };
}

export { snapshotMergeKey };

export function newTrackingNumber(carrier = 'Kerry'): string {
  const day = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = randomBytes(3).toString('hex').toUpperCase();
  const prefix = carrier.toUpperCase().startsWith('FLASH')
    ? 'FL'
    : carrier.toUpperCase().startsWith('J')
      ? 'JT'
      : carrier.toUpperCase().includes('POST')
        ? 'TH'
        : 'BM';
  return `${prefix}${day}${rand}`;
}

async function loadShop(merchantId: string): Promise<LabelShop> {
  const store = await prisma.store.findUnique({
    where: { id: merchantId },
    select: { name: true, address: true },
  });
  const product = await prisma.commerceProduct.findFirst({
    where: { merchantId, status: 'ACTIVE' },
    select: { shopName: true },
    orderBy: { updatedAt: 'desc' },
  });
  return {
    name: store?.name?.trim() || product?.shopName?.trim() || 'ร้านค้า Boom Mall',
    address: store?.address ?? null,
  };
}

async function loadPrintableOrders(merchantId: string, orderIds?: string[]) {
  const rows = await prisma.commerceOrder.findMany({
    where: {
      merchantId,
      status: { in: [...PRINTABLE] },
      ...(orderIds?.length ? { id: { in: orderIds } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 400,
  });
  return rows.filter((row) => NOT_YET_SHIPPED.has((row.shippingStatus ?? '').toUpperCase()));
}

export async function previewMergedShipments(merchantId: string, orderIds?: string[]) {
  const rows = await loadPrintableOrders(merchantId, orderIds);
  const mergeable = rows.map(toMergeable).filter((row): row is MergeableOrder => Boolean(row));
  const groups = mergeSameAddressOrders(mergeable);
  return {
    merchantId,
    scanned: rows.length,
    mergedCount: groups.filter((g) => g.orderIds.length > 1).length,
    labelCount: groups.length,
    groups: groups.map((g) => ({
      addressKey: g.addressKey,
      orderIds: g.orderIds,
      recipientName: g.recipient.name,
      recipientPhone: g.recipient.phone,
      address: formatAddress(g.recipient),
      paymentKind: g.paymentKind,
      codAmountThb: g.codAmountThb,
      totalQty: g.totalQty,
      netTotalThb: g.netTotalThb,
      lineCount: g.lines.length,
      trackingNumber: g.trackingNumber ?? null,
    })),
  };
}

async function persistGroups(
  merchantId: string,
  groups: MergedShipment[],
  carrier: string,
): Promise<LabelPageModel[]> {
  const shop = await loadShop(merchantId);
  const printedAt = new Date();
  const pages: LabelPageModel[] = [];

  await prisma.$transaction(async (tx) => {
    for (const group of groups) {
      const tracking = group.trackingNumber || newTrackingNumber(carrier);
      const existing = await tx.shipmentGroup.findUnique({
        where: { merchantId_trackingNumber: { merchantId, trackingNumber: tracking } },
      });
      const id = existing?.id ?? randomUUID();
      await tx.shipmentGroup.upsert({
        where: { merchantId_trackingNumber: { merchantId, trackingNumber: tracking } },
        create: {
          id,
          merchantId,
          addressMergeKey: group.addressKey,
          trackingNumber: tracking,
          shippingCarrier: carrier,
          orderIdsJson: group.orderIds as Prisma.InputJsonValue,
          paymentKind: group.paymentKind,
          codAmountThb: group.codAmountThb,
          printedAt,
        },
        update: {
          addressMergeKey: group.addressKey,
          shippingCarrier: carrier,
          orderIdsJson: group.orderIds as Prisma.InputJsonValue,
          paymentKind: group.paymentKind,
          codAmountThb: group.codAmountThb,
          printedAt,
        },
      });
      await tx.commerceOrder.updateMany({
        where: { id: { in: group.orderIds }, merchantId },
        data: {
          trackingNumber: tracking,
          shippingCarrier: carrier,
          shippingStatus: 'PACKED',
          shipmentGroupId: id,
          addressMergeKey: group.addressKey,
        },
      });
      await commitPackedOrderIds(group.orderIds, tx);
      pages.push(
        toLabelPage(
          { ...group, trackingNumber: tracking, shippingCarrier: carrier },
          shop,
          printedAt,
        ),
      );
    }
  });

  return pages;
}

async function pagesWithoutPersist(
  merchantId: string,
  groups: MergedShipment[],
  carrier: string,
): Promise<LabelPageModel[]> {
  const shop = await loadShop(merchantId);
  const printedAt = new Date();
  return groups.map((group) =>
    toLabelPage(
      {
        ...group,
        trackingNumber: group.trackingNumber || newTrackingNumber(carrier),
        shippingCarrier: group.shippingCarrier || carrier,
      },
      shop,
      printedAt,
    ),
  );
}

export async function printMergedLabels(input: PrintLabelsInput): Promise<{
  filename: string;
  contentType: string;
  buffer: Buffer;
  groups: number;
  orders: number;
}> {
  const merchantId = input.merchantId.trim();
  if (!merchantId) throw new AppError('VALIDATION', 'merchantId required', 400);
  const carrier = (input.carrier ?? 'Kerry').trim() || 'Kerry';
  const rows = await loadPrintableOrders(merchantId, input.orderIds);
  const mergeable = rows.map(toMergeable).filter((row): row is MergeableOrder => Boolean(row));
  let groups = mergeSameAddressOrders(mergeable);
  if (input.packingLines?.length && groups.length) {
    const ids = input.orderIds ?? [];
    const at = ids.length
      ? groups.findIndex((group) => group.orderIds.some((id) => ids.includes(id)))
      : 0;
    if (at >= 0) {
      groups = groups.map((group, index) =>
        index === at ? applyCardPackingLines(group, input.packingLines!) : group,
      );
    }
  }
  if (!groups.length) {
    throw new AppError('NOT_FOUND', 'ไม่มีออเดอร์ PAID ที่รอจัดส่งสำหรับพิมพ์ใบปะหน้า', 404);
  }
  const persist = input.persist !== false;
  const pages = persist
    ? await persistGroups(merchantId, groups, carrier)
    : await pagesWithoutPersist(merchantId, groups, carrier);
  const buffer = await renderShippingLabelsPdf(pages);
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `boommall-labels-${stamp}-${pages.length}pcs.pdf`,
    contentType: 'application/pdf',
    buffer,
    groups: pages.length,
    orders: groups.reduce((n, g) => n + g.orderIds.length, 0),
  };
}

export async function renderMergedLabelsHtml(input: PrintLabelsInput): Promise<string> {
  const merchantId = input.merchantId.trim();
  const carrier = (input.carrier ?? 'Kerry').trim() || 'Kerry';
  const rows = await loadPrintableOrders(merchantId, input.orderIds);
  const mergeable = rows.map(toMergeable).filter((row): row is MergeableOrder => Boolean(row));
  const groups = mergeSameAddressOrders(mergeable);
  const pages = await pagesWithoutPersist(merchantId, groups, carrier);
  const images = new Map<string, { barcode: string; qr: string }>();
  await Promise.all(
    pages.map(async (page) => {
      const payload = trackingScanPayload({
        trackingNumber: page.trackingNumber,
        carrier: page.shippingCarrier,
        orderIds: page.orderIds,
      });
      const [barcode, qr] = await Promise.all([
        renderCode128Png(page.trackingNumber, 2),
        renderQrPng(payload, 3),
      ]);
      images.set(page.trackingNumber, {
        barcode: `data:image/png;base64,${barcode.toString('base64')}`,
        qr: `data:image/png;base64,${qr.toString('base64')}`,
      });
    }),
  );
  return renderShippingLabelHtml(pages, images);
}

export function isPrintablePaid(status: string, shippingStatus?: string | null) {
  return isUnshippedPaid({ status, shippingStatus });
}
