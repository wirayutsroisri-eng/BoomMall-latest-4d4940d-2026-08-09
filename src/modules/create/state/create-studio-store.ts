import { create } from 'zustand';
import { usePhotoLibraryStore } from '@/shared/media/photoLibraryStore';

type CreateStudioState = {
  visible: boolean;
  open: () => void;
  close: () => void;
};

export const useCreateStudioStore = create<CreateStudioState>((set) => ({
  visible: false,
  open: () => {
    usePhotoLibraryStore.getState().close();
    set({ visible: true });
  },
  close: () => set({ visible: false }),
}));
