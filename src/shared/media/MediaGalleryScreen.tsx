import React, { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { MediaGalleryPicker, type PickedGalleryItem } from '@/shared/media/MediaGalleryPicker';
import {
  cancelMediaGallerySession,
  takeMediaGallerySession,
} from '@/shared/media/mediaGallerySession';

/** Full-screen gallery route — same UI as ลงขายสินค้า / PhotoLibraryHost */
export function MediaGalleryScreen() {
  const sessionRef = useRef(takeMediaGallerySession());
  const session = sessionRef.current;

  useEffect(() => {
    if (!session) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    }
    return () => {
      cancelMediaGallerySession();
    };
  }, [session]);

  if (!session) return null;

  const finish = (items: PickedGalleryItem[]) => {
    session.resolve(items);
    if (router.canGoBack()) router.back();
  };

  return (
    <MediaGalleryPicker
      embedded
      visible
      onClose={() => finish([])}
      onSend={(items) => finish(items)}
      {...session.props}
    />
  );
}
