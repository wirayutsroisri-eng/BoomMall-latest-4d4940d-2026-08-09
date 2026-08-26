import { authHeaders, getApiBase } from '@/modules/auth/state/auth-store';
import type { Story, StoryOverlay } from '../domain/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}/api/v1/stories${path}`, {
    ...init,
    headers: authHeaders(init?.headers as Record<string, string> | undefined),
  });
  const json = await response.json().catch(() => null) as { data?: T; error?: { message?: string; code?: string } } | null;
  if (!response.ok || !json?.data) throw new Error(json?.error?.message || json?.error?.code || `STORY_API_${response.status}`);
  return json.data;
}

export const fetchStories = () => request<Story[]>('/feed');
export const publishStory = (input: { mediaAssetId: string; thumbnailAssetId?: string; caption?: string; overlayJson: StoryOverlay[] }) =>
  request<Story>('/', { method: 'POST', body: JSON.stringify(input) });
export const recordStoryView = (storyId: string) => request<{ id: string; viewed: boolean }>(`/${encodeURIComponent(storyId)}/view`, { method: 'POST', body: '{}' });
export const removeStory = (storyId: string) => request<unknown>(`/${encodeURIComponent(storyId)}`, { method: 'DELETE' });
