import { create } from 'zustand';

type MainTabBarState = {
  hidden: boolean;
  activeMainChannelId: string;
  homeRefreshNonce: number;
  setHidden: (hidden: boolean) => void;
  setActiveMainChannelId: (channelId: string) => void;
  requestHomeRefresh: () => void;
};

export const useMainTabBarStore = create<MainTabBarState>((set) => ({
  hidden: false,
  activeMainChannelId: 'feed',
  homeRefreshNonce: 0,
  setHidden: (hidden) => set({ hidden }),
  setActiveMainChannelId: (activeMainChannelId) => set({ activeMainChannelId }),
  requestHomeRefresh: () => set((state) => ({ homeRefreshNonce: state.homeRefreshNonce + 1 })),
}));
