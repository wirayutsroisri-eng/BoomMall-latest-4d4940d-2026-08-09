import { create } from 'zustand';
import type { MatchingNotifyItem } from '../domain/types';

type MatchingNotifyState = {
  items: MatchingNotifyItem[];
  /** Latest banner to show on Home (cleared after dismiss / tap). */
  activeBanner: MatchingNotifyItem | null;
  push: (
    item: Omit<MatchingNotifyItem, 'id' | 'createdAt'> & { id?: string },
    opts?: { showBanner?: boolean },
  ) => MatchingNotifyItem;
  dismissBanner: () => void;
  clear: () => void;
};

let notifySeq = 0;

export const useMatchingNotifyStore = create<MatchingNotifyState>((set) => ({
  items: [],
  activeBanner: null,
  push: (input, opts) => {
    notifySeq += 1;
    const item: MatchingNotifyItem = {
      id: input.id ?? `match-noti-${notifySeq}-${Date.now()}`,
      title: input.title,
      body: input.body,
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
    };
    const showBanner = opts?.showBanner !== false;
    set((state) => ({
      items: [item, ...state.items].slice(0, 40),
      activeBanner: showBanner ? item : state.activeBanner,
    }));
    return item;
  },
  dismissBanner: () => set({ activeBanner: null }),
  clear: () => set({ items: [], activeBanner: null }),
}));
