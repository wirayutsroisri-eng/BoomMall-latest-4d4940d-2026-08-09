import { formatAddress, type MergedShipment } from './addressMerge';

export type LabelShop = {
  name: string;
  phone?: string | null;
  address?: string | null;
};

export type LabelPageModel = MergedShipment & {
  trackingNumber: string;
  shippingCarrier: string;
  shop: LabelShop;
  printedAt: string;
};

const CARRIER_MARK: Record<string, string> = {
  Kerry: 'KERRY',
  Flash: 'FLASH',
  JNT: 'J&T',
  'J&T': 'J&T',
  ThailandPost: 'ไปรษณีย์ไทย',
  THP: 'ไปรษณีย์ไทย',
};

export function carrierMark(name: string): string {
  return CARRIER_MARK[name] ?? name.toUpperCase();
}

export function formatThb(n: number): string {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function shortOrderId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export function skuBadgeLabel(variantName?: string | null) {
  const raw = variantName?.trim() ?? '';
  if (!raw) return '';
  if (/^รุ่น\s/i.test(raw) || /^สี/.test(raw)) return raw;
  if (/^\d+$/.test(raw)) return `รุ่น ${raw}`;
  return raw;
}

export function productMark(title: string) {
  return title.trim().slice(0, 1) || '•';
}

export function packingTotals(lines: Array<{ title: string; productId?: string; qty: number }>) {
  const keys = new Set(
    lines.map((line) => (line.productId?.trim() || line.title.trim() || 'item').toLowerCase()),
  );
  const pieceCount = lines.reduce((n, line) => n + Math.max(0, line.qty), 0);
  const groupCount = Math.max(keys.size, lines.length ? 1 : 0);
  return {
    groupCount,
    pieceCount,
    label: `รวม ${groupCount} รายการ (${pieceCount} ชิ้น)`,
  };
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const SHIPPING_LABEL_CSS = `/* Boom Mall 4×6 in / 100×150 mm thermal label */
@page {
  size: 100mm 150mm;
  margin: 0;
}
html, body {
  margin: 0;
  padding: 0;
  width: 100mm;
  height: 150mm;
  background: #fff;
  color: #0B1F17;
  font-family: "Noto Sans Thai", "Sarabun", "Helvetica Neue", sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.sheet {
  box-sizing: border-box;
  width: 100mm;
  height: 150mm;
  padding: 3.2mm;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  page-break-after: always;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0B1F17;
  color: #fff;
  border-radius: 2.2mm;
  padding: 2.2mm 2.6mm;
}
.brand {
  display: flex;
  align-items: center;
  gap: 2mm;
}
.mark {
  width: 9mm;
  height: 9mm;
  border-radius: 2mm;
  background: linear-gradient(160deg, #00D68F 0%, #00A86B 100%);
  color: #0B1F17;
  font-weight: 900;
  font-size: 5.2mm;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: -0.4mm;
}
.wordmark {
  font-weight: 900;
  font-size: 4.1mm;
  letter-spacing: 0.08mm;
  line-height: 1.05;
}
.wordmark small {
  display: block;
  font-size: 2mm;
  font-weight: 700;
  letter-spacing: 0.35mm;
  color: #00D68F;
  text-transform: uppercase;
}
.carrier {
  text-align: right;
  font-weight: 900;
  font-size: 2.8mm;
  letter-spacing: 0.2mm;
}
.carrier span {
  display: block;
  margin-top: 0.6mm;
  font-size: 1.8mm;
  font-weight: 700;
  color: #9BE7C8;
}
.track-row {
  display: grid;
  grid-template-columns: 1fr 18mm;
  gap: 2mm;
  margin-top: 2.2mm;
  align-items: center;
}
.track-no {
  font-weight: 900;
  font-size: 3.3mm;
  letter-spacing: 0.25mm;
}
.barcode {
  width: 100%;
  height: 12mm;
  object-fit: contain;
  image-rendering: pixelated;
}
.qr {
  width: 18mm;
  height: 18mm;
  object-fit: contain;
}
.badge {
  margin-top: 2mm;
  border-radius: 1.4mm;
  padding: 1.5mm 2.2mm;
  font-weight: 900;
  font-size: 2.7mm;
  letter-spacing: 0.12mm;
  text-align: center;
}
.badge.paid {
  background: #0B1F17;
  color: #00D68F;
}
.badge.cod {
  background: #fff;
  color: #0B1F17;
  box-shadow: inset 0 0 0 0.45mm #0B1F17;
}
.parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2mm;
  margin-top: 2.2mm;
}
.box {
  border: 0.35mm solid #0B1F17;
  border-radius: 1.6mm;
  padding: 1.6mm 1.8mm;
  min-height: 22mm;
}
.box.to { background: #E8F7F0; }
.kicker {
  font-size: 1.8mm;
  font-weight: 800;
  letter-spacing: 0.28mm;
  text-transform: uppercase;
  color: #4A5C54;
}
.who {
  margin-top: 0.6mm;
  font-size: 3mm;
  font-weight: 900;
  line-height: 1.15;
}
.phone { font-size: 2.4mm; font-weight: 800; margin-top: 0.4mm; }
.addr { font-size: 2.1mm; font-weight: 700; line-height: 1.25; margin-top: 0.6mm; }
.oids {
  margin-top: 1.8mm;
  font-size: 1.9mm;
  font-weight: 800;
  color: #0B1F17;
}
.oids b { color: #00A86B; }
table.slip {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1.4mm;
  font-size: 1.85mm;
}
table.slip th {
  background: #0B1F17;
  color: #fff;
  font-weight: 800;
  padding: 0.8mm 0.5mm;
  text-align: left;
}
table.slip td {
  padding: 0.65mm 0.45mm;
  border-bottom: 0.28mm solid #0B1F17;
  vertical-align: middle;
}
table.slip .chk { width: 4.2mm; }
table.slip .ico { width: 4.6mm; }
table.slip .qty { width: 8mm; text-align: right; white-space: nowrap; font-weight: 900; }
table.slip .opt { width: 16mm; font-weight: 900; }
table.slip .item { font-weight: 800; }
.box-tick {
  width: 2.8mm;
  height: 2.8mm;
  border: 0.32mm solid #0B1F17;
  display: inline-block;
}
.mark-box {
  width: 3.4mm;
  height: 3.4mm;
  border: 0.28mm solid #0B1F17;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  font-size: 2mm;
}
.totals {
  display: flex;
  justify-content: space-between;
  background: #0B1F17;
  color: #fff;
  font-weight: 900;
  font-size: 2.2mm;
  padding: 1.3mm 1.8mm;
  border-radius: 0 0 1.4mm 1.4mm;
}
.foot {
  margin-top: auto;
  padding-top: 1.6mm;
  text-align: center;
  font-weight: 800;
  font-size: 2.1mm;
  color: #00A86B;
  letter-spacing: 0.08mm;
}
.foot small { display: block; color: #4A5C54; font-size: 1.6mm; margin-top: 0.4mm; }
`;

function paymentBadge(page: LabelPageModel): { cls: string; text: string } {
  if (page.paymentKind === 'COD' || page.paymentKind === 'MIXED') {
    const extra = page.paymentKind === 'MIXED' ? ' · มีรายการชำระแล้วปนอยู่' : '';
    return { cls: 'cod', text: `เก็บเงินปลายทาง (COD: ${formatThb(page.codAmountThb)})${extra}` };
  }
  return { cls: 'paid', text: 'ชำระเงินแล้ว (PAID)' };
}

export function renderShippingLabelHtml(pages: LabelPageModel[], images?: Map<string, { barcode: string; qr: string }>): string {
  const sheets = pages
    .map((page) => {
      const badge = paymentBadge(page);
      const img = images?.get(page.trackingNumber);
      const rows = page.lines
        .slice(0, 6)
        .map(
          (line) => `<tr>
            <td class="chk"><span class="box-tick"></span></td>
            <td class="ico"><span class="mark-box">${esc(productMark(line.title))}</span></td>
            <td><div class="item">${esc(line.title)}</div></td>
            <td class="opt">${esc(skuBadgeLabel(line.option) || line.sku || '—')}</td>
            <td class="qty">x${line.qty}</td>
          </tr>`,
        )
        .join('');
      const hidden = Math.max(0, page.lines.length - 6);
      return `<section class="sheet">
        <header class="header">
          <div class="brand">
            <div class="mark">B</div>
            <div class="wordmark">Boom Mall<small>Shipping Label · 4×6</small></div>
          </div>
          <div class="carrier">${esc(carrierMark(page.shippingCarrier))}<span>ขนส่ง</span></div>
        </header>
        <div class="track-row">
          <div>
            <div class="track-no">${esc(page.trackingNumber)}</div>
            ${img ? `<img class="barcode" alt="barcode" src="${img.barcode}" />` : ''}
          </div>
          ${img ? `<img class="qr" alt="qr" src="${img.qr}" />` : ''}
        </div>
        <div class="badge ${badge.cls}">${esc(badge.text)}</div>
        <div class="parties">
          <div class="box">
            <div class="kicker">ผู้ส่ง · From</div>
            <div class="who">${esc(page.shop.name)}</div>
            ${page.shop.phone ? `<div class="phone">${esc(page.shop.phone)}</div>` : ''}
            ${page.shop.address ? `<div class="addr">${esc(page.shop.address)}</div>` : ''}
          </div>
          <div class="box to">
            <div class="kicker">ผู้รับ · Ship to</div>
            <div class="who">${esc(page.recipient.name)}</div>
            <div class="phone">${esc(page.recipient.phone)}</div>
            <div class="addr">${esc(formatAddress(page.recipient))}</div>
          </div>
        </div>
        <div class="oids">รวม ${page.orderIds.length} คำสั่งซื้อ · Order ID
          <b>${esc(page.orderIds.map(shortOrderId).join('  ·  '))}</b>
        </div>
        <table class="slip">
          <thead>
            <tr>
              <th class="chk">[ ]</th><th class="ico"></th><th>จัดของ · สินค้า</th><th>ตัวเลือก</th><th class="qty">ชิ้น</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${hidden ? `<div class="oids">+ อีก ${hidden} รายการ รวมในยอดสุทธิแล้ว</div>` : ''}
        <div class="totals">
          <span>${esc(packingTotals(page.lines).label)}</span>
          <span>ยอดสุทธิ ${esc(formatThb(page.netTotalThb))}</span>
        </div>
        <footer class="foot">Thank you for shopping on Boom Mall<small>boommall.com · พิมพ์ ${esc(page.printedAt)}</small></footer>
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>Boom Mall Shipping Labels</title>
  <style>${SHIPPING_LABEL_CSS}</style>
</head>
<body>
${sheets}
</body>
</html>`;
}
