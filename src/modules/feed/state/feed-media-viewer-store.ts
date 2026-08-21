import { create } from 'zustand';
import type { EditorMedia, OverlayObject } from '@/modules/create/domain/editorComposition';

type State = {
  visible: boolean;
  uris: string[];
  initialIndex: number;
  mediaIds: string[];
  overlays: OverlayObject[];
  media: EditorMedia[];
  open: (uris: string[], initialIndex: number, mediaIds?: string[], overlays?: OverlayObject[], media?: EditorMedia[]) => void;
  close: () => void;
};

export const useFeedMediaViewerStore = create<State>((set) => ({
  visible: false,
  uris: [],
  initialIndex: 0,
  mediaIds: [],
  overlays: [],
  media: [],
  open: (uris, initialIndex, mediaIds = [], overlays = [], media = []) => set({
    visible: uris.length > 0,
    uris,
    initialIndex: Math.max(0, Math.min(uris.length - 1, initialIndex)),
    mediaIds,
    overlays,
    media,
  }),
  close: () => set({ visible: false }),
}));

export function openFeedMediaViewer(uris: string[], initialIndex: number, mediaIds?: string[], overlays?: OverlayObject[], media?: EditorMedia[]) {
  useFeedMediaViewerStore.getState().open(uris, initialIndex, mediaIds, overlays, media);
}
