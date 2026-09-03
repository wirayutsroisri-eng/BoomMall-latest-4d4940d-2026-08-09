import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import { apiFetch } from '@/shared/api/apiBase';
import type { SocialPostDto } from './mapSocialPost';

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

async function patch(path: string, body: unknown) {
  const base = getApiBase();
  if (!base) return null;
  try {
    const res = await apiFetch(`${base}${path}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

async function del(path: string) {
  const base = getApiBase();
  if (!base) return false;
  try {
    const res = await apiFetch(`${base}${path}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
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

export function syncFeedSave(contentId: string, saved: boolean) {
  return post('/api/v1/feed/signals', { kind: saved ? 'save' : 'unsave', contentId });
}

export function syncFeedHide(contentId: string, hidden: boolean) {
  return post('/api/v1/feed/signals', { kind: hidden ? 'hide' : 'unhide', contentId });
}

export function syncFeedBlockUser(userId: string, blocked: boolean) {
  return post('/api/v1/feed/signals', { kind: blocked ? 'block_user' : 'unblock_user', contentId: userId });
}

export function syncFeedShare(contentId: string) {
  return post('/api/v1/feed/signals', { kind: 'share', contentId });
}

export async function publishSocialPost(input: {
  body: string;
  media?: unknown;
  lat?: number;
  lng?: number;
  locationLabel?: string;
  tags?: string[];
  linkUrl?: string;
  lane?: string;
  products?: Array<{ productId: string; skuId?: string; mediaId?: string; x?: number; y?: number }>;
}): Promise<SocialPostDto | null> {
  const base = getApiBase();
  if (!base) throw new Error('FEED_API_UNAVAILABLE');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  console.info('[POST_FLOW] 05 create post start');
  console.info('[POST_MEDIA] create post start');
  try {
    const response = await fetch(`${base}/api/v1/feed/posts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const json = await response.json().catch(() => null) as {
      data?: SocialPostDto;
      error?: { code?: string; message?: string };
    } | null;
    if ((response.status !== 200 && response.status !== 201) || !json?.data) {
      const error = new Error(json?.error?.code || json?.error?.message || 'FEED_PUBLISH_FAILED') as Error & { statusCode?: number };
      error.statusCode = response.status;
      throw error;
    }
    console.info('[POST_FLOW] 06 create post success', {
      postId: json.data.id,
      statusCode: response.status,
    });
    console.info('[POST_MEDIA] create post success', { postId: json.data.id });
    return json.data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('FEED_PUBLISH_TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncFeedPostUpdate(
  postId: string,
  input: {
    body: string;
    media?: unknown;
    lat?: number;
    lng?: number;
    locationLabel?: string;
    tags?: string[];
    linkUrl?: string | null;
    lane?: string;
  },
): Promise<SocialPostDto | null> {
  const json = (await patch(`/api/v1/feed/posts/${encodeURIComponent(postId)}`, input)) as {
    data?: SocialPostDto;
  } | null;
  return json?.data ?? null;
}

export async function syncFeedPostDelete(postId: string): Promise<boolean> {
  if (postId.startsWith('feed-user-')) return true;
  return del(`/api/v1/feed/posts/${encodeURIComponent(postId)}`);
}

export async function fetchFeedPosts(
  tab?: string,
  geo?: { lat: number; lng: number; radiusKm?: number },
  options?: { mine?: boolean; refresh?: boolean; excludeIds?: string[] },
): Promise<SocialPostDto[]> {
  const base = getApiBase();
  if (!base) return [];
  const q = new URLSearchParams();
  if (tab) q.set('tab', tab);
  if (options?.mine) q.set('mine', '1');
  if (options?.refresh) {
    q.set('refresh', '1');
    q.set('_ts', String(Date.now()));
  }
  if (options?.excludeIds?.length) {
    q.set('excludeIds', options.excludeIds.slice(0, 80).join(','));
  }
  if (geo) {
    q.set('lat', String(geo.lat));
    q.set('lng', String(geo.lng));
    if (geo.radiusKm) q.set('radiusKm', String(geo.radiusKm));
  }
  try {
    const authentication = authHeaders();
    const headers = { ...authentication, 'cache-control': 'no-cache' };
    const recommendationPath = tab === 'foryou' && !options?.mine && !options?.refresh && Boolean(authentication.Authorization)
      ? '/api/v1/recommendations/feed?limit=40'
      : `/api/v1/feed/posts?${q.toString()}`;
    const res = await fetch(`${base}${recommendationPath}`, {
      headers,
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: SocialPostDto[] | { items?: SocialPostDto[] } };
    if (Array.isArray(json?.data)) return json.data;
    return Array.isArray(json?.data?.items) ? json.data.items : [];
  } catch {
    return [];
  }
}

export async function syncFeedComment(
  postId: string,
  text: string,
  parentId?: string,
): Promise<SocialCommentDto | null> {
  const json = await post(`/api/v1/feed/posts/${encodeURIComponent(postId)}/comments`, {
    body: text,
    parentId,
  });
  if (!json || typeof json !== 'object') return null;
  const data = (json as { data?: SocialCommentDto }).data;
  return data?.id ? data : null;
}

export type SocialCommentDto = {
  id: string;
  postId: string;
  authorId: string;
  authorName?: string | null;
  authorHandle?: string | null;
  parentId: string | null;
  body: string;
  likeCount: number;
  createdAt: string;
};

/** `null` = network/API failure (keep cached comments). `[]` = no comments on server. */
export async function fetchFeedComments(postId: string): Promise<SocialCommentDto[] | null> {
  const base = getApiBase();
  if (!base) return null;
  try {
    const res = await apiFetch(`${base}/api/v1/feed/posts/${encodeURIComponent(postId)}/comments`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: SocialCommentDto[] };
    return Array.isArray(json?.data) ? json.data : [];
  } catch {
    return null;
  }
}
