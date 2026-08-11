import { create } from 'zustand';
import type { BoardSide } from '@/modules/feed/domain/types';

type BoardUiState = {
  side: BoardSide;
  setSide: (side: BoardSide) => void;
};

/** Sticky marketplace tab on Community Board (demand ↔ supply). */
export const useBoardUiStore = create<BoardUiState>((set) => ({
  side: 'demand',
  setSide: (side) => set({ side }),
}));
