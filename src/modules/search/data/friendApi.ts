import { getApiBase, useAuthStore } from '@/modules/auth/state/auth-store';
import type { TrustInfo } from '@/shared/components/TrustBadge';

export type FriendProfile = {
  userId: string;
  snowflakeId?: string;
  friendCode: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  trust?: TrustInfo | null;
};

function headers() {
  const token = useAuthStore.getState().sessionToken;
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์');
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers(), ...init?.headers } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json?.ok === false) throw new Error(json?.error?.message ?? 'เชื่อมต่อระบบเพื่อนไม่สำเร็จ');
  return json.data as T;
}

export function searchFriendProfiles(query: string) {
  return request<FriendProfile[]>(`/api/v1/friends/search?q=${encodeURIComponent(query)}`);
}

export function getMyFriendIdentity() {
  return request<FriendProfile>('/api/v1/friends/me');
}

export function sendFriendRequest(receiverId: string) {
  return request('/api/v1/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ receiverId }),
  });
}

export function createFriendInvite() {
  return request<{ token: string; deepLink: string; expiresAt: string }>('/api/v1/friends/invites', { method: 'POST', body: '{}' });
}

export function resolveFriendInvite(token: string) {
  return request<FriendProfile>('/api/v1/friends/invites/resolve', { method: 'POST', body: JSON.stringify({ token }) });
}

export type FriendRequestRow = {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  direction: 'incoming' | 'outgoing';
  peer: FriendProfile;
};

export function listFriendRequests() {
  return request<FriendRequestRow[]>('/api/v1/friends/requests');
}

export function respondFriendRequest(id: string, action: 'accept' | 'reject') {
  return request(`/api/v1/friends/requests/${encodeURIComponent(id)}/respond`, {
    method: 'POST', body: JSON.stringify({ action }),
  });
}
