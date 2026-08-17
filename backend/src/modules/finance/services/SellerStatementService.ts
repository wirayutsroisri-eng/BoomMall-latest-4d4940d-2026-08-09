/**
 * Seller Financial Statement — ใบสรุปยอดบัญชีร้านค้า (PDF / Excel)
 * ดึงเฉพาะข้อมูล storeId จาก JWT — ไม่รับ storeId จาก query
 */
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { toThb } from '../domain/escrowMath';

export type StatementPeriod = {
  from: Date;
  to: Date;
  label: string;
  month?: number;
  year?: number;
};

export type StatementLine = {
  date: string;
  orderId: string;
  gross: number;
  gp: number;
  net: number;
  releaseStatus: string;
  payoutStatus: string;
  paidOutAt: string | null;
};

export type SellerStatementBundle = {
  period: StatementPeriod;
  store: {
    id: string;
    name: string;
    taxId: string | null;
    address: string | null;
    bankName: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
    bankCode: string | null;
  };
  summary: {
    grossSales: number;
    platformGpFee: number;
    netEarningsPaid: number;
    netReleased: number;
    totalOrders: number;
    pendingOrders: number;
  };
  lines: StatementLine[];
  generatedAt: string;
};

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** แปลง query month/year หรือ from/to → งวด */
export function parseStatementPeriod(query: {
  month?: string | number;
  year?: string | number;
  from?: string;
  to?: string;
}): StatementPeriod {
  const fromQ = query.from ? String(query.from).trim() : '';
  const toQ = query.to ? String(query.to).trim() : '';
  if (fromQ && toQ) {
    const from = startOfDay(new Date(fromQ));
    const to = endOfDay(new Date(toQ));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new AppError('VALIDATION', 'ช่วงวันที่ไม่ถูกต้อง', 400);
    }
    return {
      from,
      to,
      label: `${from.toISOString().slice(0, 10)} – ${to.toISOString().slice(0, 10)}`,
    };
  }

  const now = new Date();
  const year = query.year != null ? Number(query.year) : now.getFullYear();
  const month = query.month != null ? Number(query.month) : now.getMonth() + 1;
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    throw new AppError('VALIDATION', 'year ไม่ถูกต้อง', 400);
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) {
    throw new AppError('VALIDATION', 'month ต้องเป็น 1–12', 400);
  }
  const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const to = new Date(year, month, 0, 23, 59, 59, 999);
  const mm = String(month).padStart(2, '0');
  return {
    from,
    to,
    label: `${mm}/${year}`,
    month,
    year,
  };
}

function payoutStatusLabel(row: {
  releaseStatus: string;
  paidOutAt: Date | null;
}): string {
  if (row.paidOutAt) return 'โอนแล้ว / Paid out';
  if (row.releaseStatus === 'HELD') return 'พัก escrow / Held';
  if (row.releaseStatus === 'RELEASED') return 'พร้อมถอน / Ready';
  if (row.releaseStatus === 'REFUNDED') return 'คืนเงิน / Refunded';
  if (row.releaseStatus === 'CANCELLED') return 'ยกเลิก / Cancelled';
  return row.releaseStatus;
}

export async function buildSellerStatement(
  storeId: string,
  period: StatementPeriod,
): Promise<SellerStatementBundle> {
  if (!storeId.trim()) throw new AppError('UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ', 401);

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new AppError('NOT_FOUND', 'ไม่พบร้านค้า', 404);

  const escrows = await prisma.orderEscrow.findMany({
    where: {
      storeId,
      createdAt: { gte: period.from, lte: period.to },
      releaseStatus: { not: 'CANCELLED' },
    },
    orderBy: { createdAt: 'asc' },
  });

  let grossSales = 0;
  let platformGpFee = 0;
  let netReleased = 0;
  let netEarningsPaid = 0;
  let pendingOrders = 0;

  const lines: StatementLine[] = escrows.map((e) => {
    const gross = toThb(e.grossAmount);
    const gp = toThb(e.gpAmount);
    const net = toThb(e.netMerchantAmount);
    grossSales += gross;
    platformGpFee += gp;
    if (e.releaseStatus === 'RELEASED' || e.paidOutAt) netReleased += net;
    if (e.paidOutAt) netEarningsPaid += net;
    if (e.releaseStatus === 'HELD') pendingOrders += 1;
    return {
      date: e.createdAt.toISOString(),
      orderId: e.orderId,
      gross,
      gp,
      net,
      releaseStatus: e.releaseStatus,
      payoutStatus: payoutStatusLabel(e),
      paidOutAt: e.paidOutAt?.toISOString() ?? null,
    };
  });

  return {
    period,
    store: {
      id: store.id,
      name: store.name || store.id,
      taxId: store.taxId,
      address: store.address,
      bankName: store.bankName,
      bankAccountNo: store.bankAccountNo,
      bankAccountName: store.bankAccountName,
      bankCode: store.bankCode,
    },
    summary: {
      grossSales: round2(grossSales),
      platformGpFee: round2(platformGpFee),
      netEarningsPaid: round2(netEarningsPaid),
      netReleased: round2(netReleased),
      totalOrders: lines.length,
      pendingOrders,
    },
    lines,
    generatedAt: new Date().toISOString(),
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function money(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      return {
        regular,
        bold: fs.existsSync(bold) ? bold : null,
      };
    }
  }
  return { regular: null, bold: null };
}

export async function renderSellerStatementPdf(bundle: SellerStatementBundle): Promise<Buffer> {
  const fonts = resolveThaiFonts();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: {
      Title: 'Merchant Financial Statement',
      Author: 'BoomMall',
      Subject: bundle.period.label,
    }});
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (fonts.regular) doc.registerFont('Thai', fonts.regular);
    if (fonts.bold) doc.registerFont('ThaiBold', fonts.bold);
    const F = fonts.regular ? 'Thai' : 'Helvetica';
    const FB = fonts.bold ? 'ThaiBold' : fonts.regular ? 'Thai' : 'Helvetica-Bold';

    // Header bar — แบรนด์ใช้ Helvetica (latin) หัวข้อไทยใช้ฟอนต์ไทย
    doc.rect(0, 0, doc.page.width, 72).fill('#0C7A52');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('BoomMall', 48, 22, { continued: false });
    doc.font('Helvetica').fontSize(9).text('Marketplace Settlement', 48, 46);

    doc.fillColor('#111111');
    doc.font(FB).fontSize(14).text(
      'ใบสรุปยอดขายและค่าบริการประจำเดือน',
      48,
      92,
      { width: doc.page.width - 96 },
    );
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text(
      'Merchant Financial Statement',
      48,
      doc.y + 2,
    );
    doc.moveDown(0.6);
    doc.fillColor('#111111').fontSize(10).text(`งวดรายงาน / Period: ${bundle.period.label}`);
    doc.text(
      `ออกเมื่อ / Generated: ${new Date(bundle.generatedAt).toLocaleString('th-TH')}`,
    );

    doc.moveDown(0.8);
    doc.font(FB).fontSize(11).text('ข้อมูลร้านค้า / Merchant');
    doc.font(F).fontSize(10);
    doc.text(`ชื่อร้าน: ${bundle.store.name}`);
    doc.text(`เลขประจำตัวผู้เสียภาษี: ${bundle.store.taxId || '—'}`);
    doc.text(`ที่อยู่: ${bundle.store.address || '—'}`);
    doc.text(`รหัสร้าน: ${bundle.store.id}`);
    doc.text(
      `บัญชีรับเงิน: ${bundle.store.bankName || '—'} · ${bundle.store.bankAccountNo || '—'} · ${bundle.store.bankAccountName || '—'}`,
    );

    doc.moveDown(0.8);
    doc.font(FB).fontSize(11).text('สรุปภาพรวม / Executive Summary');
    doc.moveDown(0.3);

    const summaryRows: Array<[string, string]> = [
      ['ยอดขายรวม (Gross Revenue)', `฿${money(bundle.summary.grossSales)}`],
      ['หัก: ค่าบริการแพลตฟอร์ม GP (Platform Commission Fee)', `฿${money(bundle.summary.platformGpFee)}`],
      ['ยอดเงินสุทธิหลังหัก GP (Net after GP)', `฿${money(round2(bundle.summary.grossSales - bundle.summary.platformGpFee))}`],
      ['ยอดเงินที่จ่ายให้ร้านค้าสุทธิ (Net Payout — transferred)', `฿${money(bundle.summary.netEarningsPaid)}`],
      ['จำนวนคำสั่งซื้อทั้งหมด (Total Orders)', String(bundle.summary.totalOrders)],
    ];

    const leftX = 48;
    const rightX = 360;
    for (const [label, value] of summaryRows) {
      const y = doc.y;
      doc.font(F).fontSize(9).fillColor('#333333').text(label, leftX, y, { width: 300 });
      doc.font(FB).fontSize(9).fillColor('#111111').text(value, rightX, y, { width: 160, align: 'right' });
      doc.moveDown(0.55);
      doc
        .moveTo(leftX, doc.y - 2)
        .lineTo(doc.page.width - 48, doc.y - 2)
        .strokeColor('#e8e8ed')
        .stroke();
    }

    doc.moveDown(0.8);
    doc.font(FB).fontSize(11).fillColor('#111111').text('รายการแจกแจง / Transaction Breakdown');
    doc.moveDown(0.35);

    const cols = [
      { w: 72, h: 'วันที่' },
      { w: 90, h: 'Order ID' },
      { w: 70, h: 'มูลค่า' },
      { w: 55, h: 'GP' },
      { w: 70, h: 'สุทธิ' },
      { w: 110, h: 'สถานะโอน' },
    ];
    let x = leftX;
    const headerY = doc.y;
    doc.font(FB).fontSize(8).fillColor('#0C7A52');
    for (const c of cols) {
      doc.text(c.h, x, headerY, { width: c.w, continued: false });
      x += c.w;
    }
    doc
      .moveTo(leftX, headerY + 14)
      .lineTo(doc.page.width - 48, headerY + 14)
      .strokeColor('#0C7A52')
      .stroke();
    doc.y = headerY + 18;

    doc.font(F).fontSize(7.5).fillColor('#222222');
    for (const line of bundle.lines) {
      if (doc.y > 760) {
        doc.addPage();
        doc.font(FB).fontSize(10).fillColor('#111111').text('รายการ (ต่อ) / Continued');
        doc.moveDown(0.4);
        doc.font(F).fontSize(7.5).fillColor('#222222');
      }
      const rowY = doc.y;
      const cells = [
        line.date.slice(0, 10),
        line.orderId.slice(0, 14),
        money(line.gross),
        money(line.gp),
        money(line.net),
        line.payoutStatus.slice(0, 28),
      ];
      let cx = leftX;
      cells.forEach((cell, i) => {
        doc.text(cell, cx, rowY, { width: cols[i].w, continued: false });
        cx += cols[i].w;
      });
      doc.y = rowY + 12;
    }

    if (!bundle.lines.length) {
      doc.font(F).fontSize(9).fillColor('#888888').text('ไม่มีรายการในงวดนี้');
    }

    doc.moveDown(1.2);
    doc.font(F).fontSize(8).fillColor('#666666').text(
      'เอกสารนี้ออกโดยระบบ BoomMall เพื่อประกอบการบัญชีของร้านค้า — ยอด “Net Payout” คือยอดที่มีหลักฐานโอนเข้าบัญชีแล้วเท่านั้น',
      { width: doc.page.width - 96 },
    );
    doc.text('This statement is system-generated for merchant accounting purposes.');

    doc.end();
  });
}

export async function renderSellerStatementExcel(bundle: SellerStatementBundle): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BoomMall';
  wb.created = new Date();

  const summary = wb.addWorksheet('สรุปยอด', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  summary.columns = [
    { header: 'รายการ', key: 'label', width: 48 },
    { header: 'จำนวน (บาท)', key: 'value', width: 18 },
  ];
  summary.getRow(1).font = { bold: true };
  summary.addRows([
    { label: 'ชื่อร้าน', value: bundle.store.name },
    { label: 'เลขประจำตัวผู้เสียภาษี', value: bundle.store.taxId || '—' },
    { label: 'ที่อยู่', value: bundle.store.address || '—' },
    { label: 'งวดรายงาน', value: bundle.period.label },
    { label: 'ยอดขายรวม (Gross Sales)', value: bundle.summary.grossSales },
    { label: 'ค่าธรรมเนียม GP แพลตฟอร์ม', value: bundle.summary.platformGpFee },
    { label: 'ยอดสุทธิหลังหัก GP', value: round2(bundle.summary.grossSales - bundle.summary.platformGpFee) },
    { label: 'ยอดเงินสุทธิที่ได้รับจริง (Net Earnings paid out)', value: bundle.summary.netEarningsPaid },
    { label: 'จำนวนคำสั่งซื้อทั้งหมด', value: bundle.summary.totalOrders },
    { label: 'ออเดอร์ยังพัก escrow', value: bundle.summary.pendingOrders },
  ]);

  const detail = wb.addWorksheet('ประวัติคำสั่งซื้อ', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  detail.columns = [
    { header: 'วันที่', key: 'date', width: 14 },
    { header: 'รหัสออเดอร์', key: 'orderId', width: 28 },
    { header: 'มูลค่าสินค้า (Gross)', key: 'gross', width: 16 },
    { header: 'ค่า GP', key: 'gp', width: 12 },
    { header: 'ยอดสุทธิ', key: 'net', width: 14 },
    { header: 'สถานะปล่อย', key: 'releaseStatus', width: 14 },
    { header: 'สถานะการโอน', key: 'payoutStatus', width: 28 },
    { header: 'วันที่โอน', key: 'paidOutAt', width: 22 },
  ];
  detail.getRow(1).font = { bold: true };
  for (const line of bundle.lines) {
    detail.addRow({
      date: line.date.slice(0, 10),
      orderId: line.orderId,
      gross: line.gross,
      gp: line.gp,
      net: line.net,
      releaseStatus: line.releaseStatus,
      payoutStatus: line.payoutStatus,
      paidOutAt: line.paidOutAt ? line.paidOutAt.slice(0, 19).replace('T', ' ') : '',
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function exportSellerStatement(input: {
  storeId: string;
  period: StatementPeriod;
  format: 'pdf' | 'xlsx' | 'json';
}): Promise<{ buffer: Buffer; contentType: string; filename: string; bundle: SellerStatementBundle }> {
  const bundle = await buildSellerStatement(input.storeId, input.period);
  const stamp = bundle.period.month
    ? `${bundle.period.year}-${String(bundle.period.month).padStart(2, '0')}`
    : bundle.period.from.toISOString().slice(0, 10);
  const base = `boommall-seller-statement-${stamp}`;

  if (input.format === 'json') {
    return {
      buffer: Buffer.from(JSON.stringify({ ok: true, data: bundle }, null, 2), 'utf8'),
      contentType: 'application/json; charset=utf-8',
      filename: `${base}.json`,
      bundle,
    };
  }
  if (input.format === 'xlsx') {
    return {
      buffer: await renderSellerStatementExcel(bundle),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `${base}.xlsx`,
      bundle,
    };
  }
  return {
    buffer: await renderSellerStatementPdf(bundle),
    contentType: 'application/pdf',
    filename: `${base}.pdf`,
    bundle,
  };
}
