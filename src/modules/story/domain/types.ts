export type StoryMediaType = 'image' | 'video';

export type StoryOverlay = {
  id: string;
  type: 'text' | 'emoji';
  value: string;
  color?: string;
  fontSize?: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type Story = {
  id: string;
  userId: string;
  mediaType: StoryMediaType;
  mediaUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  overlayJson: StoryOverlay[];
  createdAt: string;
  expiresAt: string;
  status: string;
  viewCount: number;
  viewed: boolean;
  user?: { userId: string; displayName?: string | null; handle?: string | null; avatarUrl?: string | null };
};

export type StoryGroup = { userId: string; stories: Story[]; viewed: boolean };

/** Only user-authored content is allowed into the published Story layer. */
export function storyContentOverlays(value: unknown): StoryOverlay[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoryOverlay => {
    if (!item || typeof item !== 'object') return false;
    const overlay = item as Partial<StoryOverlay>;
    return (overlay.type === 'text' || overlay.type === 'emoji')
      && typeof overlay.id === 'string'
      && typeof overlay.value === 'string'
      && typeof overlay.x === 'number'
      && typeof overlay.y === 'number'
      && typeof overlay.scale === 'number'
      && typeof overlay.rotation === 'number';
  });
}

export function groupStories(stories: Story[]): StoryGroup[] {
  const groups = new Map<string, Story[]>();
  for (const story of stories) groups.set(story.userId, [...(groups.get(story.userId) ?? []), story]);
  return [...groups].map(([userId, values]) => ({ userId, stories: values, viewed: values.every((story) => story.viewed) }));
}
