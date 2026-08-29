import { create } from 'zustand';
import type { EditorMedia, OverlayObject } from '@/modules/create/domain/editorComposition';

export type MediaViewerItem = {
  id: string;
  type: 'image' | 'video';
  uri: string;
  posterUri?: string;
  width?: number;
  height?: number;
  initialTime?: number;
  sourcePostId?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  liked?: boolean;
  saved?: boolean;
  author?: string;
  authorHandle?: string;
  avatarUri?: string;
  caption?: string;
};

export type OpenMediaViewerInput = {
  items: MediaViewerItem[];
  initialIndex?: number;
  sourcePostId?: string;
  mediaIds?: string[];
  overlays?: OverlayObject[];
  media?: EditorMedia[];
};

type State = {
  visible: boolean;
  items: MediaViewerItem[];
  initialIndex: number;
  sourcePostId?: string;
  mediaIds: string[];
  overlays: OverlayObject[];
  media: EditorMedia[];
  open: (input: OpenMediaViewerInput) => void;
  close: () => void;
};

export const useFeedMediaViewerStore = create<State>((set) => ({
  visible: false,
  items: [],
  initialIndex: 0,
  sourcePostId: undefined,
  mediaIds: [],
  overlays: [],
  media: [],
  open: ({ items, initialIndex = 0, sourcePostId, mediaIds = [], overlays = [], media = [] }) => set({
    visible: items.length > 0,
    items,
    initialIndex: Math.max(0, Math.min(items.length - 1, initialIndex)),
    sourcePostId,
    mediaIds, overlays, media,
  }),
  close: () => set({ visible: false, sourcePostId: undefined }),
}));

export function openMediaViewer(input: OpenMediaViewerInput) {
  useFeedMediaViewerStore.getState().open(input);
}

export function openFeedMediaViewer(uris: string[], initialIndex: number, mediaIds?: string[], overlays?: OverlayObject[], media?: EditorMedia[]) {
  openMediaViewer({
    items: uris.map((uri, index) => ({
      id: mediaIds?.[index] ?? `${uri}:${index}`,
      type: 'image',
      uri,
      width: media?.[index]?.width,
      height: media?.[index]?.height,
    })),
    initialIndex,
    mediaIds,
    overlays,
    media,
  });
}
