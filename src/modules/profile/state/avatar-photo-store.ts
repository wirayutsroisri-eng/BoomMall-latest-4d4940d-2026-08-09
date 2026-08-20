import { create } from 'zustand';

export type ProfilePhotoKind = 'avatar' | 'cover';

type AvatarPhotoState = {
  previewKind: ProfilePhotoKind | null;
  cropUri: string | null;
  cropKind: ProfilePhotoKind | null;
  cropPromiseResolve: ((uri: string | null) => void) | null;
  openPreview: (kind: ProfilePhotoKind) => void;
  openCrop: (uri: string, kind: ProfilePhotoKind, resolve: (uri: string | null) => void) => void;
  resolveCropPromise: (uri: string | null) => void;
  close: () => void;
};

export const useAvatarPhotoStore = create<AvatarPhotoState>((set, get) => ({
  previewKind: null,
  cropUri: null,
  cropKind: null,
  cropPromiseResolve: null,
  openPreview: (kind) =>
    set({ previewKind: kind, cropUri: null, cropKind: null, cropPromiseResolve: null }),
  openCrop: (uri, kind, resolve) =>
    set({ previewKind: null, cropUri: uri, cropKind: kind, cropPromiseResolve: resolve }),
  resolveCropPromise: (uri) => {
    get().cropPromiseResolve?.(uri);
    set({ cropPromiseResolve: null });
  },
  close: () => {
    get().cropPromiseResolve?.(null);
    set({ previewKind: null, cropUri: null, cropKind: null, cropPromiseResolve: null });
  },
}));
