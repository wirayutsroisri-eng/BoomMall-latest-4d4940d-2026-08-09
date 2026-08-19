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
  Share,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { GalleryPhotoEditor } from '@/shared/media/GalleryPhotoEditor';
import type { ChatMediaItem } from '@/modules/chat/domain/selectChatImages';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const GRID_GAP = 1.5;
const GRID_COLS = 4;
const GRID_TILE = (SCREEN_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

export type ChatMediaForwardTarget = {
  id: string;
  peerName: string;
  avatarColor: string;
  avatarUri?: string;
};

type Props = {
  visible: boolean;
  items: ChatMediaItem[];
  initialIndex: number;
  onClose: () => void;
  onDelete?: (messageId: string) => void;
  /** WeChat "ส่งต่อไปยัง" — forward current image into another chat */
  forwardTargets?: ChatMediaForwardTarget[];
  onForward?: (conversationId: string, imageUri: string) => void;
  /** Replace the current photo after markup / crop / filter. */
  onReplaceImage?: (messageId: string, albumIndex: number, uri: string) => void;
};

async function saveUriToLibrary(uri: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) throw new Error('permission_denied');

  let localUri = uri;
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const dir = new Directory(Paths.cache, 'chat-saves');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const downloaded = await File.downloadFileAsync(uri, dir);
    localUri = downloaded.uri;
  }

  if (!/\.\w{2,5}(?:\?|$)/.test(localUri.split('/').pop() ?? '')) {
    const withExt = new File(Paths.cache, `chat-save-${Date.now()}.jpg`);
    try {
      new File(localUri).copy(withExt, { overwrite: true });
      localUri = withExt.uri;
    } catch {
      // keep original
    }
  }

  await MediaLibrary.saveToLibraryAsync(localUri);
}

async function ensureLocalImageUri(uri: string): Promise<string> {
  if (!uri.startsWith('http://') && !uri.startsWith('https://')) return uri;
  const dir = new Directory(Paths.cache, 'chat-edits');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const downloaded = await File.downloadFileAsync(uri, dir);
  return downloaded.uri;
}

function monthLabel(_item: ChatMediaItem): string {
  // Mock chat timestamps are clock-only; group under current month like WeChat
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

/**
 * WeChat-style chat media viewer:
 * - Fullscreen pager + bottom: share / save / album / more
 * - Album "ภาพและวิดีโอ" grid with select mode
 * - More sheet: forward row + save / delete
 */
export function ChatMediaViewer({
  visible,
  items,
  initialIndex,
  onClose,
  onDelete,
  forwardTargets = [],
  onForward,
  onReplaceImage,
}: Props) {
  const insets = useSafeAreaInsets();
  const pagerRef = useRef<FlatList<ChatMediaItem>>(null);
  const [index, setIndex] = useState(initialIndex);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editorUri, setEditorUri] = useState<string | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const safe = Math.max(0, Math.min(Math.max(items.length - 1, 0), initialIndex));
    setIndex(safe);
    setAlbumOpen(false);
    setMoreOpen(false);
    setEditorUri(null);
    setEditorBusy(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    setChromeVisible(true);
    if (!items.length) return;
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToIndex({ index: safe, animated: false });
    });
  }, [visible, initialIndex, items.length]);

  useEffect(() => {
    if (!items.length) {
      if (visible) onClose();
      return;
    }
    if (index > items.length - 1) setIndex(items.length - 1);
  }, [items, index, visible, onClose]);

  const current = items[Math.min(index, Math.max(items.length - 1, 0))];

  const albumSections = useMemo(() => {
    const map = new Map<string, ChatMediaItem[]>();
    for (const item of items) {
      const key = monthLabel(item);
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [items]);

  const onPagerScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      setIndex(Math.max(0, Math.min(items.length - 1, next)));
    },
    [items.length],
  );

  const openFromAlbum = useCallback((i: number) => {
    void Haptics.selectionAsync();
    setIndex(i);
    setAlbumOpen(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    setChromeVisible(true);
    requestAnimationFrame(() => {
      pagerRef.current?.scrollToIndex({ index: i, animated: false });
    });
  }, []);

  const toggleSelect = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);

  const saveOne = useCallback(async (uri: string) => {
    await saveUriToLibrary(uri);
  }, []);

  const onSave = useCallback(async () => {
    if (saving) return;
    const targets =
      albumOpen && selectMode && selectedIds.size
        ? items.filter((m) => selectedIds.has(m.messageId))
        : current
          ? [current]
          : [];
    if (!targets.length) return;
    setSaving(true);
    try {
      for (const t of targets) {
        await saveOne(t.uri);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('บันทึกแล้ว', targets.length > 1 ? `บันทึก ${targets.length} รูปแล้ว` : 'บันทึกรูปลงคลังรูปแล้ว');
      setMoreOpen(false);
      if (selectMode) {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    } catch (err) {
      const msg =
        err instanceof Error && err.message === 'permission_denied'
          ? 'ต้องอนุญาตเข้าถึงคลังรูปก่อนบันทึก'
          : 'บันทึกรูปไม่สำเร็จ ลองอีกครั้ง';
      Alert.alert('บันทึกไม่สำเร็จ', msg);
    } finally {
      setSaving(false);
    }
  }, [saving, albumOpen, selectMode, selectedIds, items, current, saveOne]);

  const onDeletePress = useCallback(() => {
    if (!onDelete) return;
    const targets =
      albumOpen && selectMode && selectedIds.size
        ? items.filter((m) => selectedIds.has(m.messageId))
        : current
          ? [current]
          : [];
    if (!targets.length) return;
    Alert.alert(
      targets.length > 1 ? `ลบ ${targets.length} รูป?` : 'ลบรูปนี้?',
      'รูปจะถูกลบออกจากแชต',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: () => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            for (const t of targets) onDelete(t.messageId);
            setMoreOpen(false);
            setSelectMode(false);
            setSelectedIds(new Set());
          },
        },
      ],
    );
  }, [onDelete, albumOpen, selectMode, selectedIds, items, current]);

  const onShare = useCallback(async () => {
    if (!current) return;
    try {
      await Share.share(
        current.uri.startsWith('http')
          ? { url: current.uri, message: current.uri }
          : { url: current.uri },
      );
      setMoreOpen(false);
    } catch {
      // user cancelled
    }
  }, [current]);

  const onEditPress = useCallback(async () => {
    if (!current || editorBusy) return;
    setMoreOpen(false);
    setEditorBusy(true);
    try {
      const local = await ensureLocalImageUri(current.uri);
      setEditorUri(local);
    } catch {
      Alert.alert('เปิดแก้ไขไม่ได้', 'ลองอีกครั้ง');
    } finally {
      setEditorBusy(false);
    }
  }, [current, editorBusy]);

  const onForwardTo = useCallback(
    (targetId: string) => {
      if (!current || !onForward) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onForward(targetId, current.uri);
      setMoreOpen(false);
      Alert.alert('ส่งต่อแล้ว', 'ส่งรูปไปยังการสนทนาแล้ว');
    },
    [current, onForward],
  );

  const counter = useMemo(() => {
    if (!items.length) return '';
    return `${Math.min(index, items.length - 1) + 1}/${items.length}`;
  }, [index, items.length]);

  if (!items.length) return null;

  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={() => {
        if (editorUri) {
          setEditorUri(null);
          return;
        }
        if (moreOpen) {
          setMoreOpen(false);
          return;
        }
        if (albumOpen) {
          setAlbumOpen(false);
          return;
        }
        onClose();
      }}
    >
      <GestureHandlerRootView style={styles.root}>
        <DragDownDismiss
          onDismiss={onClose}
          showDim
          rootInModal={false}
          style={styles.sheet}
          enabled={!moreOpen && !albumOpen && !editorUri && !editorBusy}
        >
          <View style={styles.black}>
            {/* ——— Fullscreen pager ——— */}
            <FlatList
              ref={pagerRef}
              data={items}
              keyExtractor={(item) => item.messageId}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEnabled={!albumOpen}
              initialScrollIndex={Math.max(0, Math.min(items.length - 1, initialIndex))}
              getItemLayout={(_, i) => ({
                length: SCREEN_W,
                offset: SCREEN_W * i,
                index: i,
              })}
              onMomentumScrollEnd={onPagerScrollEnd}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.page}
                  onPress={() => setChromeVisible((v) => !v)}
                >
                  <Image source={{ uri: item.uri }} style={styles.fullImage} resizeMode="contain" />
                </Pressable>
              )}
              onScrollToIndexFailed={(info) => {
                setTimeout(() => {
                  pagerRef.current?.scrollToIndex({ index: info.index, animated: false });
                }, 80);
              }}
            />

            {chromeVisible && !albumOpen ? (
              <>
                <View style={[styles.viewerTop, { paddingTop: insets.top + 4 }]} pointerEvents="box-none">
                  <Pressable style={styles.iconHit} onPress={onClose} accessibilityLabel="ปิด">
                    <Ionicons name="close" size={28} color="#fff" />
                  </Pressable>
                  <Text style={styles.counter}>{counter}</Text>
                  <View style={styles.iconHit} />
                </View>

                <View style={[styles.viewerBar, { paddingBottom: bottomPad }]}>
                  <ToolIcon
                    name="arrow-redo-outline"
                    label="แชร์"
                    onPress={() => void onShare()}
                  />
                  <ToolIcon
                    name="download-outline"
                    label="บันทึก"
                    onPress={() => void onSave()}
                    busy={saving}
                  />
                  <ToolIcon
                    name="grid-outline"
                    label="อัลบั้ม"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setAlbumOpen(true);
                      setMoreOpen(false);
                    }}
                  />
                  <ToolIcon
                    name="ellipsis-horizontal"
                    label="เพิ่มเติม"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setMoreOpen(true);
                    }}
                  />
                </View>
              </>
            ) : null}

            {/* ——— WeChat album: ภาพและวิดีโอ ——— */}
            {albumOpen ? (
              <View style={[styles.album, { paddingTop: insets.top }]}>
                <View style={styles.albumHeader}>
                  <Pressable
                    style={styles.iconHit}
                    onPress={() => {
                      setAlbumOpen(false);
                      setSelectMode(false);
                      setSelectedIds(new Set());
                    }}
                    accessibilityLabel="กลับ"
                  >
                    <Ionicons name="chevron-back" size={28} color="#fff" />
                  </Pressable>
                  <Pressable style={styles.albumTitleWrap} accessibilityRole="button">
                    <Text style={styles.albumTitle}>ภาพและวิดีโอ</Text>
                    <Ionicons name="chevron-down" size={16} color="#fff" />
                  </Pressable>
                  <Pressable
                    style={styles.selectBtn}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSelectMode((v) => {
                        if (v) setSelectedIds(new Set());
                        return !v;
                      });
                    }}
                  >
                    <Text style={styles.selectBtnText}>{selectMode ? 'ยกเลิก' : 'เลือก'}</Text>
                  </Pressable>
                </View>

                <FlatList
                  key="album-grid"
                  data={albumSections}
                  keyExtractor={(s) => s.title}
                  contentContainerStyle={{ paddingBottom: selectMode ? 88 + bottomPad : bottomPad }}
                  renderItem={({ item: section }) => (
                    <View>
                      <Text style={styles.sectionTitle}>{section.title}</Text>
                      <View style={styles.gridRow}>
                        {section.data.map((media) => {
                          const globalIndex = items.findIndex((m) => m.messageId === media.messageId);
                          const selected = selectedIds.has(media.messageId);
                          return (
                            <Pressable
                              key={media.messageId}
                              onPress={() => {
                                if (selectMode) toggleSelect(media.messageId);
                                else if (globalIndex >= 0) openFromAlbum(globalIndex);
                              }}
                              style={[styles.gridTile, { width: GRID_TILE, height: GRID_TILE }]}
                            >
                              <Image source={{ uri: media.uri }} style={styles.gridImage} />
                              {selectMode ? (
                                <View style={[styles.check, selected && styles.checkOn]}>
                                  {selected ? (
                                    <Ionicons name="checkmark" size={14} color="#fff" />
                                  ) : null}
                                </View>
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                />

                {selectMode ? (
                  <View style={[styles.albumActions, { paddingBottom: bottomPad }]}>
                    <Pressable
                      style={[styles.albumActionBtn, !selectedIds.size && styles.actionDisabled]}
                      disabled={!selectedIds.size || saving}
                      onPress={() => void onSave()}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Ionicons name="download-outline" size={22} color="#fff" />
                      )}
                      <Text style={styles.albumActionText}>บันทึก</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.albumActionBtn, !selectedIds.size && styles.actionDisabled]}
                      disabled={!selectedIds.size || !onDelete}
                      onPress={onDeletePress}
                    >
                      <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                      <Text style={[styles.albumActionText, styles.danger]}>ลบ</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ——— More sheet (WeChat action sheet) ——— */}
            {moreOpen ? (
              <View style={styles.moreRoot} pointerEvents="box-none">
                <Pressable style={styles.moreDim} onPress={() => setMoreOpen(false)} />
                <DragDownDismiss
                  onDismiss={() => setMoreOpen(false)}
                  rootInModal={false}
                  style={[styles.moreSheet, { paddingBottom: bottomPad }]}
                >
                  {forwardTargets.length && onForward ? (
                    <View style={styles.forwardBlock}>
                      <Text style={styles.forwardTitle}>ส่งต่อไปยัง</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forwardRow}>
                        {forwardTargets.map((t) => (
                          <Pressable
                            key={t.id}
                            style={styles.forwardItem}
                            onPress={() => onForwardTo(t.id)}
                          >
                            {t.avatarUri ? (
                              <Image source={{ uri: t.avatarUri }} style={styles.forwardAvatar} />
                            ) : (
                              <View style={[styles.forwardAvatar, { backgroundColor: t.avatarColor }]}>
                                <Text style={styles.forwardInitial}>
                                  {t.peerName.slice(0, 1)}
                                </Text>
                              </View>
                            )}
                            <Text style={styles.forwardName} numberOfLines={1}>
                              {t.peerName}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  <View style={styles.moreActions}>
                    <MoreAction
                      icon="chatbubble-ellipses-outline"
                      label="ส่งไปที่การสนทนา"
                      onPress={() => {
                        setMoreOpen(false);
                        void onShare();
                      }}
                    />
                    <MoreAction
                      icon="color-wand-outline"
                      label="แก้ไขรูป"
                      onPress={() => void onEditPress()}
                    />
                    <MoreAction
                      icon="download-outline"
                      label="บันทึกรูป"
                      onPress={() => void onSave()}
                    />
                    <MoreAction
                      icon="share-outline"
                      label="เปิดด้วยแอปอื่น"
                      onPress={() => void onShare()}
                    />
                    <MoreAction
                      icon="trash-outline"
                      label="ลบ"
                      danger
                      onPress={onDeletePress}
                    />
                  </View>

                  <Pressable style={styles.cancelBtn} onPress={() => setMoreOpen(false)}>
                    <Text style={styles.cancelText}>ยกเลิก</Text>
                  </Pressable>
                </DragDownDismiss>
              </View>
            ) : null}

            {editorBusy ? (
              <View style={styles.editorBusy} pointerEvents="auto">
                <ActivityIndicator color="#fff" size="large" />
              </View>
            ) : null}

            {editorUri && current ? (
              <View style={styles.editorLayer}>
                <GalleryPhotoEditor
                  uri={editorUri}
                  initialTool="draw"
                  onClose={() => setEditorUri(null)}
                  onDone={(uri) => {
                    onReplaceImage?.(current.messageId, current.albumIndex ?? 0, uri);
                    setEditorUri(null);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                />
              </View>
            ) : null}
          </View>
        </DragDownDismiss>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ToolIcon({
  name,
  label,
  onPress,
  busy,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable style={styles.toolBtn} onPress={onPress} accessibilityLabel={label}>
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Ionicons name={name} size={26} color="#fff" />
      )}
    </Pressable>
  );
}

function MoreAction({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.moreAction} onPress={onPress}>
      <View style={styles.moreActionIcon}>
        <Ionicons name={icon} size={22} color={danger ? '#E53935' : '#1a1a1a'} />
      </View>
      <Text style={[styles.moreActionLabel, danger && styles.danger]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: { flex: 1 },
  black: { flex: 1, backgroundColor: '#000' },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.78,
  },
  viewerTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  counter: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  iconHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  toolBtn: {
    width: 56,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  album: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    backgroundColor: '#000',
  },
  albumHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  albumTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  albumTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  selectBtn: {
    paddingHorizontal: 14,
    height: 44,
    justifyContent: 'center',
  },
  selectBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridTile: {
    marginRight: GRID_GAP,
    marginBottom: GRID_GAP,
    backgroundColor: '#1a1a1a',
  },
  gridImage: { width: '100%', height: '100%' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: '#07C160',
    borderColor: '#07C160',
  },
  albumActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 12,
    backgroundColor: 'rgba(20,20,20,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  albumActionBtn: {
    alignItems: 'center',
    gap: 4,
    minWidth: 96,
    paddingVertical: 4,
  },
  albumActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionDisabled: { opacity: 0.35 },
  danger: { color: '#FF6B6B' },
  moreRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    justifyContent: 'flex-end',
  },
  moreDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  moreSheet: {
    backgroundColor: '#EDEDED',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 10,
    maxHeight: SCREEN_H * 0.72,
  },
  forwardBlock: {
    backgroundColor: '#fff',
    marginHorizontal: 10,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  forwardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginLeft: 14,
    marginBottom: 10,
  },
  forwardRow: {
    paddingHorizontal: 12,
    gap: 14,
  },
  forwardItem: {
    width: 64,
    alignItems: 'center',
    gap: 6,
  },
  forwardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  forwardInitial: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  forwardName: {
    fontSize: 11,
    color: '#333',
    width: '100%',
    textAlign: 'center',
  },
  moreActions: {
    backgroundColor: '#fff',
    marginHorizontal: 10,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  moreAction: {
    width: (SCREEN_W - 20 - 16 - 32) / 5,
    alignItems: 'center',
    gap: 6,
  },
  editorBusy: {
    ...{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    zIndex: 40,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorLayer: {
    ...{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    zIndex: 50,
  },
  moreActionIcon: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreActionLabel: {
    fontSize: 11,
    color: '#333',
    textAlign: 'center',
    lineHeight: 14,
  },
  cancelBtn: {
    marginHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#2E8CFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
