import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { GalleryPhotoEditor } from './GalleryPhotoEditor';
import { MediaGalleryPicker } from './MediaGalleryPicker';
import { sharedMediaGalleryPickerProps } from './openSharedMediaGallery';
import { usePhotoLibraryStore } from './photoLibraryStore';

/** Full-screen picker above Expo modals — same MediaGalleryPicker as ลงขายสินค้า. */
export function PhotoLibraryHost() {
  const request = usePhotoLibraryStore((s) => s.request);
  const close = usePhotoLibraryStore((s) => s.close);
  const complete = usePhotoLibraryStore((s) => s.complete);
  const [editingUri, setEditingUri] = useState<string | null>(null);

  useEffect(() => {
    if (!request) setEditingUri(null);
  }, [request]);

  if (!request) return null;

  if (editingUri) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setEditingUri(null)} presentationStyle="fullScreen">
        <View style={styles.fill}>
          <GalleryPhotoEditor
            uri={editingUri}
            initialTool={request.initialEditTool ?? 'crop'}
            onClose={() => setEditingUri(null)}
            onDone={(uri) => {
              setEditingUri(null);
              complete([
                {
                  id: uri,
                  uri,
                  mediaType: 'photo',
                  width: 0,
                  height: 0,
                },
              ]);
            }}
          />
        </View>
      </Modal>
    );
  }

  return (
    <MediaGalleryPicker
      visible={Boolean(request)}
      onClose={close}
      onSend={(items) => {
        if (request.editAfterPick && items[0]?.mediaType === 'photo') {
          setEditingUri(items[0].uri);
          return;
        }
        complete(items);
      }}
      {...sharedMediaGalleryPickerProps({
        selectionLimit: request.selectionLimit,
        allowVideo: request.allowModeSwitch,
        initialMode: request.initialMode === 'video' ? 'video' : 'photo',
        title: request.title,
        sendLabel: request.sendLabel,
      })}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
});
