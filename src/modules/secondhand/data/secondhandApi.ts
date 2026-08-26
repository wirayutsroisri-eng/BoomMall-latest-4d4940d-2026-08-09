import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import { apiFetch } from '@/shared/api/apiBase';

async function request(path: string, init: RequestInit) {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ BoomMall');
  const response = await apiFetch(`${base}${path}`, { ...init, headers: authHeaders(init.headers as Record<string, string> | undefined) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.ok === false) throw new Error(json?.error?.message ?? `ดำเนินการไม่สำเร็จ (${response.status})`);
  return json;
}

export function reportSecondhandListing(input: { listingId: string; sellerUserId: string; targetLabel: string; reason: string; description?: string }) {
  return request('/api/v1/moderation/secondhand/reports', { method: 'POST', body: JSON.stringify(input) });
}

export type ListingStatus = 'ACTIVE' | 'RESERVED' | 'SOLD' | 'HIDDEN' | 'REMOVED' | 'EXPIRED';
export function updateSecondhandStatus(listingId: string, status: ListingStatus) {
  return request(`/api/v1/feed/posts/${encodeURIComponent(listingId)}/secondhand-status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
