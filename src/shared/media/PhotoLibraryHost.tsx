import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DevicePhotoGrid } from './DevicePhotoGrid';
import { GalleryPhotoEditor } from './GalleryPhotoEditor';
import { usePhotoLibraryStore } from './photoLibraryStore';

/** Full-screen overlay (not a system PHPicker) so the iPhone photo library can actually open. */
export function PhotoLibraryHost() {
  const insets = useSafeAreaInsets();
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
      <View style={styles.overlay}>
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
    );
  }

  return (
    <View style={[styles.overlay, { paddingTop: insets.top + 4 }]}>
      <View style={styles.topBar}>
        <Pressable style={styles.close} onPress={close} hitSlop={8}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
        <Text style={styles.title}>{request.title}</Text>
        <View style={{ width: 44 }} />
      </View>
      <DevicePhotoGrid
        includeVideos={request.allowModeSwitch || request.initialMode === 'video'}
        videosOnly={request.initialMode === 'video' && !request.allowModeSwitch}
        onPick={(uri, type) => {
          if (request.editAfterPick && type === 'image') {
            setEditingUri(uri);
            return;
          }
          complete([
            {
              id: uri,
              uri,
              mediaType: type === 'video' ? 'video' : 'photo',
              width: 0,
              height: 0,
            },
          ]);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: '#000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
