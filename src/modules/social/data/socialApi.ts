import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import { apiFetch } from '@/shared/api/apiBase';

async function req(method: string, path: string, body?: unknown) {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ BoomMall');
  try {
    const res = await apiFetch(`${base}${path}`, {
      method,
      headers: authHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error?.message ?? `เซิร์ฟเวอร์ไม่สามารถดำเนินการได้ (${res.status})`);
    }
    return json;
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ BoomMall ได้');
  }
}

export function apiFollow(handle: string) {
  return req('POST', '/api/v1/auth/follows', { handle });
}

export function apiUnfollow(handle: string) {
  return req('DELETE', '/api/v1/auth/follows', { handle });
}

export async function apiListFollowing(): Promise<string[]> {
  const json = await req('GET', '/api/v1/auth/follows/following');
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows.map((r: { followingHandle?: string }) => String(r.followingHandle ?? '')).filter(Boolean);
}

export function apiUpsertProfile(input: {
  displayName?: string;
  handle?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  privacy?: Record<string, unknown>;
}) {
  return req('POST', '/api/v1/auth/profiles', input);
}

export async function apiGetOwnProfile(): Promise<{
  displayName?: string | null;
  handle?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
} | null> {
  const json = await req('GET', '/api/v1/auth/me');
  const envelope = json && typeof json === 'object' ? (json as { data?: Record<string, unknown> }).data : null;
  const candidate = envelope?.profile;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const data = candidate as Record<string, unknown>;
  return {
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    handle: typeof data.handle === 'string' ? data.handle : null,
    bio: typeof data.bio === 'string' ? data.bio : null,
    avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
    coverUrl: typeof data.coverUrl === 'string' ? data.coverUrl : null,
  };
}

export async function apiDeleteAccount() {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ไม่สามารถลบบัญชีบนเซิร์ฟเวอร์ได้');
  const res = await apiFetch(`${base}/api/v1/auth/me`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json?.error?.message ?? `ลบบัญชีไม่สำเร็จ (${res.status})`);
  }
  return json;
}

export function apiRegisterEmail(email: string, password: string, displayName?: string) {
  return req('POST', '/api/v1/auth/register', { email, password, displayName });
}

export function apiLoginEmail(email: string, password: string) {
  return req('POST', '/api/v1/auth/login', { email, password });
}
