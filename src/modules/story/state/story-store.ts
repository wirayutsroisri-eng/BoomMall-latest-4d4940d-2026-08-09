import { create } from 'zustand';
import { fetchStories, publishStory, recordStoryView } from '../data/storyApi';
import type { Story, StoryOverlay } from '../domain/types';

let latestRefreshId = 0;

type StoryState = {
  stories: Story[];
  loading: boolean;
  refresh: () => Promise<void>;
  create: (input: { mediaAssetId: string; thumbnailAssetId?: string; caption?: string; overlayJson: StoryOverlay[] }) => Promise<Story>;
  markViewed: (storyId: string) => Promise<void>;
};

export const useStoryStore = create<StoryState>((set, get) => ({
  stories: [],
  loading: false,
  refresh: async () => {
    const refreshId = ++latestRefreshId;
    set({ loading: true });
    try {
      const stories = await fetchStories();
      if (refreshId === latestRefreshId) set({ stories });
    } finally {
      if (refreshId === latestRefreshId) set({ loading: false });
    }
  },
  create: async (input) => {
    const story = await publishStory(input);
    set((state) => ({ stories: [...state.stories.filter((item) => item.id !== story.id), story] }));
    return story;
  },
  markViewed: async (storyId) => {
    if (get().stories.find((story) => story.id === storyId)?.viewed) return;
    set((state) => ({ stories: state.stories.map((story) => story.id === storyId ? { ...story, viewed: true } : story) }));
    await recordStoryView(storyId);
  },
}));
