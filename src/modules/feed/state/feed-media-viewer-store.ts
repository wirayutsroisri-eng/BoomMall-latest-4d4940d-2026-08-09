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
  /** หน้าฟีดเท่านั้น — พื้นดำติดรูป ไม่ใช้กับ preview หน้าคลิป */
  attachedBackdrop?: boolean;
  /** หน้าฟีดเท่านั้น — ตำแหน่ง/ขนาดรูปต้นทางในฟีด (window coords) สำหรับ hero transition */
  originFrame?: { x: number; y: number; width: number; height: number };
};

type State = {
  visible: boolean;
  items: MediaViewerItem[];
  initialIndex: number;
  sourcePostId?: string;
  mediaIds: string[];
  overlays: OverlayObject[];
  media: EditorMedia[];
  attachedBackdrop: boolean;
  originFrame?: { x: number; y: number; width: number; height: number };
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
  attachedBackdrop: false,
  originFrame: undefined,
  open: ({ items, initialIndex = 0, sourcePostId, mediaIds = [], overlays = [], media = [], attachedBackdrop = false, originFrame }) => set({
    visible: items.length > 0,
    items,
    initialIndex: Math.max(0, Math.min(items.length - 1, initialIndex)),
    sourcePostId,
    mediaIds, overlays, media,
    attachedBackdrop,
    originFrame,
  }),
  // ห้ามรีเซ็ต attachedBackdrop/originFrame ตรงนี้ — Modal ยังโชว์อยู่ 1-2 เฟรมหลัง visible=false
  // ถ้ารีเซ็ต viewer จะพลิกไปโหมดพื้นดำทึบ (blackLock) → จอดำวาบตอนปัดขึ้น/กดกากบาท
  // open() ครั้งถัดไป set ค่าใหม่ทับเสมอ
  close: () => set({ visible: false, sourcePostId: undefined }),
}));

export function openMediaViewer(input: OpenMediaViewerInput) {
  useFeedMediaViewerStore.getState().open(input);
}

export function openFeedMediaViewer(
  uris: string[],
  initialIndex: number,
  mediaIds?: string[],
  overlays?: OverlayObject[],
  media?: EditorMedia[],
  options?: { attachedBackdrop?: boolean; originFrame?: { x: number; y: number; width: number; height: number } },
) {
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
    attachedBackdrop: options?.attachedBackdrop,
    originFrame: options?.originFrame,
  });
}
