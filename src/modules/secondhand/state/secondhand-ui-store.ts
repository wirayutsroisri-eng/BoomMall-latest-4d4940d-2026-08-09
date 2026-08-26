import { create } from 'zustand';

export type SecondhandDraftMedia = { uri: string; width?: number; height?: number };

type SecondhandUiState = {
  createSheetNonce: number;
  draftMedia: SecondhandDraftMedia[];
  requestCreateSheet: () => void;
  setDraftMedia: (media: SecondhandDraftMedia[]) => void;
  clearDraft: () => void;
};

export const useSecondhandUiStore = create<SecondhandUiState>((set) => ({
  createSheetNonce: 0,
  draftMedia: [],
  requestCreateSheet: () => set((state) => ({ createSheetNonce: state.createSheetNonce + 1 })),
  setDraftMedia: (draftMedia) => set({ draftMedia }),
  clearDraft: () => set({ draftMedia: [] }),
}));
