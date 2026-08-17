/**
 * Boom Mall branded 4×6 in / 100×150 mm thermal shipping label + packing slip.
 * One sticker page per merged shipment. Bulk print = one PDF, many pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { formatAddress, type MergedShipment } from './addressMerge';
import { renderCode128Png, renderQrPng, trackingScanPayload } from './barcodes';
import {
  carrierMark,
  formatThb,
  productMark,
  shortOrderId,
  packingTotals,
  skuBadgeLabel,
  type LabelPageModel,
  type LabelShop,
} from './labelTemplate';

const MM = 72 / 25.4;
export const LABEL_WIDTH = 100 * MM;
export const LABEL_HEIGHT = 150 * MM;
const MARGIN = 9;

const INK = '#0B1F17';
const GREEN = '#00A86B';
const MINT = '#00D68F';
const MIST = '#E8F7F0';
const MUTED = '#4A5C54';

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

export function toLabelPage(group: MergedShipment, shop: LabelShop, printedAt = new Date()): LabelPageModel {
  return {
    ...group,
    trackingNumber: group.trackingNumber ?? `BM${printedAt.toISOString().slice(2, 10).replace(/-/g, '')}XXXX`,
    shippingCarrier: group.shippingCarrier ?? 'Kerry',
    shop,
    printedAt: printedAt.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
  };
}

export async function renderShippingLabelsPdf(pages: LabelPageModel[]): Promise<Buffer> {
  if (!pages.length) {
    throw new Error('no labels to print');
  }
  const fonts = resolveThaiFonts();
  const codes = await Promise.all(
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
      return { barcode, qr };
    }),
  );

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [LABEL_WIDTH, LABEL_HEIGHT],
      margin: 0,
      autoFirstPage: false,
      info: {
        Title: 'Boom Mall Shipping Labels',
        Author: 'Boom Mall',
        Subject: '4x6 thermal shipping label + packing slip',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (fonts.regular) doc.registerFont('Thai', fonts.regular);
    if (fonts.bold) doc.registerFont('ThaiBold', fonts.bold);
    const F = fonts.regular ? 'Thai' : 'Helvetica';
    const FB = fonts.bold ? 'ThaiBold' : fonts.regular ? 'Thai' : 'Helvetica-Bold';

    pages.forEach((page, index) => {
      doc.addPage({ size: [LABEL_WIDTH, LABEL_HEIGHT], margin: 0 });
      drawLabel(doc, page, codes[index]!, F, FB);
    });
    doc.end();
  });
}

function drawLabel(
  doc: PDFKit.PDFDocument,
  page: LabelPageModel,
  codes: { barcode: Buffer; qr: Buffer },
  F: string,
  FB: string,
) {
  const x = MARGIN;
  const w = LABEL_WIDTH - MARGIN * 2;
  let y = MARGIN;

  // Header
  const headerH = 30;
  doc.roundedRect(x, y, w, headerH, 5).fill(INK);
  doc.roundedRect(x + 6, y + 5.5, 19, 19, 3.5).fill(MINT);
  doc.fillColor(INK).font(FB).fontSize(13).text('B', x + 6, y + 8.2, { width: 19, align: 'center' });
  doc.fillColor('#FFFFFF').font(FB).fontSize(11).text('Boom Mall', x + 30, y + 6, { width: 140 });
  doc.fillColor(MINT).font(FB).fontSize(6).text('SHIPPING LABEL  ·  4×6', x + 30, y + 18, { width: 140 });
  doc.fillColor('#FFFFFF').font(FB).fontSize(8).text(carrierMark(page.shippingCarrier), x + w - 86, y + 7, {
    width: 80,
    align: 'right',
  });
  doc.fillColor('#9BE7C8').font(F).fontSize(6).text('ขนส่ง', x + w - 86, y + 18, { width: 80, align: 'right' });
  y += headerH + 6;

  // Tracking + barcode + QR
  const qrSize = 48;
  const trackW = w - qrSize - 6;
  doc.fillColor(INK).font(FB).fontSize(10).text(page.trackingNumber, x, y, { width: trackW });
  try {
    doc.image(codes.barcode, x, y + 13, { width: trackW, height: 32 });
  } catch {
    doc.rect(x, y + 13, trackW, 32).stroke(INK);
  }
  try {
    doc.image(codes.qr, x + trackW + 6, y, { width: qrSize, height: qrSize });
  } catch {
    doc.rect(x + trackW + 6, y, qrSize, qrSize).stroke(INK);
  }
  y += qrSize + 6;

  // Payment badge — solid black / outlined COD for thermal contrast
  const badgeH = 16;
  const isCod = page.paymentKind === 'COD' || page.paymentKind === 'MIXED';
  if (isCod) {
    doc.roundedRect(x, y, w, badgeH, 3).lineWidth(1.6).stroke(INK);
  } else {
    doc.roundedRect(x, y, w, badgeH, 3).fill(INK);
  }
  const badgeText = isCod
    ? `เก็บเงินปลายทาง (COD: ${formatThb(page.codAmountThb)})${page.paymentKind === 'MIXED' ? ' · มีรายการชำระแล้ว' : ''}`
    : 'ชำระเงินแล้ว (PAID)';
  doc
    .fillColor(isCod ? INK : '#FFFFFF')
    .font(FB)
    .fontSize(8)
    .text(badgeText, x, y + 3.6, { width: w, align: 'center' });
  y += badgeH + 5;

  // Sender / Recipient
  const boxH = 58;
  const gap = 5;
  const boxW = (w - gap) / 2;
  drawPartyBox(doc, x, y, boxW, boxH, 'ผู้ส่ง  ·  FROM', page.shop.name, page.shop.phone ?? '', page.shop.address ?? '', F, FB, false);
  drawPartyBox(
    doc,
    x + boxW + gap,
    y,
    boxW,
    boxH,
    'ผู้รับ  ·  SHIP TO',
    page.recipient.name,
    page.recipient.phone,
    formatAddress(page.recipient),
    F,
    FB,
    true,
  );
  y += boxH + 5;

  doc
    .fillColor(INK)
    .font(F)
    .fontSize(6.5)
    .text(`รวม ${page.orderIds.length} คำสั่งซื้อ  ·  Order ID  ${page.orderIds.map(shortOrderId).join('  ·  ')}`, x, y, {
      width: w,
    });
  y += 12;

  // Packing slip — remaining space minus footer
  const footerH = 22;
  const tableBottom = LABEL_HEIGHT - MARGIN - footerH;
  drawPackingTable(doc, page, x, y, w, tableBottom, F, FB);

  // Footer
  const fy = LABEL_HEIGHT - MARGIN - 16;
  doc.fillColor(GREEN).font(FB).fontSize(7.5).text('Thank you for shopping on Boom Mall', x, fy, {
    width: w,
    align: 'center',
  });
  doc.fillColor(MUTED).font(F).fontSize(5.5).text(`boommall.com  ·  พิมพ์ ${page.printedAt}`, x, fy + 10, {
    width: w,
    align: 'center',
  });
}

function drawPartyBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  kicker: string,
  name: string,
  phone: string,
  address: string,
  F: string,
  FB: string,
  highlight: boolean,
) {
  if (highlight) doc.roundedRect(x, y, w, h, 3.5).fill(MIST);
  doc.roundedRect(x, y, w, h, 3.5).lineWidth(1).stroke(INK);
  const pad = 4;
  doc.fillColor(MUTED).font(FB).fontSize(5.5).text(kicker, x + pad, y + 3.5, { width: w - pad * 2 });
  doc.fillColor(INK).font(FB).fontSize(8.5).text(name || '—', x + pad, y + 12, {
    width: w - pad * 2,
    height: 20,
    ellipsis: true,
  });
  if (phone) {
    doc.font(FB).fontSize(7).text(phone, x + pad, y + 30, { width: w - pad * 2, height: 10, ellipsis: true });
  }
  doc.font(F).fontSize(6.2).text(address, x + pad, y + 40, {
    width: w - pad * 2,
    height: h - 44,
    ellipsis: true,
  });
}

function drawPackingTable(
  doc: PDFKit.PDFDocument,
  page: LabelPageModel,
  x: number,
  y: number,
  w: number,
  bottom: number,
  F: string,
  FB: string,
) {
  const cols = { chk: 14, ico: 16, item: w - 14 - 16 - 52 - 22, opt: 52, qty: 22 };
  const headH = 12;
  const summaryH = 14;
  const rowH = 14;

  doc.rect(x, y, w, headH).fill(INK);
  doc.fillColor('#FFFFFF').font(FB).fontSize(5.6);
  let cx = x + 2;
  doc.text('[ ]', cx, y + 2.6, { width: cols.chk });
  cx += cols.chk + cols.ico;
  doc.text('จัดของ · สินค้า', cx, y + 2.6, { width: cols.item });
  cx += cols.item;
  doc.text('ตัวเลือก', cx, y + 2.6, { width: cols.opt });
  cx += cols.opt;
  doc.text('ชิ้น', cx, y + 2.6, { width: cols.qty - 2, align: 'right' });

  let rowY = y + headH;
  const maxBody = bottom - summaryH - rowY;
  const maxRows = Math.min(6, Math.max(1, Math.floor(maxBody / rowH)));
  const visible = page.lines.slice(0, maxRows);
  const hidden = page.lines.length - visible.length;

  visible.forEach((line) => {
    doc.rect(x, rowY, w, rowH).lineWidth(0.6).stroke(INK);
    const padY = rowY + 3.2;
    doc.lineWidth(1.2).rect(x + 3, rowY + 3.4, 8, 8).stroke(INK);
    doc.rect(x + cols.chk + 2, rowY + 2.6, 11, 11).stroke(INK);
    doc.fillColor(INK).font(FB).fontSize(6.2).text(productMark(line.title), x + cols.chk + 2, rowY + 4.2, {
      width: 11,
      align: 'center',
    });
    const itemX = x + cols.chk + cols.ico + 2;
    doc.font(FB).fontSize(6).text(line.title, itemX, padY, {
      width: cols.item - 2,
      height: 9,
      ellipsis: true,
    });
    const opt = skuBadgeLabel(line.option) || line.sku || '—';
    doc.font(FB).fontSize(6).text(opt, itemX + cols.item, padY, {
      width: cols.opt,
      height: 9,
      ellipsis: true,
    });
    doc.font(FB).fontSize(7).text(`x${line.qty}`, itemX + cols.item + cols.opt, padY, {
      width: cols.qty - 4,
      align: 'right',
    });
    rowY += rowH;
  });

  if (hidden > 0) {
    doc.fillColor(INK).font(F).fontSize(5.4).text(`+ อีก ${hidden} รายการ รวมในยอดสุทธิแล้ว`, x + 3, rowY + 1, {
      width: w - 6,
    });
  }

  doc.rect(x, bottom - summaryH, w, summaryH).fill(INK);
  doc
    .fillColor('#FFFFFF')
    .font(FB)
    .fontSize(6.5)
    .text(packingTotals(page.lines).label, x + 4, bottom - summaryH + 3.4, {
      width: w / 2,
    });
  doc.text(`ยอดสุทธิ ${formatThb(page.netTotalThb)}`, x + w / 2, bottom - summaryH + 3.4, {
    width: w / 2 - 4,
    align: 'right',
  });
}
