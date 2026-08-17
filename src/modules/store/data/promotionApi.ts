import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';

export type PromotionPackage = {
  packageType: string;
  label: string;
  priceThb: number;
  durationDays: number;
};

export type SellerPromotion = {
  id: string;
  productId: string;
  packageType: string;
  packageLabel: string;
  priceThb: number;
  durationDays: number;
  startDate: string | null;
  endDate: string | null;
  paymentStatus: 'pending' | 'paid' | 'failed';
  adStatus: 'pending_review' | 'active' | 'expired' | 'rejected' | 'stopped';
  rejectReason: string | null;
  createdAt: string;
};

export type SellerNotification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  kind: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
};

export const FALLBACK_PACKAGES: PromotionPackage[] = [
  { packageType: 'boost_3d', label: '3 วัน', priceThb: 199, durationDays: 3 },
  { packageType: 'boost_7d', label: '7 วัน', priceThb: 399, durationDays: 7 },
  { packageType: 'boost_15d', label: '15 วัน', priceThb: 699, durationDays: 15 },
  { packageType: 'boost_30d', label: '30 วัน', priceThb: 1190, durationDays: 30 },
];

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  if (!base) {
    throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ (EXPO_PUBLIC_API_URL)');
  }
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

export function fetchPromotionPackages() {
  return req<{ ok: true; data: PromotionPackage[] }>('/api/v1/promotions/packages');
}

export function createProductPromotion(input: {
  productId: string;
  productTitle: string;
  shopName?: string;
  productImageUrl?: string;
  productMediaType?: 'image' | 'video';
  packageType: string;
  paymentProofUrl?: string;
  transactionId?: string;
}) {
  return req<{ ok: true; data: SellerPromotion; message?: string }>('/api/v1/promotions/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchMyPromotions(productId?: string) {
  const q = productId ? `?productId=${encodeURIComponent(productId)}` : '';
  return req<{ ok: true; data: SellerPromotion[] }>(`/api/v1/promotions/mine${q}`);
}

export function fetchSellerNotifications(unreadOnly = true) {
  const q = unreadOnly ? '?unread=1' : '';
  return req<{ ok: true; data: SellerNotification[] }>(`/api/v1/promotions/notifications${q}`);
}

export function markSellerNotificationsRead(ids?: string[]) {
  return req<{ ok: true; data: { ok: true } }>('/api/v1/promotions/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}
