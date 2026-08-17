/**
 * Tax & Accounting Export — สร้างรายงานให้ฝ่ายบัญชีปิดงบและยื่น ภ.พ.30
 *
 * แหล่งข้อมูล: CommerceOrder + OrderEscrow + Store + WithdrawalRequest
 * ไม่สร้างตาราง Orders ชุดที่สอง
 *
 * รายได้แพลตฟอร์ม = ค่า GP เท่านั้น แล้วแยก VAT 7% แบบ inclusive (ดู taxMath.ts)
 * ออเดอร์คืนเงิน/ยกเลิกไปชีต "ลดหนี้" แยกจากภาษีขาย
 */
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../lib/errors';
import { toThb } from '../domain/escrowMath';
import {
  isRefundOrCancelStatus,
  receiptRef,
  splitGpVatInclusive,
  splitGpVatInclusiveSum,
} from '../domain/taxMath';

export type ReportKind = 'sales-tax' | 'revenue-ledger' | 'payouts' | 'merchants';
export type ReportFormat = 'xlsx' | 'pdf' | 'csv' | 'json';

export type DateRange = {
  from: Date;
  to: Date;
  label: string;
};

type OrderRow = {
  id: string;
  merchantId: string | null;
  status: string;
  merchandiseThb: number;
  shippingFeeThb: number;
  gpAmountThb: number;
  pspRef: string | null;
  paidAt: Date | null;
  updatedAt: Date;
};

type EscrowRow = {
  orderId: string;
  storeId: string;
  grossAmount: number;
  gpAmount: number;
  netMerchantAmount: number;
  releaseStatus: string;
  payoutProof: string | null;
  paidOutAt: Date | null;
  store: {
    id: string;
    name: string;
    taxId: string | null;
    bankName: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
  };
};

export type SalesTaxLine = {
  seq: number;
  datetime: string;
  receiptNo: string;
  storeName: string;
  taxId: string;
  gpTaxBase: number;
  outputVat: number;
  gpInclusive: number;
  orderId: string;
};

export type RevenueLedgerLine = {
  date: string;
  orderId: string;
  transactionId: string;
  grossVolume: number;
  gpAmount: number;
  status: 'Completed' | 'Refunded' | 'Cancelled';
  gatewayFee: number;
};

export type PayoutLine = {
  storeId: string;
  bankAccountName: string;
  bankAccountNo: string;
  netPaid: number;
  paidAt: string;
  transferRef: string;
};

export type MerchantRdLine = {
  storeId: string;
  storeName: string;
  taxId: string;
  bankAccountNo: string;
  bankAccountName: string;
  grossVolume: number;
  orderCount: number;
};

export type TaxReportBundle = {
  period: { from: string; to: string; label: string };
  currency: 'THB';
  note: string;
  summary: {
    grossVolume: number;
    gpInclusive: number;
    gpTaxBase: number;
    outputVat: number;
    refundGross: number;
    refundGp: number;
    refundVat: number;
  };
  salesTax: SalesTaxLine[];
  creditNotes: SalesTaxLine[];
  revenueLedger: RevenueLedgerLine[];
  payouts: PayoutLine[];
  merchants: MerchantRdLine[];
};

const ADJUST_STATUSES = ['REFUNDED', 'CANCELLED'] as const;

/** แปลง query เป็นช่วงเวลา Asia/Bangkok — รองรับ month=YYYY-MM หรือ from/to=YYYY-MM-DD */
export function parseReportPeriod(query: { from?: string; to?: string; month?: string }): DateRange {
  const month = query.month?.trim();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, mon] = month.split('-').map(Number);
    const last = new Date(year, mon, 0).getDate();
    const from = new Date(`${month}-01T00:00:00+07:00`);
    const to = new Date(`${month}-${String(last).padStart(2, '0')}T23:59:59.999+07:00`);
    return { from, to, label: month };
  }
  if (query.from && query.to) {
    const from = new Date(`${query.from}T00:00:00+07:00`);
    const to = new Date(`${query.to}T23:59:59.999+07:00`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new AppError('VALIDATION', 'ช่วงวันที่ไม่ถูกต้อง', 400);
    }
    return { from, to, label: `${query.from}_${query.to}` };
  }
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return parseReportPeriod({ month: `${y}-${m}` });
}

function inRange(date: Date | null | undefined, range: DateRange) {
  if (!date) return false;
  return date >= range.from && date <= range.to;
}

function ledgerStatus(orderStatus: string, escrowStatus: string): RevenueLedgerLine['status'] {
  if (isRefundOrCancelStatus(orderStatus) || escrowStatus === 'REFUNDED') return 'Refunded';
  if (escrowStatus === 'CANCELLED' || orderStatus === 'CANCELLED') return 'Cancelled';
  return 'Completed';
}

function gpThb(escrow: EscrowRow | undefined, order: OrderRow) {
  if (escrow) return toThb(escrow.gpAmount);
  return Number(order.gpAmountThb ?? 0);
}

function grossThb(escrow: EscrowRow | undefined, order: OrderRow) {
  if (escrow) return toThb(escrow.grossAmount);
  return Number(order.merchandiseThb ?? 0);
}

function storeName(escrow: EscrowRow | undefined, order: OrderRow) {
  return escrow?.store.name || order.merchantId || '—';
}

function storeTaxId(escrow: EscrowRow | undefined) {
  return escrow?.store.taxId?.trim() || '';
}

/** ดึงออเดอร์ + escrow + รายการโอน ในช่วงที่เลือก แล้วประกอบเป็นชุดรายงาน */
export async function buildTaxReportBundle(range: DateRange): Promise<TaxReportBundle> {
  const [paidOrders, adjustedOrders, paidOutEscrows, withdrawals] = await Promise.all([
    prisma.commerceOrder.findMany({
      where: { paidAt: { gte: range.from, lte: range.to } },
      orderBy: { paidAt: 'asc' },
    }),
    prisma.commerceOrder.findMany({
      where: { status: { in: [...ADJUST_STATUSES] }, updatedAt: { gte: range.from, lte: range.to } },
      orderBy: { updatedAt: 'asc' },
    }),
    prisma.orderEscrow.findMany({
      where: { paidOutAt: { gte: range.from, lte: range.to } },
      include: { store: true },
    }),
    prisma.withdrawalRequest.findMany({
      where: { transferredAt: { gte: range.from, lte: range.to }, status: { in: ['TRANSFERRED', 'APPROVED'] } },
      orderBy: { transferredAt: 'asc' },
    }),
  ]);

  const orderMap = new Map<string, OrderRow>();
  for (const row of [...paidOrders, ...adjustedOrders]) {
    orderMap.set(row.id, row);
  }
  for (const row of paidOutEscrows) {
    if (!orderMap.has(row.orderId)) {
      const extra = await prisma.commerceOrder.findUnique({ where: { id: row.orderId } });
      if (extra) orderMap.set(extra.id, extra);
    }
  }

  const orderIds = [...orderMap.keys()];
  const escrows = orderIds.length
    ? await prisma.orderEscrow.findMany({
        where: { orderId: { in: orderIds } },
        include: { store: true },
      })
    : [];
  const escrowByOrder = new Map<string, EscrowRow>();
  for (const row of [...escrows, ...paidOutEscrows]) {
    escrowByOrder.set(row.orderId, row);
  }

  const salesTax: SalesTaxLine[] = [];
  const creditNotes: SalesTaxLine[] = [];
  const revenueLedger: RevenueLedgerLine[] = [];

  const paidInPeriod = [...orderMap.values()]
    .filter((o) => inRange(o.paidAt, range))
    .sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0));

  for (const order of paidInPeriod) {
    const escrow = escrowByOrder.get(order.id);
    const gp = gpThb(escrow, order);
    const split = splitGpVatInclusive(gp);
    const adjusted = isRefundOrCancelStatus(order.status) || isRefundOrCancelStatus(escrow?.releaseStatus);
    if (!adjusted && gp > 0) {
      salesTax.push({
        seq: salesTax.length + 1,
        datetime: (order.paidAt ?? order.updatedAt).toISOString(),
        receiptNo: receiptRef(order.id, order.paidAt),
        storeName: storeName(escrow, order),
        taxId: storeTaxId(escrow),
        gpTaxBase: split.taxBase,
        outputVat: split.outputVat,
        gpInclusive: split.gpInclusive,
        orderId: order.id,
      });
    }
    revenueLedger.push({
      date: (order.paidAt ?? order.updatedAt).toISOString().slice(0, 10),
      orderId: order.id,
      transactionId: order.pspRef || order.id,
      grossVolume: grossThb(escrow, order),
      gpAmount: gp,
      status: ledgerStatus(order.status, escrow?.releaseStatus ?? ''),
      gatewayFee: 0,
    });
  }

  const adjustedInPeriod = [...orderMap.values()]
    .filter((o) => isRefundOrCancelStatus(o.status) && inRange(o.updatedAt, range))
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

  for (const order of adjustedInPeriod) {
    const escrow = escrowByOrder.get(order.id);
    const gp = gpThb(escrow, order);
    if (gp <= 0) continue;
    const split = splitGpVatInclusive(gp);
    creditNotes.push({
      seq: creditNotes.length + 1,
      datetime: order.updatedAt.toISOString(),
      receiptNo: `CN-${receiptRef(order.id, order.paidAt)}`,
      storeName: storeName(escrow, order),
      taxId: storeTaxId(escrow),
      gpTaxBase: -split.taxBase,
      outputVat: -split.outputVat,
      gpInclusive: -split.gpInclusive,
      orderId: order.id,
    });
  }

  const payouts: PayoutLine[] = [];
  for (const row of paidOutEscrows) {
    if (!row.paidOutAt || !row.payoutProof) continue;
    payouts.push({
      storeId: row.storeId,
      bankAccountName: row.store.bankAccountName || '',
      bankAccountNo: row.store.bankAccountNo || '',
      netPaid: toThb(row.netMerchantAmount),
      paidAt: row.paidOutAt.toISOString(),
      transferRef: row.payoutProof,
    });
  }
  for (const wd of withdrawals) {
    if (!wd.transferredAt || !wd.proofOfTransfer) continue;
    payouts.push({
      storeId: wd.sellerId,
      bankAccountName: wd.bankAccountName || '',
      bankAccountNo: wd.bankAccountNo || '',
      netPaid: toThb(wd.amount),
      paidAt: wd.transferredAt.toISOString(),
      transferRef: wd.proofOfTransfer,
    });
  }

  const merchantMap = new Map<string, MerchantRdLine>();
  for (const order of paidInPeriod) {
    if (isRefundOrCancelStatus(order.status)) continue;
    const escrow = escrowByOrder.get(order.id);
    const id = escrow?.storeId || order.merchantId || 'unknown';
    const prev = merchantMap.get(id) ?? {
      storeId: id,
      storeName: storeName(escrow, order),
      taxId: storeTaxId(escrow),
      bankAccountNo: escrow?.store.bankAccountNo || '',
      bankAccountName: escrow?.store.bankAccountName || '',
      grossVolume: 0,
      orderCount: 0,
    };
    prev.grossVolume += grossThb(escrow, order);
    prev.orderCount += 1;
    merchantMap.set(id, prev);
  }

  const saleVat = splitGpVatInclusiveSum(salesTax.map((r) => r.gpInclusive));
  const refundVat = splitGpVatInclusiveSum(creditNotes.map((r) => Math.abs(r.gpInclusive)));

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    currency: 'THB',
    note: 'รายได้แพลตฟอร์มคือค่า GP เท่านั้น — VAT 7% แยกจาก GP แบบ inclusive (GP/1.07). ค่าธรรมเนียม PSP ยังไม่มีในสมุด จึงเป็น 0. เลขใบเสร็จเป็นเลขอ้างอิงภายใน จนกว่าจะออกใบกำกับภาษีจริง.',
    summary: {
      grossVolume: revenueLedger.filter((r) => r.status === 'Completed').reduce((s, r) => s + r.grossVolume, 0),
      gpInclusive: saleVat.gpInclusive,
      gpTaxBase: saleVat.taxBase,
      outputVat: saleVat.outputVat,
      refundGross: revenueLedger.filter((r) => r.status !== 'Completed').reduce((s, r) => s + r.grossVolume, 0),
      refundGp: refundVat.gpInclusive,
      refundVat: refundVat.outputVat,
    },
    salesTax,
    creditNotes,
    revenueLedger,
    payouts,
    merchants: [...merchantMap.values()].sort((a, b) => b.grossVolume - a.grossVolume),
  };
}

function moneyCell(n: number) {
  return Math.round(n * 100) / 100;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F2F5' } };
}

function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: Array<Array<string | number>>) {
  const sheet = wb.addWorksheet(name);
  styleHeader(sheet.addRow(headers));
  for (const line of rows) sheet.addRow(line);
  sheet.columns.forEach((col) => {
    col.width = 22;
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

/** สร้างไฟล์ Excel ตามชนิดรายงาน */
export async function renderTaxReportXlsx(kind: ReportKind, bundle: TaxReportBundle): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BoomMall';
  wb.created = new Date();

  if (kind === 'sales-tax') {
    addSheet(
      wb,
      'ภาษีขาย',
      ['ลำดับ', 'วันที่/เวลา', 'เลขที่ใบเสร็จ', 'ชื่อร้านค้า', 'เลขประจำตัวผู้เสียภาษี', 'มูลค่าบริการ GP ก่อน VAT', 'ภาษีมูลค่าเพิ่ม 7%', 'ยอดรวม GP สุทธิ'],
      bundle.salesTax.map((r) => [
        r.seq,
        r.datetime,
        r.receiptNo,
        r.storeName,
        r.taxId,
        moneyCell(r.gpTaxBase),
        moneyCell(r.outputVat),
        moneyCell(r.gpInclusive),
      ]),
    );
    addSheet(
      wb,
      'ลดหนี้-คืนเงิน',
      ['ลำดับ', 'วันที่/เวลา', 'เลขที่ใบลดหนี้', 'ชื่อร้านค้า', 'เลขประจำตัวผู้เสียภาษี', 'มูลค่าบริการ GP ก่อน VAT', 'ภาษีมูลค่าเพิ่ม 7%', 'ยอดรวม GP'],
      bundle.creditNotes.map((r) => [
        r.seq,
        r.datetime,
        r.receiptNo,
        r.storeName,
        r.taxId,
        moneyCell(r.gpTaxBase),
        moneyCell(r.outputVat),
        moneyCell(r.gpInclusive),
      ]),
    );
    addSheet(wb, 'สรุป', ['รายการ', 'จำนวนเงิน (บาท)'], [
      ['ช่วงรายงาน', bundle.period.label],
      ['ยอดขายรวมทั้งระบบ (GMV)', moneyCell(bundle.summary.grossVolume)],
      ['รายได้ GP รวม (รวม VAT)', moneyCell(bundle.summary.gpInclusive)],
      ['ฐานภาษี GP (ก่อน VAT)', moneyCell(bundle.summary.gpTaxBase)],
      ['ภาษีขาย 7%', moneyCell(bundle.summary.outputVat)],
      ['ยอดคืนเงิน (GMV)', moneyCell(bundle.summary.refundGross)],
      ['GP ที่ต้องลดหนี้', moneyCell(bundle.summary.refundGp)],
      ['VAT ที่ต้องลดหนี้', moneyCell(bundle.summary.refundVat)],
    ]);
  }

  if (kind === 'revenue-ledger') {
    addSheet(
      wb,
      'รายได้และธุรกรรม',
      ['วันที่', 'Order ID', 'Transaction ID', 'ยอดขายสินค้าเต็ม', 'ค่า GP ที่หัก', 'สถานะ', 'ค่าธรรมเนียม Payment Gateway'],
      bundle.revenueLedger.map((r) => [
        r.date,
        r.orderId,
        r.transactionId,
        moneyCell(r.grossVolume),
        moneyCell(r.gpAmount),
        r.status,
        moneyCell(r.gatewayFee),
      ]),
    );
  }

  if (kind === 'payouts') {
    addSheet(
      wb,
      'จ่ายเงินร้านค้า',
      ['รหัสร้านค้า', 'ชื่อบัญชีธนาคาร', 'เลขที่บัญชี', 'ยอดเงินสุทธิที่โอน', 'วันที่โอนจริง', 'เลขที่อ้างอิงการโอน'],
      bundle.payouts.map((r) => [
        r.storeId,
        r.bankAccountName,
        r.bankAccountNo,
        moneyCell(r.netPaid),
        r.paidAt,
        r.transferRef,
      ]),
    );
  }

  if (kind === 'merchants') {
    addSheet(
      wb,
      'ผู้ค้าส่งสรรพากร',
      ['รหัสร้านค้า', 'ชื่อร้าน', 'เลขบัตร/เลขภาษี', 'ชื่อบัญชี', 'เลขที่บัญชี', 'ยอดขายรวมทั้งช่วง', 'จำนวนออเดอร์'],
      bundle.merchants.map((r) => [
        r.storeId,
        r.storeName,
        r.taxId,
        r.bankAccountName,
        r.bankAccountNo,
        moneyCell(r.grossVolume),
        r.orderCount,
      ]),
    );
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function csvEscape(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** CSV สำหรับรายงานผู้ค้าส่งสรรพากร (UTF-8 BOM) */
export function renderMerchantRdCsv(bundle: TaxReportBundle): Buffer {
  const header = [
    'store_id',
    'store_name',
    'tax_id',
    'bank_account_name',
    'bank_account_no',
    'gross_volume_thb',
    'order_count',
    'period',
  ];
  const lines = [
    header.join(','),
    ...bundle.merchants.map((r) =>
      [
        r.storeId,
        r.storeName,
        r.taxId,
        r.bankAccountName,
        r.bankAccountNo,
        moneyCell(r.grossVolume),
        r.orderCount,
        bundle.period.label,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ];
  return Buffer.from(`\uFEFF${lines.join('\n')}`, 'utf8');
}

/** PDF รายงานภาษีขาย — หัวคอลัมน์ภาษาอังกฤษเพราะฟอนต์มาตรฐานไม่รองรับไทย (ไฟล์ Excel มีภาษาไทยครบ) */
export async function renderSalesTaxPdf(bundle: TaxReportBundle): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('BoomMall — Sales Tax Report (PP.30 support)', { continued: false });
    doc.fontSize(10).fillColor('#555555').text(`Period ${bundle.period.label}  |  Currency THB`);
    doc.moveDown(0.4);
    doc.fillColor('#111111').fontSize(10).text(
      `GP inclusive ${bundle.summary.gpInclusive.toFixed(2)}   Tax base ${bundle.summary.gpTaxBase.toFixed(2)}   Output VAT 7% ${bundle.summary.outputVat.toFixed(2)}   Refunds ${bundle.summary.refundGross.toFixed(2)}`,
    );
    doc.moveDown(0.6);

    const headers = ['#', 'Date', 'Receipt', 'Store', 'Tax ID', 'GP ex-VAT', 'VAT 7%', 'GP incl.'];
    const col = [28, 120, 130, 130, 90, 70, 60, 70];
    let x = 36;
    doc.fontSize(8).fillColor('#333333');
    headers.forEach((h, i) => {
      doc.text(h, x, doc.y, { width: col[i], continued: i < headers.length - 1 });
      x += col[i];
    });
    doc.text('');
    doc.moveTo(36, doc.y).lineTo(800, doc.y).strokeColor('#cccccc').stroke();
    doc.moveDown(0.3);

    const writeRows = (rows: SalesTaxLine[], title: string) => {
      doc.fontSize(11).fillColor('#111111').text(title);
      doc.fontSize(8).fillColor('#222222');
      for (const r of rows) {
        if (doc.y > 520) doc.addPage();
        const cells = [
          String(r.seq),
          r.datetime.slice(0, 16).replace('T', ' '),
          r.receiptNo,
          r.storeName.slice(0, 22),
          r.taxId || '-',
          r.gpTaxBase.toFixed(2),
          r.outputVat.toFixed(2),
          r.gpInclusive.toFixed(2),
        ];
        let cx = 36;
        cells.forEach((cell, i) => {
          doc.text(cell, cx, doc.y, { width: col[i], continued: i < cells.length - 1 });
          cx += col[i];
        });
        doc.text('');
      }
      doc.moveDown(0.8);
    };

    writeRows(bundle.salesTax, 'Output VAT (platform GP only)');
    writeRows(bundle.creditNotes, 'Credit notes / refunds / cancelled');
    doc.fontSize(8).fillColor('#666666').text(bundle.note);
    doc.end();
  });
}

export function filenameFor(kind: ReportKind, format: ReportFormat, label: string) {
  const names: Record<ReportKind, string> = {
    'sales-tax': 'sales-tax-pp30',
    'revenue-ledger': 'revenue-ledger',
    payouts: 'payout-settlement',
    merchants: 'merchant-rd',
  };
  return `boommall-${names[kind]}-${label}.${format === 'xlsx' ? 'xlsx' : format}`;
}

export function contentTypeFor(format: ReportFormat) {
  if (format === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (format === 'pdf') return 'application/pdf';
  if (format === 'csv') return 'text/csv; charset=utf-8';
  return 'application/json';
}

/** สร้างไฟล์ตาม kind + format แล้วคืน buffer พร้อมชื่อไฟล์ */
export async function exportTaxReport(input: {
  kind: ReportKind;
  format: ReportFormat;
  from?: string;
  to?: string;
  month?: string;
}) {
  const range = parseReportPeriod(input);
  const bundle = await buildTaxReportBundle(range);
  if (input.format === 'json') {
    return { buffer: Buffer.from(JSON.stringify({ ok: true, data: bundle }), 'utf8'), filename: filenameFor(input.kind, 'json', range.label), contentType: contentTypeFor('json'), bundle };
  }
  if (input.kind === 'merchants' && input.format === 'csv') {
    return { buffer: renderMerchantRdCsv(bundle), filename: filenameFor('merchants', 'csv', range.label), contentType: contentTypeFor('csv'), bundle };
  }
  if (input.kind === 'sales-tax' && input.format === 'pdf') {
    return { buffer: await renderSalesTaxPdf(bundle), filename: filenameFor('sales-tax', 'pdf', range.label), contentType: contentTypeFor('pdf'), bundle };
  }
  if (input.format === 'xlsx') {
    return { buffer: await renderTaxReportXlsx(input.kind, bundle), filename: filenameFor(input.kind, 'xlsx', range.label), contentType: contentTypeFor('xlsx'), bundle };
  }
  throw new AppError('VALIDATION', `รูปแบบ ${input.format} ไม่รองรับรายงานนี้`, 400);
}

/** ส่งไฟล์ลง response โดยไม่ผ่าน JSON envelope */
export function sendExportFile(
  res: { setHeader: (k: string, v: string) => void; status: (n: number) => { send: (b: Buffer) => void } },
  file: { buffer: Buffer; filename: string; contentType: string },
) {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(file.buffer);
}

export function asNodeReadable(buffer: Buffer) {
  return Readable.from(buffer);
}
