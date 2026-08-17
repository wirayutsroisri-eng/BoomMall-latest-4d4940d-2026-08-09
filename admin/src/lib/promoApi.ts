import { getActor, getApiKey } from './api';

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);
  headers.set('X-Admin-Actor', getActor());
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}

export type AdStatus = 'pending_review' | 'active' | 'expired' | 'rejected' | 'stopped';
export type PaymentStatus = 'pending' | 'paid' | 'failed';

export type ProductPromotion = {
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

export type PromoFilter = 'pending' | 'active' | 'expired' | 'all';

export function fetchAdminPromotions(filter: PromoFilter = 'all') {
  const q = filter === 'all' ? '' : `?filter=${encodeURIComponent(filter)}`;
  return req<{ ok: true; data: ProductPromotion[] }>(`/api/v1/admin/promotions${q}`);
}

export function patchPromotionStatus(
  id: string,
  body: {
    action: 'approve' | 'reject' | 'stop' | 'extend';
    rejectReason?: string;
    extraDays?: number;
    paymentStatus?: PaymentStatus;
  },
) {
  return req<{ ok: true; data: ProductPromotion }>(
    `/api/v1/admin/promotions/${encodeURIComponent(id)}/status`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}
