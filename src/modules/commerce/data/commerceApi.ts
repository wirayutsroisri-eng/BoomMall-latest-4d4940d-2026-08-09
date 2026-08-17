import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import type { MasterSku, SkuVariant, WarehouseStock } from '@/modules/commerce/domain/types';

export type CatalogBundle = {
  product: MasterSku;
  variants: SkuVariant[];
  stock: WarehouseStock[];
};

export type CommerceShippingSnapshot = {
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

export type CommerceOrder = {
  id: string;
  buyerId: string;
  merchantId?: string | null;
  status: string;
  merchandiseThb: number;
  shippingFeeThb?: number;
  lines: Array<{
    variantId: string;
    warehouseId: string;
    qty: number;
    unitPrice: number;
    productId?: string;
    title?: string;
    sku?: string;
    label?: string;
    color?: string;
    variant?: string;
    image?: string;
  }>;
  gpBps?: number | null;
  gpAmountThb?: number;
  netToMerchantThb?: number | null;
  pspRef: string | null;
  paidAt: string | null;
  trackingNumber?: string | null;
  shippingCarrier?: string | null;
  shippingStatus?: string | null;
  courierEvent?: string | null;
  shipping?: CommerceShippingSnapshot;
  addressMergeKey?: string | null;
  shipmentGroupId?: string | null;
  createdAt: string;
};

export type ShippingLabelPreview = {
  merchantId: string;
  scanned: number;
  mergedCount: number;
  labelCount: number;
  groups: Array<{
    addressKey: string;
    orderIds: string[];
    recipientName: string;
    recipientPhone: string;
    address: string;
    paymentKind: 'PAID' | 'COD' | 'MIXED';
    codAmountThb: number;
    totalQty: number;
    netTotalThb: number;
    lineCount: number;
    trackingNumber: string | null;
  }>;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (EXPO_PUBLIC_API_URL)');
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export function fetchCommerceCatalog(merchantId?: string) {
  const q = merchantId?.trim()
    ? `?merchantId=${encodeURIComponent(merchantId.trim())}`
    : '';
  return req<{ ok: true; data: CatalogBundle[] }>(`/api/v1/commerce/catalog${q}`);
}

export function upsertCommerceProduct(bundle: CatalogBundle) {
  return req<{ ok: true; data: CatalogBundle }>('/api/v1/commerce/catalog', {
    method: 'PUT',
    body: JSON.stringify(bundle),
  });
}

export function syncCommerceCatalog(products: CatalogBundle[]) {
  return req<{ ok: true; data: CatalogBundle[] }>('/api/v1/commerce/catalog/sync', {
    method: 'POST',
    body: JSON.stringify({ products }),
  });
}

export function deleteCommerceProduct(id: string) {
  return req<{ ok: true; data: { ok: true; id: string } }>(
    `/api/v1/commerce/catalog/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
}

export function createCommerceOrder(input: {
  lines: CommerceOrder['lines'];
  shippingFeeThb?: number;
  shipping?: CommerceShippingSnapshot;
  paymentMethod?: string;
  idempotencyKey?: string;
}) {
  return req<{ ok: true; data: CommerceOrder }>('/api/v1/commerce/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchMerchantOrders(status?: string) {
  const q = status?.trim() ? `?status=${encodeURIComponent(status.trim())}` : '';
  return req<{ ok: true; data: CommerceOrder[] }>(`/api/v1/commerce/merchant/orders${q}`);
}

export function fetchShippingLabelPreview(orderIds?: string[]) {
  const q = orderIds?.length ? `?orderIds=${encodeURIComponent(orderIds.join(','))}` : '';
  return req<{ ok: true; data: ShippingLabelPreview }>(`/api/v1/commerce/shipping/labels/preview${q}`);
}

export async function downloadShippingLabelsPdf(input?: {
  orderIds?: string[];
  carrier?: string;
  persist?: boolean;
  packingLines?: Array<{
    title: string;
    option?: string;
    sku?: string;
    qty: number;
    unitPrice: number;
    productId?: string;
    imageUri?: string;
  }>;
}): Promise<{ bytes: Uint8Array; filename: string; mime: string; labelCount: number }> {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (EXPO_PUBLIC_API_URL)');
  const res = await fetch(`${base}/api/v1/commerce/shipping/labels/print`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`);
  }
  const disp = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disp);
  const filename = match?.[1] ?? 'boommall-shipping-labels.pdf';
  const ab = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(ab),
    filename,
    mime: res.headers.get('Content-Type') ?? 'application/pdf',
    labelCount: Number(res.headers.get('X-BoomMall-Label-Count') ?? 0) || 0,
  };
}

export async function downloadPickListPdf(input?: {
  orderIds?: string[];
  lines?: Array<{
    title: string;
    option?: string;
    sku?: string;
    qty: number;
    warehouseId?: string;
    orderId?: string;
    imageUri?: string;
  }>;
}): Promise<{ bytes: Uint8Array; filename: string; mime: string; skuCount: number; pieceCount: number }> {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (EXPO_PUBLIC_API_URL)');
  const res = await fetch(`${base}/api/v1/commerce/shipping/pick-list/print`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`);
  }
  const disp = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disp);
  const filename = match?.[1] ?? 'boommall-picklist.pdf';
  const ab = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(ab),
    filename,
    mime: res.headers.get('Content-Type') ?? 'application/pdf',
    skuCount: Number(res.headers.get('X-BoomMall-Pick-Sku') ?? 0) || 0,
    pieceCount: Number(res.headers.get('X-BoomMall-Pick-Pieces') ?? 0) || 0,
  };
}

export function updateCommerceOrderShipping(
  orderId: string,
  input: { trackingNumber?: string; shippingCarrier?: string; shippingStatus?: string },
) {
  return req<{ ok: true; data: CommerceOrder }>(
    `/api/v1/commerce/orders/${encodeURIComponent(orderId)}/shipping`,
    { method: 'PATCH', body: JSON.stringify(input) },
  );
}

export function simulateCourierTracking(input: {
  trackingNumber: string;
  event: 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RETURNED';
  carrier?: string;
}) {
  return req<{ ok: true; data: { trackingNumber: string; event: string; orderIds: string[] } }>(
    '/api/v1/commerce/shipping/tracking/simulate',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function payCommerceOrder(orderId: string, idempotencyKey?: string) {
  return req<{ ok: true; data: CommerceOrder }>(
    `/api/v1/commerce/orders/${encodeURIComponent(orderId)}/pay`,
    { method: 'POST', body: JSON.stringify({ idempotencyKey }) },
  );
}

export function recordCommerceEvent(input: {
  name: string;
  entityType?: string;
  entityId?: string;
  payload?: unknown;
}) {
  return req<{ ok: true }>('/api/v1/commerce/events', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type MerchantLedger = {
  merchantId: string;
  heldThb: number;
  payableThb: number;
  queuedThb: number;
  paidOutThb: number;
  nextReleaseAt: string | null;
  orders: Array<{
    id: string;
    merchandiseThb: number;
    gpAmountThb: number;
    netToMerchantThb: number | null;
    shippingStatus: string | null;
    settlementStatus: string;
    returnStatus: string;
    completedAt: string | null;
    releaseEligibleAt: string | null;
    paidAt: string | null;
  }>;
};

export type SellerFinanceDashboard = {
  storeId: string;
  name?: string;
  availableBalance: number;
  pendingBalance: number;
  totalPaidOut: number;
  autoCompleteDays?: number;
  customGpPercent: number | null;
  security?: {
    pinSet: boolean;
    pinLockedUntil: string | null;
    pinLockRemainingMs: number;
    bankUpdatedAt: string | null;
    bankCoolingRemainingMs: number;
  };
  taxProfile?: {
    taxId: string | null;
    address: string | null;
    isCorporate?: boolean;
  };
  bankAccount: {
    bankName: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
    bankCode?: string | null;
  } | null;
  orders: Array<{
    orderId: string;
    grossAmount: number;
    shippingFee?: number;
    gpPercent: number;
    gpAmount: number;
    netMerchantAmount: number;
    releaseStatus: string;
    releaseDueDate: string | null;
    paidOutAt?: string | null;
    payoutProof?: string | null;
    createdAt?: string;
  }>;
  withdrawals: Array<{
    id: string;
    amount: number;
    status: string;
    bankName?: string | null;
    bankAccountNo?: string | null;
    bankAccountName?: string | null;
    proofOfTransfer?: string | null;
    transferredAt?: string | null;
    createdAt: string;
  }>;
};

export function fetchSellerFinanceDashboard() {
  return req<{ ok: true; data: SellerFinanceDashboard }>('/api/v1/finance/seller/dashboard');
}

export function requestSellerWithdraw(amountThb: number, pin: string) {
  return req<{
    ok: true;
    data: {
      id: string;
      amount: number;
      status: string;
      payoutChannel?: 'MANUAL' | 'AUTO';
      message?: string;
      createdAt: string;
    };
  }>('/api/v1/finance/seller/withdraw', { method: 'POST', body: JSON.stringify({ amount: amountThb, pin }) });
}

export function setSellerPaymentPin(input: { pin: string; password?: string; currentPin?: string }) {
  return req<{ ok: true; data: { ok: true; pinSet: boolean } }>('/api/v1/finance/seller/payment-pin', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function saveSellerBankAccount(input: {
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  bankCode?: string;
  taxId?: string;
  address?: string;
  isCorporate?: boolean;
}) {
  return req<{
    ok: true;
    data: {
      storeId: string;
      taxProfile?: {
        taxId: string | null;
        address: string | null;
        isCorporate: boolean;
      };
      bankAccount: {
        bankName: string | null;
        bankAccountNo: string | null;
        bankAccountName: string | null;
        bankCode: string | null;
      };
      bankUpdatedAt?: string | null;
      coolingOffHours?: number;
    };
  }>('/api/v1/finance/seller/bank-account', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchMerchantLedger(merchantId?: string) {
  const q = merchantId?.trim() ? `?merchantId=${encodeURIComponent(merchantId.trim())}` : '';
  return req<{ ok: true; data: MerchantLedger }>(`/api/v1/commerce/merchant/ledger${q}`);
}

export type SellerStatementSummary = {
  grossSales: number;
  platformGpFee: number;
  netEarningsPaid: number;
  netReleased: number;
  totalOrders: number;
  pendingOrders: number;
};

export type SellerStatementBundle = {
  period: { from: string | Date; to: string | Date; label: string; month?: number; year?: number };
  store: {
    id: string;
    name: string;
    taxId: string | null;
    address?: string | null;
    bankName: string | null;
    bankAccountNo: string | null;
    bankAccountName: string | null;
  };
  summary: SellerStatementSummary;
  lines: Array<{
    date: string;
    orderId: string;
    gross: number;
    gp: number;
    net: number;
    releaseStatus: string;
    payoutStatus: string;
    paidOutAt: string | null;
  }>;
  generatedAt: string;
};

export type SellerStatementQuery = {
  month?: number;
  year?: number;
  from?: string;
  to?: string;
};

function statementQueryString(q: SellerStatementQuery & { format?: string }) {
  const p = new URLSearchParams();
  if (q.month != null) p.set('month', String(q.month).padStart(2, '0'));
  if (q.year != null) p.set('year', String(q.year));
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.format) p.set('format', q.format);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function fetchSellerStatement(q: SellerStatementQuery) {
  return req<{ ok: true; data: SellerStatementBundle }>(
    `/api/v1/seller/reports/statement${statementQueryString({ ...q, format: 'json' })}`,
  );
}

/** ดาวน์โหลด PDF / Excel เป็น binary */
export async function downloadSellerStatementFile(
  q: SellerStatementQuery & { format: 'pdf' | 'xlsx' },
): Promise<{ bytes: Uint8Array; filename: string; mime: string }> {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (EXPO_PUBLIC_API_URL)');
  const path = `/api/v1/seller/reports/statement${statementQueryString(q)}`;
  const res = await fetch(`${base}${path}`, { headers: authHeaders() });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`);
  }
  const disp = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disp);
  const filename =
    match?.[1] ??
    `boommall-seller-statement.${q.format === 'pdf' ? 'pdf' : 'xlsx'}`;
  const mime =
    res.headers.get('Content-Type') ??
    (q.format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const ab = await res.arrayBuffer();
  return { bytes: new Uint8Array(ab), filename, mime };
}

export function confirmCommerceOrder(orderId: string, role: 'buyer' | 'seller') {
  return req<{ ok: true; data: CommerceOrder }>(
    `/api/v1/commerce/orders/${encodeURIComponent(orderId)}/confirm`,
    { method: 'POST', body: JSON.stringify({ role }) },
  );
}

export function fetchCommerceGpRate() {
  return req<{
    ok: true;
    data: {
      gpBps: number;
      gpPercent: number;
      sampleAmountThb: number;
      sampleGpAmountThb: number;
      sampleNetToMerchantThb: number;
    };
  }>('/api/v1/commerce/gp/rate');
}
