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

export function fetchBoardCategories() {
  return req('GET', '/api/v1/board/categories');
}

export function fetchBoardThreads(categoryId?: string) {
  const q = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : '';
  return req('GET', `/api/v1/board/threads${q}`);
}

export function fetchBoardThread(id: string) {
  return req('GET', `/api/v1/board/threads/${encodeURIComponent(id)}`);
}

export function createBoardThread(input: { categoryId: string; title: string; body: string }) {
  return req('POST', '/api/v1/board/threads', input);
}

export function replyBoardThread(threadId: string, body: string, parentId?: string) {
  return req('POST', `/api/v1/board/threads/${encodeURIComponent(threadId)}/replies`, {
    body,
    parentId,
  });
}

export function voteBoard(targetType: 'THREAD' | 'REPLY', targetId: string, value: 1 | -1 | 0) {
  return req('POST', '/api/v1/board/vote', { targetType, targetId, value });
}
