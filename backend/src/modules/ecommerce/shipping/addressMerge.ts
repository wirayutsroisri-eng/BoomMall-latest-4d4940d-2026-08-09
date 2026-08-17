/**
 * Auto-merge same-address PAID orders for one Boom Mall shipping label.
 * Match key: same merchant + recipient name + phone + shipping address.
 */

export type ShippingSnapshot = {
  name: string;
  phone: string;
  line1: string;
  district?: string;
  amphoe?: string;
  province?: string;
  postcode?: string;
  paymentMethod?: string;
  codAmountThb?: number;
};

export type MergeableOrderLine = {
  title?: string;
  sku?: string;
  label?: string;
  color?: string;
  variant?: string;
  qty: number;
  unitPrice: number;
  productId?: string;
  imageUri?: string;
};

export type MergeableOrder = {
  id: string;
  merchantId: string;
  status: string;
  shippingStatus?: string | null;
  merchandiseThb: number;
  shippingFeeThb?: number;
  shipping: ShippingSnapshot;
  lines: MergeableOrderLine[];
  trackingNumber?: string | null;
  shippingCarrier?: string | null;
};

export type PackedLine = {
  title: string;
  option: string;
  sku: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  productId?: string;
  imageUri?: string;
};

export type MergedShipment = {
  addressKey: string;
  merchantId: string;
  orderIds: string[];
  recipient: ShippingSnapshot;
  paymentKind: 'PAID' | 'COD' | 'MIXED';
  codAmountThb: number;
  prepaidAmountThb: number;
  merchandiseThb: number;
  shippingFeeThb: number;
  netTotalThb: number;
  totalQty: number;
  lines: PackedLine[];
  trackingNumber?: string;
  shippingCarrier?: string;
};

const TITLE_RE = /^(นาย|นางสาว|นาง|คุณ|mr\.?|mrs\.?|ms\.?|miss)\s*/i;
const ADDR_PREFIX_RE = /(ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.)\s*/g;
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

function thaiDigitsToAscii(raw: string) {
  return raw.replace(/[๐-๙]/g, (ch) => String(THAI_DIGITS.indexOf(ch)));
}

export function normalizeName(raw: string): string {
  return thaiDigitsToAscii(raw)
    .normalize('NFC')
    .replace(/[()[\]{}·•]/g, ' ')
    .replace(TITLE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizePhone(raw: string): string {
  let digits = thaiDigitsToAscii(raw).replace(/\D/g, '');
  if (digits.startsWith('66') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  if (digits.startsWith('0') && digits.length > 10) digits = digits.slice(0, 10);
  return digits;
}

export function formatAddress(s: ShippingSnapshot): string {
  return [s.line1, s.district, s.amphoe, s.province, s.postcode]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function dedupeTokens(raw: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(' ')) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out.join(' ');
}

export function normalizeAddress(raw: string): string {
  return dedupeTokens(
    thaiDigitsToAscii(raw)
      .normalize('NFC')
      .toLowerCase()
      .replace(ADDR_PREFIX_RE, ' ')
      .replace(/[.,/#\\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function addressMergeKey(input: {
  merchantId: string;
  name: string;
  phone: string;
  address: string;
}): string {
  const merchant = input.merchantId.trim();
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);
  const address = normalizeAddress(input.address);
  if (!merchant || !name || !phone || !address) return '';
  return `${merchant}|${name}|${phone}|${address}`;
}

export function snapshotMergeKey(merchantId: string, shipping: ShippingSnapshot): string {
  return addressMergeKey({
    merchantId,
    name: shipping.name,
    phone: shipping.phone,
    address: formatAddress(shipping),
  });
}

export function keyOfOrder(order: MergeableOrder): string {
  return addressMergeKey({
    merchantId: order.merchantId,
    name: order.shipping.name,
    phone: order.shipping.phone,
    address: formatAddress(order.shipping),
  });
}

export function isUnshippedPaid(order: { status: string; shippingStatus?: string | null }): boolean {
  if (order.status !== 'PAID' && order.status !== 'paid') return false;
  const ship = (order.shippingStatus ?? '').toUpperCase();
  return !ship || ship === 'PENDING' || ship === 'PACKED';
}

function optionOf(line: MergeableOrderLine): string {
  return [line.label, line.color, line.variant].filter((p) => p?.trim()).join(' · ');
}

function lineKey(line: MergeableOrderLine): string {
  return [line.sku ?? '', line.title ?? '', optionOf(line), String(line.unitPrice)].join('|');
}

export function paymentKindOf(method?: string): 'PAID' | 'COD' {
  const m = (method ?? '').trim().toLowerCase();
  return m === 'cod' || m === 'cash_on_delivery' || m === 'เก็บเงินปลายทาง' ? 'COD' : 'PAID';
}

export function parseShippingJson(value: unknown): ShippingSnapshot {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const str = (k: string) => (typeof raw[k] === 'string' ? raw[k] : '');
  const num = (k: string) => (typeof raw[k] === 'number' && Number.isFinite(raw[k]) ? raw[k] : undefined);
  return {
    name: str('name'),
    phone: str('phone'),
    line1: str('line1'),
    district: str('district') || undefined,
    amphoe: str('amphoe') || undefined,
    province: str('province') || undefined,
    postcode: str('postcode') || undefined,
    paymentMethod: str('paymentMethod') || undefined,
    codAmountThb: num('codAmountThb'),
  };
}

export function mergeSameAddressOrders(orders: MergeableOrder[]): MergedShipment[] {
  const buckets = new Map<string, MergeableOrder[]>();
  const singles: MergeableOrder[] = [];

  for (const order of orders) {
    if (!isUnshippedPaid(order)) continue;
    const key = keyOfOrder(order);
    if (!key) {
      singles.push(order);
      continue;
    }
    const list = buckets.get(key) ?? [];
    list.push(order);
    buckets.set(key, list);
  }

  const groups: MergedShipment[] = [];
  for (const [key, list] of buckets) {
    groups.push(buildGroup(key, list));
  }
  for (const order of singles) {
    groups.push(buildGroup(`solo:${order.id}`, [order]));
  }
  groups.sort(
    (a, b) => b.orderIds.length - a.orderIds.length || a.recipient.name.localeCompare(b.recipient.name, 'th'),
  );
  return groups;
}

function buildGroup(addressKey: string, list: MergeableOrder[]): MergedShipment {
  const first = list[0]!;
  const packed = new Map<string, PackedLine>();
  let merchandiseThb = 0;
  let shippingFeeThb = 0;
  let codAmountThb = 0;
  let prepaidAmountThb = 0;
  const kinds = new Set<'PAID' | 'COD'>();

  for (const order of list) {
    merchandiseThb += order.merchandiseThb;
    shippingFeeThb += order.shippingFeeThb ?? 0;
    const kind = paymentKindOf(order.shipping.paymentMethod);
    kinds.add(kind);
    const due = order.shipping.codAmountThb ?? order.merchandiseThb + (order.shippingFeeThb ?? 0);
    if (kind === 'COD') codAmountThb += due;
    else prepaidAmountThb += order.merchandiseThb + (order.shippingFeeThb ?? 0);

    for (const line of order.lines) {
      const key = lineKey(line);
      const existing = packed.get(key);
      const qty = Math.max(0, Math.trunc(line.qty));
      if (existing) {
        existing.qty += qty;
        existing.lineTotal += qty * line.unitPrice;
      } else {
        packed.set(key, {
          title: (line.title ?? line.sku ?? 'สินค้า').trim() || 'สินค้า',
          option: optionOf(line),
          sku: (line.sku ?? '').trim(),
          qty,
          unitPrice: line.unitPrice,
          lineTotal: qty * line.unitPrice,
          productId: line.productId,
          imageUri: line.imageUri,
        });
      }
    }
  }

  const lines = [...packed.values()].filter((l) => l.qty > 0);
  const paymentKind: MergedShipment['paymentKind'] =
    kinds.size > 1 ? 'MIXED' : kinds.has('COD') ? 'COD' : 'PAID';

  return {
    addressKey,
    merchantId: first.merchantId,
    orderIds: list.map((o) => o.id),
    recipient: first.shipping,
    paymentKind,
    codAmountThb,
    prepaidAmountThb,
    merchandiseThb,
    shippingFeeThb,
    netTotalThb: merchandiseThb + shippingFeeThb,
    totalQty: lines.reduce((n, l) => n + l.qty, 0),
    lines,
    trackingNumber: list.map((o) => o.trackingNumber).find(Boolean) ?? undefined,
    shippingCarrier: list.map((o) => o.shippingCarrier).find(Boolean) ?? undefined,
  };
}
