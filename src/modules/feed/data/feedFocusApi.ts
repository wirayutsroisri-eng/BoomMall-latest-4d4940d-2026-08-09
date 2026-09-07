import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import type { SocialPostDto } from './mapSocialPost';
export type FeedFocus = { mode: 'temporary_focus'; query: string; targetWeight: 0.75 };
export function newFocusSessionId() {
  return `focus_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
async function request(path: string, init?: RequestInit) {
  const base = getApiBase();
  if (!base) throw new Error('ไม่สามารถเชื่อมต่อ Feed ได้');
  const response = await fetch(`${base}/api/v1/feed/${path}`, {
    ...init, headers: { ...authHeaders(), 'Content-Type': 'application/json' }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('โหลด Feed ไม่สำเร็จ กรุณาลองอีกครั้ง');
  return response.json();
}
export async function setTemporaryFeedFocus(sessionId: string, query: string | null): Promise<FeedFocus | null> {
  return (await request('focus', { method: 'PUT', body: JSON.stringify({ sessionId, query }) })).data;
}
export async function loadTemporaryFeed(sessionId: string): Promise<{ data: SocialPostDto[]; focus: FeedFocus | null }> {
  return request(`posts?focusSessionId=${encodeURIComponent(sessionId)}`);
}
