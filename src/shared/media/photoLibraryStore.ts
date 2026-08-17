import { create } from 'zustand';
import type { GalleryMediaKind, PickedGalleryItem } from './MediaGalleryPicker';

export type PhotoLibraryEditTool = 'draw' | 'text' | 'mosaic' | 'filter' | 'crop';

export type PhotoLibraryRequest = {
  selectionLimit: number;
  initialMode: GalleryMediaKind;
  allowModeSwitch: boolean;
  title: string;
  sendLabel: string;
  editAfterPick?: boolean;
  initialEditTool?: PhotoLibraryEditTool;
  resolve: (items: PickedGalleryItem[]) => void;
};

type State = {
  request: PhotoLibraryRequest | null;
  present: (request: PhotoLibraryRequest) => void;
  close: () => void;
  complete: (items: PickedGalleryItem[]) => void;
};

export const usePhotoLibraryStore = create<State>((set, get) => ({
  request: null,
  present: (request) => {
    get().request?.resolve([]);
    set({ request });
  },
  close: () => {
    get().request?.resolve([]);
    set({ request: null });
  },
  complete: (items) => {
    get().request?.resolve(items);
    set({ request: null });
  },
}));

/** Opens the in-app photo grid (Media Library) — avoids the iOS PHPicker crash. */
export function pickDevicePhotos(options?: {
  selectionLimit?: number;
  videos?: boolean;
  videosOnly?: boolean;
  title?: string;
  sendLabel?: string;
  editAfterPick?: boolean;
  initialEditTool?: PhotoLibraryEditTool;
}): Promise<PickedGalleryItem[]> {
  return new Promise((resolve) => {
    usePhotoLibraryStore.getState().present({
      selectionLimit: Math.max(1, options?.selectionLimit ?? 1),
      initialMode: options?.videosOnly ? 'video' : 'photo',
      allowModeSwitch: Boolean(options?.videos) && !options?.videosOnly,
      title: options?.title ?? 'คลังภาพ',
      sendLabel: options?.sendLabel ?? 'เลือก',
      editAfterPick: options?.editAfterPick,
      initialEditTool: options?.initialEditTool,
      resolve,
    });
  });
}
