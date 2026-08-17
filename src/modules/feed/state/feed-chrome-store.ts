import { create } from 'zustand';

export type PlaybackRate = 0.5 | 1 | 1.5 | 2;

type FeedChromeState = {
  autoAdvance: boolean;
  playbackRate: PlaybackRate;
  chromeHidden: boolean;
  captionsEnabled: boolean;
  originalSound: boolean;
  setAutoAdvance: (v: boolean) => void;
  setPlaybackRate: (v: PlaybackRate) => void;
  setChromeHidden: (v: boolean) => void;
  setCaptionsEnabled: (v: boolean) => void;
  setOriginalSound: (v: boolean) => void;
};

export const useFeedChromeStore = create<FeedChromeState>((set) => ({
  autoAdvance: false,
  playbackRate: 1,
  chromeHidden: false,
  captionsEnabled: true,
  originalSound: true,
  setAutoAdvance: (autoAdvance) => set({ autoAdvance }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setChromeHidden: (chromeHidden) => set({ chromeHidden }),
  setCaptionsEnabled: (captionsEnabled) => set({ captionsEnabled }),
  setOriginalSound: (originalSound) => set({ originalSound }),
}));
