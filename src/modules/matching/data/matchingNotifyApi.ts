import { getApiBase, useAuthStore } from '@/modules/auth/state/auth-store';
import { apiFetch } from '@/shared/api/apiBase';

export async function notifyMatchedProviders(input: {
  userIds: string[];
  title: string;
  body: string;
  feedId?: string;
  conversationId?: string;
}): Promise<void> {
  const userIds = [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))];
  if (!userIds.length) return;

  const base = getApiBase();
  if (!base) return;

  const token = useAuthStore.getState().sessionToken;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await apiFetch(`${base}/api/v1/notify/matching`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      userIds,
      title: input.title,
      body: input.body,
      feedId: input.feedId,
      conversationId: input.conversationId,
    }),
  });
  if (!res.ok) {
    throw new Error(`notify/matching ${res.status}`);
  }
}
