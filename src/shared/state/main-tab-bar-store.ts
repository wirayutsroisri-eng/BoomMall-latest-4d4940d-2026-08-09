import { create } from 'zustand';

type MainTabBarState = {
  hidden: boolean;
  setHidden: (hidden: boolean) => void;
};

export const useMainTabBarStore = create<MainTabBarState>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));
