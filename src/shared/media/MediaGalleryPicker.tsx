import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library/legacy';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

export type GalleryMediaKind = 'photo' | 'video';

export type PickedGalleryItem = {
  id: string;
  uri: string;
  mediaType: GalleryMediaKind;
  duration?: number;
  width: number;
  height: number;
  filename?: string;
};

type GalleryMode = 'photo' | 'video';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (items: PickedGalleryItem[]) => void;
  /** Max items (default 12) */
  selectionLimit?: number;
  initialMode?: GalleryMode;
  /** When false, hide photo/video tabs and lock to initialMode */
  allowModeSwitch?: boolean;
  title?: string;
  sendLabel?: string;
};

const COLS = 4;
const GAP = 1.5;
const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const TILE = (SCREEN_W - GAP * (COLS - 1)) / COLS;
const PAGE = 80;
const BAR_H = 56;
const RESOLVE_TIMEOUT_MS = 4500;

/** RN Image cannot render iOS `ph://` — cache file:// localUris for thumbs. */
const displayUriCache = new Map<string, string>();

function isDirectImageUri(uri?: string | null) {
  if (!uri) return false;
  return (
    uri.startsWith('file://') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://') ||
    uri.startsWith('content://') ||
    uri.startsWith('data:')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    promise
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
  });
}

async function resolveDisplayUri(asset: MediaLibrary.Asset): Promise<string | null> {
  const cached = displayUriCache.get(asset.id);
  if (cached) return cached;
  if (isDirectImageUri(asset.uri)) {
    displayUriCache.set(asset.id, asset.uri);
    return asset.uri;
  }
  try {
    const info = await withTimeout(
      MediaLibrary.getAssetInfoAsync(asset, {
        shouldDownloadFromNetwork: false,
      }),
      3000,
    );
    if (info) {
      const next = info.localUri ?? (isDirectImageUri(info.uri) ? info.uri : null);
      if (next) {
        displayUriCache.set(asset.id, next);
        return next;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Resolve a sendable URI without hanging on iCloud / ph:// forever. */
async function resolveSendUri(asset: MediaLibrary.Asset): Promise<string> {
  const cached = displayUriCache.get(asset.id);
  if (cached && isDirectImageUri(cached)) return cached;
  if (isDirectImageUri(asset.uri)) return asset.uri;

  const localInfo = await withTimeout(
    MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: false }),
    2500,
  );
  if (localInfo) {
    const local = localInfo.localUri ?? localInfo.uri;
    if (local && isDirectImageUri(local)) {
      displayUriCache.set(asset.id, local);
      return local;
    }
    if (local && !local.startsWith('ph://')) return local;
  }

  const remoteInfo = await withTimeout(
    MediaLibrary.getAssetInfoAsync(asset, { shouldDownloadFromNetwork: true }),
    RESOLVE_TIMEOUT_MS,
  );
  if (remoteInfo) {
    const next = remoteInfo.localUri ?? remoteInfo.uri;
    if (next && isDirectImageUri(next)) {
      displayUriCache.set(asset.id, next);
      return next;
    }
    if (next) return next;
  }

  return cached ?? asset.uri;
}

function formatDuration(sec?: number) {
  if (!sec || !Number.isFinite(sec)) return '';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function GalleryThumb({
  asset,
  style,
  resizeMode = 'cover',
}: {
  asset: MediaLibrary.Asset;
  style?: object;
  resizeMode?: 'cover' | 'contain';
}) {
  const [uri, setUri] = useState<string | null>(
    () => displayUriCache.get(asset.id) ?? (isDirectImageUri(asset.uri) ? asset.uri : null),
  );

  useEffect(() => {
    setUri(displayUriCache.get(asset.id) ?? (isDirectImageUri(asset.uri) ? asset.uri : null));
  }, [asset.id, asset.uri]);

  useEffect(() => {
    let alive = true;
    if (uri) return;
    void resolveDisplayUri(asset).then((next) => {
      if (alive && next) setUri(next);
    });
    return () => {
      alive = false;
    };
  }, [asset, uri]);

  if (!uri) {
    return (
      <View style={[style, styles.thumbPlaceholder]}>
        <ActivityIndicator color="rgba(255,255,255,0.35)" />
      </View>
    );
  }

  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
}

/**
 * LINE-style multi photo picker:
 * - Dark chrome, 4-column grid, circle select on every tile
 * - Sticky bottom: ดูตัวอย่าง · ภาพเต็ม · ส่ง
 * - Album dropdown (ล่าสุด / albums)
 */
export function MediaGalleryPicker({
  visible,
  onClose,
  onSend,
  selectionLimit = 12,
  initialMode = 'photo',
  allowModeSwitch = true,
  title = 'ล่าสุด',
  sendLabel = 'ส่ง',
}: Props) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<GalleryMode>(initialMode);
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>();
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [permission, setPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ list: MediaLibrary.Asset[]; index: number } | null>(
    null,
  );
  const [fullQuality, setFullQuality] = useState(true);
  const [albumMenuOpen, setAlbumMenuOpen] = useState(false);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [albumTitle, setAlbumTitle] = useState(title);
  const loadingMore = useRef(false);
  const previewListRef = useRef<FlatList<MediaLibrary.Asset>>(null);
  const galleryScrollY = useSharedValue(0);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const hasSelection = selectedIds.length > 0;
  const selectedAssets = useMemo(() => {
    const byId = new Map(assets.map((a) => [a.id, a]));
    return selectedIds.map((id) => byId.get(id)).filter(Boolean) as MediaLibrary.Asset[];
  }, [assets, selectedIds]);

  const resetState = useCallback(() => {
    setAssets([]);
    setEndCursor(undefined);
    setHasNext(true);
    setSelectedIds([]);
    setPreview(null);
    setSending(false);
    setAlbumMenuOpen(false);
    setAlbumId(null);
    setAlbumTitle(title);
    setMode(initialMode);
  }, [initialMode, title]);

  const mediaTypeFilter =
    mode === 'photo' ? MediaLibrary.MediaType.photo : MediaLibrary.MediaType.video;

  const fetchPage = useCallback(
    async (reset: boolean, cursor?: string) => {
      const page = await MediaLibrary.getAssetsAsync({
        first: PAGE,
        after: reset ? undefined : cursor,
        album: albumId ?? undefined,
        mediaType: mediaTypeFilter,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      return page;
    },
    [albumId, mediaTypeFilter],
  );

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (loadingMore.current) return;
      if (!reset && !hasNext) return;
      loadingMore.current = true;
      setLoading(true);
      try {
        const page = await fetchPage(reset, endCursor);
        setAssets((prev) => (reset ? page.assets : [...prev, ...page.assets]));
        setEndCursor(page.endCursor);
        setHasNext(page.hasNextPage);
      } catch {
        Alert.alert('โหลดคลังไม่ได้', 'ลองใหม่อีกครั้ง หรือตรวจสิทธิ์รูป/วิดีโอ');
      } finally {
        setLoading(false);
        loadingMore.current = false;
      }
    },
    [endCursor, fetchPage, hasNext],
  );

  useEffect(() => {
    if (!visible) return;
    setSelectedIds([]);
    setPreview(null);
    setSending(false);
    setAlbumMenuOpen(false);
    setMode(initialMode);
    setAlbumTitle(title);
    setAlbumId(null);
  }, [visible, initialMode, title]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      const perm = permission?.granted
        ? permission
        : await MediaLibrary.requestPermissionsAsync();
      if (!alive) return;
      setPermission(perm);
      if (!perm.granted) return;

      try {
        const list = await MediaLibrary.getAlbumsAsync({
          includeSmartAlbums: true,
        });
        if (alive) setAlbums(list.filter((a) => a.assetCount > 0));
      } catch {
        /* optional */
      }

      setAssets([]);
      setEndCursor(undefined);
      setHasNext(true);
      loadingMore.current = false;
      setLoading(true);
      try {
        const page = await MediaLibrary.getAssetsAsync({
          first: PAGE,
          album: albumId ?? undefined,
          mediaType: mediaTypeFilter,
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });
        if (!alive) return;
        setAssets(page.assets);
        setEndCursor(page.endCursor);
        setHasNext(page.hasNextPage);
        // Warm thumbnails for the first page (iOS ph:// → file://)
        void Promise.all(page.assets.slice(0, 40).map((a) => resolveDisplayUri(a)));
      } catch {
        if (alive) Alert.alert('โหลดคลังไม่ได้', 'ลองใหม่อีกครั้ง');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when opened / mode / album changes
  }, [visible, mode, albumId]);

  const toggleSelect = (asset: MediaLibrary.Asset) => {
    void Haptics.selectionAsync();
    setSelectedIds((prev) => {
      if (prev.includes(asset.id)) return prev.filter((id) => id !== asset.id);
      if (prev.length >= selectionLimit) {
        Alert.alert('เลือกครบแล้ว', `เลือกได้สูงสุด ${selectionLimit} รายการ`);
        return prev;
      }
      if (selectionLimit === 1) return [asset.id];
      return [...prev, asset.id];
    });
  };

  const openBrowsePreview = (asset: MediaLibrary.Asset) => {
    const index = assets.findIndex((a) => a.id === asset.id);
    if (index < 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Ensure current photo is selected so send works from preview
    setSelectedIds((prev) => {
      if (prev.includes(asset.id)) return prev;
      if (selectionLimit === 1) return [asset.id];
      if (prev.length >= selectionLimit) return [...prev.slice(0, -1), asset.id];
      return [...prev, asset.id];
    });
    setPreview({ list: assets, index });
  };

  const openPreviewSelected = () => {
    if (!selectedAssets.length) return;
    void Haptics.selectionAsync();
    setPreview({ list: selectedAssets, index: 0 });
  };

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  const previewCurrent = preview?.list[preview.index] ?? null;

  const sendFromPreview = async () => {
    const current = preview?.list[preview.index] ?? null;
    const ids =
      selectedIds.length > 0 ? selectedIds : current ? [current.id] : [];
    if (!ids.length || sending) return;

    const byId = new Map<string, MediaLibrary.Asset>();
    for (const a of assets) byId.set(a.id, a);
    if (preview) for (const a of preview.list) byId.set(a.id, a);

    setSending(true);
    closePreview();
    try {
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as MediaLibrary.Asset[];
      const items: PickedGalleryItem[] = await Promise.all(
        ordered.map(async (a) => ({
          id: a.id,
          uri: await resolveSendUri(a),
          mediaType: a.mediaType === 'video' ? ('video' as const) : ('photo' as const),
          duration: a.duration,
          width: a.width,
          height: a.height,
          filename: a.filename,
        })),
      );
      if (!items.length) {
        Alert.alert('ส่งไม่ได้', 'ไม่พบไฟล์ที่เลือก — ลองใหม่อีกครั้ง');
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSend(items);
      onClose();
      setSelectedIds([]);
      setPreview(null);
    } catch {
      Alert.alert('ส่งไม่สำเร็จ', 'ลองเลือกใหม่แล้วส่งอีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  const previewTools: Array<{
    key: string;
    icon?: keyof typeof Ionicons.glyphMap;
    letter?: string;
    label: string;
  }> = [
    { key: 'sticker', icon: 'happy-outline', label: 'สติกเกอร์' },
    { key: 'text', letter: 'T', label: 'ข้อความ' },
    { key: 'draw', icon: 'pencil', label: 'วาด' },
    { key: 'mosaic', icon: 'grid', label: 'โมเสก' },
    { key: 'filter', icon: 'color-filter', label: 'ฟิลเตอร์' },
    { key: 'scan', icon: 'scan-outline', label: 'สแกน' },
  ];

  const onToolPress = (_key: string) => {
    // Crop/tools not shipped — avoid App Store “coming soon” Alerts (Guideline 2.1)
    void Haptics.selectionAsync();
  };

  const onPressSend = async () => {
    if (!selectedIds.length || sending) return;
    setSending(true);
    try {
      const byId = new Map(assets.map((a) => [a.id, a]));
      const ordered = selectedIds.map((id) => byId.get(id)).filter(Boolean) as MediaLibrary.Asset[];
      const items: PickedGalleryItem[] = await Promise.all(
        ordered.map(async (a) => ({
          id: a.id,
          uri: await resolveSendUri(a),
          mediaType: a.mediaType === 'video' ? ('video' as const) : ('photo' as const),
          duration: a.duration,
          width: a.width,
          height: a.height,
          filename: a.filename,
        })),
      );
      if (!items.length) {
        Alert.alert('ส่งไม่ได้', 'ไม่พบไฟล์ที่เลือก — ลองใหม่อีกครั้ง');
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSend(items);
      onClose();
      setSelectedIds([]);
      setPreview(null);
    } catch {
      Alert.alert('ส่งไม่สำเร็จ', 'ลองเลือกใหม่แล้วส่งอีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  const pickAlbum = (next: { id: string | null; label: string }) => {
    void Haptics.selectionAsync();
    setAlbumId(next.id);
    setAlbumTitle(next.label);
    setAlbumMenuOpen(false);
    setSelectedIds([]);
  };

  const renderTile = ({ item }: { item: MediaLibrary.Asset }) => {
    const selected = selectedSet.has(item.id);
    const order = selected ? selectedIds.indexOf(item.id) + 1 : 0;
    const isVideo = item.mediaType === 'video';
    return (
      <View style={[styles.tile, { width: TILE, height: TILE }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => openBrowsePreview(item)}
          accessibilityLabel="ดูรีวิวรูป"
        >
          <GalleryThumb asset={item} style={styles.tileImage} />
          {selected ? <View style={styles.selectedWash} pointerEvents="none" /> : null}
          {isVideo ? (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          style={styles.selectHit}
          onPress={() => toggleSelect(item)}
          hitSlop={6}
          accessibilityRole="checkbox"
          accessibilityState={{ selected }}
          accessibilityLabel={selected ? `เลือกแล้ว ลำดับ ${order}` : 'เลือก'}
        >
          <View style={[styles.selectCircle, selected && styles.selectCircleOn]}>
            {selected ? <Text style={styles.selectNum}>{order}</Text> : null}
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
    >
      <DragDownDismiss
        onDismiss={onClose}
        enabled={!preview && !sending}
        scrollY={galleryScrollY}
        showDim
        rootInModal
        style={styles.root}
      >
        <View style={[styles.rootInner, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.iconBtn} accessibilityLabel="ปิด">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>

          <Pressable
            style={styles.albumBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              setAlbumMenuOpen((v) => !v);
            }}
            accessibilityLabel="เลือกอัลบั้ม"
          >
            <Text style={styles.albumTitle} numberOfLines={1}>
              {albumTitle}
            </Text>
            <Ionicons
              name={albumMenuOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#fff"
            />
          </Pressable>

          <View style={styles.iconBtn} />
        </View>

        {allowModeSwitch ? (
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeChip, mode === 'photo' && styles.modeChipOn]}
              onPress={() => {
                void Haptics.selectionAsync();
                setMode('photo');
              }}
            >
              <Text style={[styles.modeText, mode === 'photo' && styles.modeTextOn]}>รูปภาพ</Text>
            </Pressable>
            <Pressable
              style={[styles.modeChip, mode === 'video' && styles.modeChipOn]}
              onPress={() => {
                void Haptics.selectionAsync();
                setMode('video');
              }}
            >
              <Text style={[styles.modeText, mode === 'video' && styles.modeTextOn]}>วิดีโอ</Text>
            </Pressable>
          </View>
        ) : null}

        {albumMenuOpen ? (
          <View style={styles.albumMenu}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: SCREEN_H * 0.4 }}>
              <Pressable
                style={styles.albumRow}
                onPress={() => pickAlbum({ id: null, label: title || 'ล่าสุด' })}
              >
                <Text style={styles.albumRowText}>ล่าสุด</Text>
                {albumId == null ? (
                  <Ionicons name="checkmark" size={18} color={colors.brand.primary} />
                ) : null}
              </Pressable>
              {albums.map((a) => (
                <Pressable
                  key={a.id}
                  style={styles.albumRow}
                  onPress={() => pickAlbum({ id: a.id, label: a.title })}
                >
                  <Text style={styles.albumRowText} numberOfLines={1}>
                    {a.title}
                    <Text style={styles.albumCount}> · {a.assetCount}</Text>
                  </Text>
                  {albumId === a.id ? (
                    <Ionicons name="checkmark" size={18} color={colors.brand.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.listWrap}>
          {!permission ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={colors.brand.primary} />
            </View>
          ) : !permission.granted ? (
            <View style={styles.centerBox}>
              <Text style={styles.emptyTitle}>ต้องการสิทธิ์คลังภาพ</Text>
              <Text style={styles.emptySub}>อนุญาตให้ BoomMall เข้าถึงรูปและวิดีโอในเครื่อง</Text>
              <Pressable
                style={styles.permBtn}
                onPress={async () => {
                  const perm = await MediaLibrary.requestPermissionsAsync();
                  setPermission(perm);
                }}
              >
                <Text style={styles.permBtnText}>ขอสิทธิ์อีกครั้ง</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              style={styles.list}
              data={assets}
              keyExtractor={(item) => item.id}
              numColumns={COLS}
              columnWrapperStyle={styles.row}
              contentContainerStyle={{
                paddingBottom: 12,
                flexGrow: assets.length ? undefined : 1,
              }}
              renderItem={renderTile}
              onEndReached={() => void loadPage(false)}
              onEndReachedThreshold={0.4}
              scrollEventThrottle={16}
              onScroll={(e) => {
                galleryScrollY.value = e.nativeEvent.contentOffset.y;
              }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                loading ? (
                  <View style={styles.centerBox}>
                    <ActivityIndicator color={colors.brand.primary} />
                  </View>
                ) : (
                  <View style={styles.centerBox}>
                    <Text style={styles.emptyTitle}>
                      {mode === 'photo' ? 'ยังไม่มีรูปภาพ' : 'ยังไม่มีวิดีโอ'}
                    </Text>
                    <Text style={styles.emptySub}>ลองสลับอัลบั้ม หรือถ่ายใหม่จากกล้อง</Text>
                  </View>
                )
              }
              ListFooterComponent={
                loading && assets.length > 0 ? (
                  <ActivityIndicator style={{ marginVertical: 16 }} color={colors.brand.primary} />
                ) : null
              }
            />
          )}
        </View>

        {/* LINE-style sticky action bar — always visible */}
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable
            onPress={openPreviewSelected}
            disabled={!hasSelection}
            hitSlop={8}
            accessibilityLabel="ดูตัวอย่าง"
          >
            <Text style={[styles.previewLink, !hasSelection && styles.previewLinkOff]}>
              ดูตัวอย่าง
            </Text>
          </Pressable>

          <Pressable
            style={styles.fullRow}
            onPress={() => {
              void Haptics.selectionAsync();
              setFullQuality((v) => !v);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: fullQuality }}
          >
            <View style={[styles.fullDot, fullQuality && styles.fullDotOn]}>
              {fullQuality ? <Ionicons name="checkmark" size={12} color="#111" /> : null}
            </View>
            <Text style={styles.fullLabel}>ภาพเต็ม</Text>
          </Pressable>

          <Pressable
            style={[styles.sendBtn, hasSelection ? styles.sendBtnOn : styles.sendBtnOff]}
            onPress={() => {
              if (!hasSelection) return;
              openPreviewSelected();
            }}
            disabled={!hasSelection || sending}
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
          >
            <Text style={[styles.sendBtnText, hasSelection && styles.sendBtnTextOn]}>
              {hasSelection ? `${sendLabel} (${selectedIds.length})` : sendLabel}
            </Text>
          </Pressable>
        </View>
        </View>
      </DragDownDismiss>

        {/* LINE-style compose preview: full photo + tools + blue send plane */}
        <Modal
          visible={!!preview}
          animationType="fade"
          presentationStyle="overFullScreen"
          transparent
          onRequestClose={closePreview}
        >
          <DragDownDismiss onDismiss={closePreview} showDim rootInModal style={styles.composeRoot}>
            {preview ? (
              <FlatList
                ref={previewListRef}
                style={StyleSheet.absoluteFill}
                data={preview.list}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={preview.index}
                getItemLayout={(_, index) => ({
                  length: SCREEN_W,
                  offset: SCREEN_W * index,
                  index,
                })}
                onMomentumScrollEnd={(e) => {
                  const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
                  setPreview((prev) =>
                    prev
                      ? { ...prev, index: Math.max(0, Math.min(prev.list.length - 1, next)) }
                      : prev,
                  );
                }}
                renderItem={({ item }) => (
                  <View style={styles.composePage}>
                    <GalleryThumb asset={item} style={styles.composeImage} resizeMode="cover" />
                  </View>
                )}
              />
            ) : null}

            <View style={[styles.composeTop, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
              <Pressable style={styles.composeIconBtn} onPress={closePreview} hitSlop={10}>
                <Ionicons name="chevron-back" size={30} color="#fff" />
              </Pressable>
            </View>

            <View
              style={[styles.composeBottom, { paddingBottom: Math.max(insets.bottom, 18) }]}
              pointerEvents="box-none"
            >
              <Pressable
                style={styles.composeSelectRing}
                onPress={() => {
                  if (previewCurrent) toggleSelect(previewCurrent);
                }}
                accessibilityLabel="เลือก/ยกเลิก"
              >
                {previewCurrent && selectedSet.has(previewCurrent.id) ? (
                  <View style={styles.composeSelectOn}>
                    <Text style={styles.composeSelectNum}>
                      {selectedIds.indexOf(previewCurrent.id) + 1}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                style={styles.composeSendFab}
                onPress={() => void sendFromPreview()}
                disabled={sending}
                accessibilityLabel="ส่ง"
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="paper-plane" size={24} color="#fff" />
                )}
              </Pressable>
            </View>
          </DragDownDismiss>
        </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  rootInner: { flex: 1, backgroundColor: '#000' },
  listWrap: { flex: 1 },
  list: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    height: 48,
  },
  iconBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  albumBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  albumTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    maxWidth: '80%',
  },
  albumMenu: {
    backgroundColor: '#1A1A1A',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  albumRowText: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1, marginRight: 12 },
  albumCount: { color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  modeChipOn: { backgroundColor: colors.brand.primary },
  modeText: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.7)' },
  modeTextOn: { color: colors.brand.ink },
  row: { gap: GAP, marginBottom: GAP },
  tile: { backgroundColor: '#222', overflow: 'hidden' },
  tileImage: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  selectHit: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 36,
    height: 36,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    paddingTop: 6,
    paddingRight: 6,
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCircleOn: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  selectCircleLg: { width: 28, height: 28, borderRadius: 14 },
  selectNum: { color: '#111', fontSize: 11, fontWeight: '900' },
  durationBadge: {
    position: 'absolute',
    left: 5,
    bottom: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  durationText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  centerBox: { alignItems: 'center', paddingVertical: 56, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  emptySub: { fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
  permBtn: {
    marginTop: 8,
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  permBtnText: { color: colors.brand.ink, fontWeight: '800' },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    minHeight: BAR_H,
    backgroundColor: '#111',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  previewLink: { color: '#fff', fontSize: 15, fontWeight: '600' },
  previewLinkOff: { color: 'rgba(255,255,255,0.28)' },
  fullRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fullDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullDotOn: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  fullLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sendBtn: {
    minWidth: 72,
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: 'rgba(255,255,255,0.18)' },
  sendBtnOn: { backgroundColor: colors.brand.primary },
  sendBtnText: { color: 'rgba(255,255,255,0.45)', fontWeight: '800', fontSize: 15 },
  sendBtnTextOn: { color: colors.brand.ink },
  composeRoot: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  composePage: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  composeImage: { width: SCREEN_W, height: SCREEN_H },
  composeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  composeIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeTools: {
    position: 'absolute',
    right: 8,
    zIndex: 4,
    gap: 18,
    alignItems: 'center',
  },
  composeToolBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    // Match LINE: white glyph + soft shadow (no chip bg)
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  composeToolLetter: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  composeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  composeSelectRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  composeSelectOn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2E8CFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeSelectNum: { color: '#fff', fontWeight: '900', fontSize: 11 },
  composeSendFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2E8CFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
});
