import { router } from 'expo-router';
import type { PickedGalleryItem } from '@/shared/media/MediaGalleryPicker';
import type { SharedMediaGalleryPickerProps } from '@/shared/media/openSharedMediaGallery';

type Session = {
  props: SharedMediaGalleryPickerProps;
  resolve: (items: PickedGalleryItem[]) => void;
};

let active: Session | null = null;

/** Present gallery as a stacked route (works above create-capture fullScreenModal). */
export function presentMediaGalleryRoute(
  props: SharedMediaGalleryPickerProps,
): Promise<PickedGalleryItem[]> {
  return new Promise((resolve) => {
    active?.resolve([]);
    active = { props, resolve };
    router.push('/media-gallery');
  });
}

export function takeMediaGallerySession(): Session | null {
  const session = active;
  active = null;
  return session;
}

export function cancelMediaGallerySession() {
  active?.resolve([]);
  active = null;
}
