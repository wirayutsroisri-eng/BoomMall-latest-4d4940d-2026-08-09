/**
 * Consolidated warehouse pick list — one A4 page wave for every SKU in รอแพ็ก.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { isUnshippedPaid, parseShippingJson } from './addressMerge';

export type PickListLineInput = {
  title?: string;
  option?: string;
  sku?: string;
  qty: number;
  warehouseId?: string;
  orderId?: string;
  imageUri?: string;
};

export type PickListRow = {
  sku: string;
  title: string;
  option: string;
  qty: number;
  warehouseId: string;
  orderIds: string[];
};

export function consolidatePickLines(lines: PickListLineInput[]): PickListRow[] {
  const map = new Map<string, PickListRow>();
  for (const line of lines) {
    const qty = Math.max(0, Math.trunc(line.qty));
    if (qty <= 0) continue;
    const title = (line.title ?? line.sku ?? 'สินค้า').trim() || 'สินค้า';
    const option = (line.option ?? '').trim();
    const sku = (line.sku ?? '').trim() || title;
    const warehouseId = (line.warehouseId ?? 'WH-CTI-MAIN').trim() || 'WH-CTI-MAIN';
    const key = `${warehouseId}|${sku}|${title}|${option}`.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.qty += qty;
      if (line.orderId && !existing.orderIds.includes(line.orderId)) existing.orderIds.push(line.orderId);
      continue;
    }
    map.set(key, {
      sku,
      title,
      option,
      qty,
      warehouseId,
      orderIds: line.orderId ? [line.orderId] : [],
    });
  }
  return [...map.values()].sort((a, b) => {
    const wh = a.warehouseId.localeCompare(b.warehouseId, 'th');
    if (wh) return wh;
    const sku = a.sku.localeCompare(b.sku, 'th');
    if (sku) return sku;
    return a.title.localeCompare(b.title, 'th');
  });
}

function resolveThaiFonts() {
  const candidates = [
    path.join(process.cwd(), 'assets/fonts'),
    path.join(__dirname, '../../../../assets/fonts'),
    path.join(__dirname, '../../../../../assets/fonts'),
  ];
  for (const dir of candidates) {
    const regular = path.join(dir, 'NotoSansThai-Regular.ttf');
    const bold = path.join(dir, 'NotoSansThai-Bold.ttf');
    if (fs.existsSync(regular)) {
      return { regular, bold: fs.existsSync(bold) ? bold : null };
    }
  }
  return { regular: null, bold: null };
}

function shortId(id: string) {
  return id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() || id.slice(0, 6);
}

export async function loadPickListLines(merchantId: string, orderIds?: string[]): Promise<{
  rows: PickListRow[];
  orderCount: number;
  shopName: string;
}> {
  const rows = await prisma.commerceOrder.findMany({
    where: {
      merchantId,
      ...(orderIds?.length ? { id: { in: orderIds } } : { status: 'PAID' }),
    },
    orderBy: { createdAt: 'asc' },
  });
  const printable = rows.filter((row) => isUnshippedPaid(row) && (row.shippingStatus ?? '').toUpperCase() !== 'PACKED');
  const lines: PickListLineInput[] = [];
  for (const order of printable) {
    const raw = Array.isArray(order.linesJson) ? order.linesJson : [];
    for (const item of raw) {
      const line = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
      lines.push({
        title: typeof line.title === 'string' ? line.title : undefined,
        option: typeof line.label === 'string' ? line.label : typeof line.variant === 'string' ? line.variant : undefined,
        sku: typeof line.sku === 'string' ? line.sku : undefined,
        qty: Number(line.qty ?? 0) || 0,
        warehouseId: typeof line.warehouseId === 'string' ? line.warehouseId : undefined,
        orderId: order.id,
      });
    }
    if (!raw.length) {
      const ship = parseShippingJson(order.shippingJson);
      lines.push({
        title: ship.name || 'สินค้า',
        qty: 1,
        orderId: order.id,
      });
    }
  }
  const shop = await prisma.commerceProduct.findFirst({
    where: { merchantId },
    select: { shopName: true },
  });
  return {
    rows: consolidatePickLines(lines),
    orderCount: printable.length,
    shopName: shop?.shopName ?? merchantId,
  };
}

export async function renderPickListPdf(input: {
  shopName: string;
  rows: PickListRow[];
  orderCount: number;
}): Promise<Buffer> {
  if (!input.rows.length) throw new AppError('NOT_FOUND', 'ไม่มีสินค้าในคิวรอแพ็กสำหรับใบหยิบของ', 404);
  const fonts = resolveThaiFonts();
  const pieces = input.rows.reduce((n, row) => n + row.qty, 0);
  const printedAt = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (fonts.regular) doc.registerFont('Thai', fonts.regular);
    if (fonts.bold) doc.registerFont('ThaiBold', fonts.bold);
    const regular = fonts.regular ? 'Thai' : 'Helvetica';
    const bold = fonts.bold ? 'ThaiBold' : 'Helvetica-Bold';

    const ink = '#0B1F17';
    const mint = '#E8F7F0';
    const pageWidth = doc.page.width - 72;

    doc.rect(36, 36, pageWidth, 52).fill(ink);
    doc.fillColor('#00D68F').font(bold).fontSize(16).text('Boom Mall · ใบรวมรายการหยิบของ', 48, 46, { width: pageWidth - 24 });
    doc.fillColor('#FFFFFF').font(regular).fontSize(10).text(
      `${input.shopName}  ·  ${printedAt}  ·  ${input.orderCount} ออเดอร์  ·  ${input.rows.length} SKU  ·  ${pieces} ชิ้น`,
      48,
      68,
      { width: pageWidth - 24 },
    );

    let y = 104;
    const cols = [
      { x: 36, w: 22, label: '#' },
      { x: 58, w: 22, label: '' },
      { x: 84, w: 88, label: 'SKU' },
      { x: 176, w: 168, label: 'สินค้า / รุ่น' },
      { x: 348, w: 72, label: 'คลัง' },
      { x: 424, w: 36, label: 'หยิบ' },
      { x: 464, w: 96, label: 'ออเดอร์' },
    ];

    doc.rect(36, y, pageWidth, 20).fill(mint);
    doc.fillColor(ink).font(bold).fontSize(9);
    for (const col of cols) {
      if (col.label) doc.text(col.label, col.x, y + 5, { width: col.w });
    }
    y += 24;

    input.rows.forEach((row, index) => {
      if (y > doc.page.height - 64) {
        doc.addPage();
        y = 48;
      }
      doc.strokeColor('#D7E4DC').lineWidth(0.6);
      doc.rect(58, y + 2, 12, 12).stroke();
      doc.fillColor(ink).font(regular).fontSize(9);
      doc.text(String(index + 1), 36, y + 3, { width: 20 });
      doc.font(bold).text(row.sku, 84, y + 3, { width: 88 });
      doc.font(regular).text(row.option ? `${row.title} · ${row.option}` : row.title, 176, y + 3, {
        width: 168,
        height: 24,
      });
      doc.text(row.warehouseId, 348, y + 3, { width: 72 });
      doc.font(bold).fontSize(12).text(`x${row.qty}`, 424, y + 2, { width: 36 });
      doc.font(regular).fontSize(8).fillColor('#4A5C54').text(
        row.orderIds.map(shortId).join(' '),
        464,
        y + 3,
        { width: 96 },
      );
      y += 28;
    });

    doc.rect(36, doc.page.height - 48, pageWidth, 22).fill(ink);
    doc.fillColor('#00D68F').font(bold).fontSize(10).text(
      `รวมหยิบ ${pieces} ชิ้น · ${input.rows.length} รายการ · เดินเชลฟ์รอบเดียวแล้วมาแพ็กที่โต๊ะ`,
      48,
      doc.page.height - 42,
      { width: pageWidth - 24 },
    );

    doc.end();
  });
}

export async function printPickList(input: {
  merchantId: string;
  orderIds?: string[];
  lines?: PickListLineInput[];
}) {
  const merchantId = input.merchantId.trim();
  if (!merchantId) throw new AppError('VALIDATION', 'merchantId required', 400);

  let rows: PickListRow[];
  let orderCount: number;
  let shopName: string;
  if (input.lines?.length) {
    rows = consolidatePickLines(input.lines);
    orderCount = new Set(input.lines.map((line) => line.orderId).filter(Boolean)).size || input.orderIds?.length || 1;
    const shop = await prisma.commerceProduct.findFirst({
      where: { merchantId },
      select: { shopName: true },
    });
    shopName = shop?.shopName ?? merchantId;
  } else {
    const loaded = await loadPickListLines(merchantId, input.orderIds);
    rows = loaded.rows;
    orderCount = loaded.orderCount;
    shopName = loaded.shopName;
  }

  const buffer = await renderPickListPdf({ shopName, rows, orderCount });
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    filename: `boommall-picklist-${stamp}.pdf`,
    contentType: 'application/pdf',
    buffer,
    skuCount: rows.length,
    pieceCount: rows.reduce((n, row) => n + row.qty, 0),
    orderCount,
    rows,
  };
}
