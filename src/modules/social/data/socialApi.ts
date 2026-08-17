import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';

async function req(method: string, path: string, body?: unknown) {
  const base = getApiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: authHeaders(),
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
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

export async function apiDeleteAccount() {
  const base = getApiBase();
  if (!base) throw new Error('ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ — ไม่สามารถลบบัญชีบนเซิร์ฟเวอร์ได้');
  const res = await fetch(`${base}/api/v1/auth/me`, {
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
