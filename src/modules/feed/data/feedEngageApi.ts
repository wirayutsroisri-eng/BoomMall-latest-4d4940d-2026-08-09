import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';

async function post(path: string, body: unknown) {
  const base = getApiBase();
  if (!base) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export function syncFeedLike(contentId: string, liked: boolean) {
  return post(`/api/v1/feed/posts/${encodeURIComponent(contentId)}/like`, { liked });
}

export function syncFeedNotInterested(contentId: string) {
  return post('/api/v1/feed/signals', { kind: 'not_interested', contentId });
}

export function syncFeedInterested(contentId: string) {
  return post('/api/v1/feed/signals', { kind: 'interested', contentId });
}

export function syncFeedShare(contentId: string) {
  return post('/api/v1/feed/signals', { kind: 'share', contentId });
}

export function publishSocialPost(input: {
  body: string;
  media?: unknown;
  lat?: number;
  lng?: number;
  locationLabel?: string;
  tags?: string[];
  linkUrl?: string;
  lane?: string;
}) {
  return post('/api/v1/feed/posts', input);
}

export function fetchFeedPosts(tab?: string, geo?: { lat: number; lng: number; radiusKm?: number }) {
  const base = getApiBase();
  if (!base) return Promise.resolve(null);
  const q = new URLSearchParams();
  if (tab) q.set('tab', tab);
  if (geo) {
    q.set('lat', String(geo.lat));
    q.set('lng', String(geo.lng));
    if (geo.radiusKm) q.set('radiusKm', String(geo.radiusKm));
  }
  const headers = authHeaders();
  return fetch(`${base}/api/v1/feed/posts?${q.toString()}`, { headers })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

export function syncFeedComment(postId: string, text: string, parentId?: string) {
  return post(`/api/v1/feed/posts/${encodeURIComponent(postId)}/comments`, {
    body: text,
    parentId,
  });
}
