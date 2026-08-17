import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';

const COLS = 3;
const GAP = 2;
const TILE = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;
const PAGE = 80;

type Props = {
  includeVideos?: boolean;
  videosOnly?: boolean;
  showCameraTile?: boolean;
  onPressCamera?: () => void;
  onPick: (uri: string, type: 'image' | 'video') => void;
  scrollY?: SharedValue<number>;
};

function isFileUri(uri?: string | null) {
  if (!uri) return false;
  return (
    uri.startsWith('file://') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('content://')
  );
}

function Thumb({ asset }: { asset: MediaLibrary.Asset }) {
  const [uri, setUri] = useState(isFileUri(asset.uri) ? asset.uri : null);

  useEffect(() => {
    if (uri) return;
    let cancelled = false;
    void MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false }).then(
      (info) => {
        if (cancelled) return;
        const next = info.localUri && isFileUri(info.localUri) ? info.localUri : null;
        if (next) setUri(next);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [asset, uri]);

  if (!uri) return <View style={styles.placeholder} />;
  return <Image source={{ uri }} style={styles.thumb} />;
}

export function DevicePhotoGrid({
  includeVideos = true,
  videosOnly = false,
  showCameraTile = false,
  onPressCamera,
  onPick,
  scrollY,
}: Props) {
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasNext, setHasNext] = useState(true);
  const loadingMore = useRef(false);
  const picking = useRef(false);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      if (scrollY) scrollY.value = e.contentOffset.y;
    },
  });

  const mediaTypes = useMemo(() => {
    if (videosOnly) return [MediaLibrary.MediaType.video];
    if (includeVideos) return [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video];
    return [MediaLibrary.MediaType.photo];
  }, [includeVideos, videosOnly]);

  const load = useCallback(
    async (reset: boolean, after?: string) => {
      if (loadingMore.current) return;
      if (!reset && !hasNext) return;
      loadingMore.current = true;
      if (reset) setLoading(true);
      try {
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE,
          after: reset ? undefined : after,
          mediaType: mediaTypes,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        setAssets((prev) => (reset ? page.assets : [...prev, ...page.assets]));
        setCursor(page.endCursor);
        setHasNext(page.hasNextPage);
      } catch {
        Alert.alert('โหลดคลังไม่ได้', 'ลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
        loadingMore.current = false;
      }
    },
    [hasNext, mediaTypes],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!alive) return;
      setPermission(perm);
      if (!perm.granted) {
        setLoading(false);
        return;
      }
      loadingMore.current = false;
      setHasNext(true);
      try {
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE,
          mediaType: mediaTypes,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        if (!alive) return;
        setAssets(page.assets);
        setCursor(page.endCursor);
        setHasNext(page.hasNextPage);
      } catch {
        if (alive) Alert.alert('โหลดคลังไม่ได้', 'ลองใหม่อีกครั้ง');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mediaTypes]);

  const pickAsset = async (asset: MediaLibrary.Asset) => {
    if (picking.current) return;
    picking.current = true;
    void Haptics.selectionAsync();
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset, {
        shouldDownloadFromNetwork: true,
      });
      const uri = info.localUri ?? info.uri;
      if (!uri || uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
        Alert.alert('เปิดไฟล์ไม่ได้', 'เลือกรูปหรือคลิปอื่นแล้วลองอีกครั้ง');
        return;
      }
      onPick(uri, asset.mediaType === MediaLibrary.MediaType.video ? 'video' : 'image');
    } catch (e) {
      Alert.alert('เลือกสื่อไม่ได้', e instanceof Error ? e.message : 'ลองอีกครั้ง');
    } finally {
      picking.current = false;
    }
  };

  if (permission && !permission.granted) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>ยังเข้าถึงคลังภาพไม่ได้</Text>
        <Text style={styles.emptySub}>อนุญาตให้ BoomMall ดูรูปและวิดีโอในเครื่อง</Text>
        <Pressable style={styles.permBtn} onPress={() => void MediaLibrary.requestPermissionsAsync().then((perm) => {
          setPermission(perm);
          if (perm.granted) {
            setLoading(true);
            void MediaLibrary.getAssetsAsync({
              first: PAGE,
              mediaType: mediaTypes,
              sortBy: [[MediaLibrary.SortBy.creationTime, false]],
            }).then((page) => {
              setAssets(page.assets);
              setCursor(page.endCursor);
              setHasNext(page.hasNextPage);
              setLoading(false);
            });
          }
        })}>
          <Text style={styles.permBtnText}>อนุญาตคลังภาพ</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void MediaLibrary.presentPermissionsPickerAsync().then(() => {
              setLoading(true);
              void MediaLibrary.getPermissionsAsync().then((perm) => {
                setPermission(perm);
                if (!perm.granted) {
                  setLoading(false);
                  return;
                }
                void MediaLibrary.getAssetsAsync({
                  first: PAGE,
                  mediaType: mediaTypes,
                  sortBy: [[MediaLibrary.SortBy.creationTime, false]],
                }).then((page) => {
                  setAssets(page.assets);
                  setCursor(page.endCursor);
                  setHasNext(page.hasNextPage);
                  setLoading(false);
                });
              });
            });
          }}
        >
          <Text style={styles.link}>เลือกเพิ่มรูป</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openSettings()}>
          <Text style={styles.link}>เปิดตั้งค่า</Text>
        </Pressable>
      </View>
    );
  }

  const cameraCell = showCameraTile
    ? [{ id: '__camera__', kind: 'camera' as const }]
    : [];
  const rows = [
    ...cameraCell,
    ...assets.map((asset) => ({ id: asset.id, kind: 'asset' as const, asset })),
  ];

  return (
    <View style={styles.fill}>
      {loading && assets.length === 0 ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 48 }} />
      ) : (
        <Animated.FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          numColumns={COLS}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onEndReached={() => {
            if (hasNext && cursor) void load(false, cursor);
          }}
          onEndReachedThreshold={0.4}
          columnWrapperStyle={styles.row}
          ListEmptyComponent={
            <Text style={styles.emptySub}>ยังไม่มีรูปในคลัง — แตะกล้องด้านบนเพื่อถ่าย</Text>
          }
          renderItem={({ item }) => {
            if (item.kind === 'camera') {
              return (
                <Pressable
                  style={[styles.tile, styles.cameraTile]}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onPressCamera?.();
                  }}
                >
                  <Ionicons name="camera" size={32} color="#fff" />
                  <Text style={styles.cameraLabel}>กล้อง</Text>
                </Pressable>
              );
            }
            return (
              <Pressable style={styles.tile} onPress={() => void pickAsset(item.asset)}>
                <Thumb asset={item.asset} />
                {item.asset.mediaType === MediaLibrary.MediaType.video ? (
                  <View style={styles.videoBadge}>
                    <Ionicons name="videocam" size={12} color="#fff" />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  row: { gap: GAP, marginBottom: GAP },
  tile: {
    width: TILE,
    height: TILE,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  cameraTile: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.forest,
    gap: 6,
  },
  cameraLabel: { color: '#fff', fontWeight: '800', fontSize: 13 },
  thumb: { width: '100%', height: '100%' },
  placeholder: { flex: 1, backgroundColor: '#222' },
  videoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 3,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 10,
  },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 24,
  },
  permBtn: {
    marginTop: 8,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },
  permBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { color: colors.brand.primary, fontWeight: '700', fontSize: 15, marginTop: 8 },
});
