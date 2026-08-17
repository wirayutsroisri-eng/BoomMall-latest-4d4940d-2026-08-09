import { create } from 'zustand';

export type SellerBanner = {
  id: string;
  title: string;
  body: string;
};

type SellerNotifyState = {
  activeBanner: SellerBanner | null;
  seenIds: Record<string, true>;
  push: (item: SellerBanner) => void;
  dismissBanner: () => void;
};

export const useSellerNotifyStore = create<SellerNotifyState>((set, get) => ({
  activeBanner: null,
  seenIds: {},
  push: (item) => {
    if (get().seenIds[item.id]) return;
    set((s) => ({
      activeBanner: item,
      seenIds: { ...s.seenIds, [item.id]: true },
    }));
  },
  dismissBanner: () => set({ activeBanner: null }),
}));
