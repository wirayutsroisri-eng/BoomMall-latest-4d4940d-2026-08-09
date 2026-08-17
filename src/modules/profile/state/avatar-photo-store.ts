import { create } from 'zustand';

export type ProfilePhotoKind = 'avatar' | 'cover';

type AvatarPhotoState = {
  previewKind: ProfilePhotoKind | null;
  cropUri: string | null;
  openPreview: (kind: ProfilePhotoKind) => void;
  openCrop: (uri: string) => void;
  close: () => void;
};

export const useAvatarPhotoStore = create<AvatarPhotoState>((set) => ({
  previewKind: null,
  cropUri: null,
  openPreview: (kind) => set({ previewKind: kind, cropUri: null }),
  openCrop: (uri) => set({ previewKind: null, cropUri: uri }),
  close: () => set({ previewKind: null, cropUri: null }),
}));
