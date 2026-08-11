import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import { useMusicPlayerStore } from '../state/music-player-store';
import { useMusicLibraryStore } from '../state/music-library-store';
import { formatTrackTime, MOCK_MUSIC_TRACKS, searchTracks } from '../data/mockTracks';
import { formatViewsLabel, formatWatchAgo } from '../domain/format-views';
import type { MusicTrack } from '../domain/types';
import { confirmUseThisSound } from '../domain/use-this-sound';
import { MusicLibrarySidebar, type MusicLibraryTab } from './MusicLibrarySidebar';
import { MusicUploadSheet } from './MusicUploadSheet';
import { MusicYoutubeMenu, type YoutubeMenuAction } from './MusicYoutubeMenu';
import { ENABLE_MUSIC_UPLOAD } from '@/shared/compliance/appStoreGates';
import { colors } from '@/shared/theme/colors';

const SEEK_STEP_SEC = 10;
/** YouTube-like double-tap window */
const DOUBLE_TAP_MS = 280;
/** Auto-hide title/seek chrome while playing */
const CHROME_HIDE_MS = 2000;
const GRID_COLS = 2;
const GRID_GAP = 8;
const GRID_H_PAD = 10;

/**
 * Listen screen — one continuous scroll (stage + library).
 * Playing: title/seek chrome slides in, fades after 2s; tap reveals again.
 * Gestures: chrome hidden → tap reveals · chrome shown → tap play/pause ·
 * double-tap L/R ±10s. Long-press / ⋮ → YouTube menu.
 */
export function MusicListenScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const stageH = Math.min(Math.round(height * 0.42), width);
  const tileW = (width - GRID_H_PAD * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
  const tileH = Math.round(tileW * 1.2);

  const track = useMusicPlayerStore((s) => s.track);
  const playing = useMusicPlayerStore((s) => s.playing);
  const currentTime = useMusicPlayerStore((s) => s.currentTime);
  const duration = useMusicPlayerStore((s) => s.duration);
  const buffering = useMusicPlayerStore((s) => s.buffering);
  const toggle = useMusicPlayerStore((s) => s.toggle);
  const seekTo = useMusicPlayerStore((s) => s.seekTo);
  const playTrack = useMusicPlayerStore((s) => s.playTrack);
  const playerQueue = useMusicPlayerStore((s) => s.queue);
  const reorderQueue = useMusicPlayerStore((s) => s.reorderQueue);
  const setQueueOrder = useMusicPlayerStore((s) => s.setQueueOrder);
  const collapse = useMusicPlayerStore((s) => s.collapse);
  const expand = useMusicPlayerStore((s) => s.expand);
  const forceClose = useMusicPlayerStore((s) => s.forceClose);

  const hydrateLibrary = useMusicLibraryStore((s) => s.hydrate);
  const uploads = useMusicLibraryStore((s) => s.uploads);
  const loadedIds = useMusicLibraryStore((s) => s.loadedIds);
  const pinnedIds = useMusicLibraryStore((s) => s.pinnedIds);
  const hiddenIds = useMusicLibraryStore((s) => s.hiddenIds);
  const recentPlayIds = useMusicLibraryStore((s) => s.recentPlayIds);
  const playCountById = useMusicLibraryStore((s) => s.playCountById);
  const watchHistory = useMusicLibraryStore((s) => s.watchHistory);
  const totalViewsFn = useMusicLibraryStore((s) => s.totalViews);
  const loadTrackToLibrary = useMusicLibraryStore((s) => s.loadTrackToLibrary);
  const isLoaded = useMusicLibraryStore((s) => s.isLoaded);
  const isPinned = useMusicLibraryStore((s) => s.isPinned);
  const togglePin = useMusicLibraryStore((s) => s.togglePin);
  const reorderPinned = useMusicLibraryStore((s) => s.reorderPinned);
  const removeFromList = useMusicLibraryStore((s) => s.removeFromList);
  const allTracksFn = useMusicLibraryStore((s) => s.allTracks);
  const serveQueueFn = useMusicLibraryStore((s) => s.serveQueue);

  const [query, setQuery] = useState('');
  const [libraryTab, setLibraryTab] = useState<MusicLibraryTab>('all');
  const [queueEdit, setQueueEdit] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrub, setScrub] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const chromeVisibleRef = useRef(true);
  const chromeAnim = useRef(new Animated.Value(1)).current;
  const chromeHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tapFlash, setTapFlash] = useState<{ label: string; side?: 'left' | 'right' | 'center' } | null>(
    null,
  );
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapAt = useRef(0);
  const pendingSingleTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuTrack, setMenuTrack] = useState<MusicTrack | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  const catalog = useMemo(
    () => allTracksFn(),
    [uploads, loadedIds, pinnedIds, hiddenIds, allTracksFn],
  );

  const historyTracks = useMemo(() => {
    const byId = new Map(catalog.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const rows: Array<{ track: MusicTrack; at: string; completed: boolean }> = [];
    for (const h of watchHistory) {
      if (seen.has(h.trackId)) continue;
      const track = byId.get(h.trackId);
      if (!track) continue;
      seen.add(h.trackId);
      rows.push({ track, at: h.at, completed: h.completed });
    }
    return rows;
  }, [watchHistory, catalog]);

  const pinnedTracks = useMemo(() => {
    const byId = new Map(catalog.map((t) => [t.id, t]));
    return pinnedIds.map((id) => byId.get(id)).filter(Boolean) as MusicTrack[];
  }, [catalog, pinnedIds]);

  const scoped = useMemo(() => {
    const byId = new Map(catalog.map((t) => [t.id, t]));
    if (libraryTab === 'pinned') return pinnedTracks;
    if (libraryTab === 'history') {
      if (historyTracks.length) return historyTracks.map((r) => r.track);
      return recentPlayIds.map((id) => byId.get(id)).filter(Boolean) as MusicTrack[];
    }
    if (libraryTab === 'frequent') {
      return [...catalog]
        .filter((t) => (playCountById[t.id] ?? 0) > 0)
        .sort((a, b) => (playCountById[b.id] ?? 0) - (playCountById[a.id] ?? 0));
    }
    // 'all' (+ legacy 'forYou'): full catalog; recommendation runs in the background on play
    return catalog;
  }, [catalog, libraryTab, pinnedTracks, historyTracks, recentPlayIds, playCountById]);

  const filtered = useMemo(() => searchTracks(scoped, query), [scoped, query]);

  const listTitle = useMemo(() => {
    if (queueEdit) {
      return libraryTab === 'pinned' ? 'จัดคิวปักหมุด' : 'จัดคิวเล่น';
    }
    if (query.trim()) return 'ผลค้นหา';
    switch (libraryTab) {
      case 'pinned':
        return 'ปักหมุด';
      case 'history':
        return 'ประวัติชม';
      case 'frequent':
        return 'เล่นบ่อย';
      default:
        return 'ทั้งหมด';
    }
  }, [queueEdit, libraryTab, query]);

  const editList = useMemo(() => {
    if (!queueEdit) return filtered;
    if (libraryTab === 'pinned') return pinnedTracks;
    return playerQueue;
  }, [queueEdit, libraryTab, pinnedTracks, playerQueue, filtered]);

  const active = track ?? filtered[0] ?? MOCK_MUSIC_TRACKS[0];
  const max = duration > 0 ? duration : active?.durationHintSec ?? 1;
  const progress = scrubbing ? scrub : Math.min(currentTime, max);
  const activePinned = active ? isPinned(active.id) : false;

  useEffect(() => {
    void hydrateLibrary();
    expand();
    return () => collapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (bootstrapped || track || !filtered[0]) return;
    setBootstrapped(true);
    void playTrack(filtered[0], catalog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.length, bootstrapped]);

  /** Minimize — music keeps playing in mini player */
  const onMinimize = () => {
    collapse();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /** Force stop + leave — for when audio hangs */
  const onForceClose = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    forceClose();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const onLoadTrack = async (item: MusicTrack) => {
    setLoadingId(item.id);
    void Haptics.selectionAsync();
    const result = await loadTrackToLibrary(item);
    setLoadingId(null);
    if (result.ok) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('โหลดเข้าคลังแล้ว', `「${item.title}」พร้อมฟังในเครื่อง`);
    } else {
      Alert.alert('โหลดไม่สำเร็จ', result.reason);
    }
  };

  /** Play: pinned → pinned queue; elsewhere → algorithmic radio queue in the background */
  const onPlayItem = (item: MusicTrack) => {
    void Haptics.selectionAsync();
    if (libraryTab === 'pinned') {
      void playTrack(item, pinnedTracks.length > 0 ? pinnedTracks : [item]);
      return;
    }
    // YouTube-style: don't surface "for you" — just continue with a taste-aware queue
    const radio = serveQueueFn({ seed: item, limit: 40 });
    void playTrack(item, radio.length > 0 ? radio : filtered.length > 0 ? filtered : [item]);
  };

  const onMoveRow = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0) return;
    void Haptics.selectionAsync();
    if (libraryTab === 'pinned') {
      if (to >= pinnedTracks.length) return;
      reorderPinned(index, to);
      // Keep player queue in sync when listening to pinned playlist
      const nextPins = [...pinnedTracks];
      const [m] = nextPins.splice(index, 1);
      if (m) {
        nextPins.splice(to, 0, m);
        setQueueOrder(nextPins);
      }
      return;
    }
    if (to >= playerQueue.length) return;
    reorderQueue(index, to);
  };

  const onDeleteTrack = (item: MusicTrack) => {
    Alert.alert(
      'ลบเพลง?',
      item.isUpload
        ? `ลบ「${item.title}」ออกจากคลังถาวร`
        : `ซ่อน「${item.title}」ออกจากรายการ`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: () => {
            void removeFromList(item).then(() => {
              if (track?.id === item.id) {
                const rest = catalog.filter((t) => t.id !== item.id);
                if (rest[0]) void playTrack(rest[0], rest);
                else forceClose();
              }
            });
          },
        },
      ],
    );
  };

  const flash = (label: string, side: 'left' | 'right' | 'center' = 'center') => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setTapFlash({ label, side });
    flashTimer.current = setTimeout(() => setTapFlash(null), 650);
  };

  const animateChrome = useCallback(
    (visible: boolean) => {
      chromeVisibleRef.current = visible;
      setChromeVisible(visible);
      Animated.timing(chromeAnim, {
        toValue: visible ? 1 : 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
    },
    [chromeAnim],
  );

  const clearChromeHide = useCallback(() => {
    if (chromeHideTimer.current) {
      clearTimeout(chromeHideTimer.current);
      chromeHideTimer.current = null;
    }
  }, []);

  const scheduleChromeHide = useCallback(() => {
    clearChromeHide();
    chromeHideTimer.current = setTimeout(() => {
      chromeHideTimer.current = null;
      animateChrome(false);
    }, CHROME_HIDE_MS);
  }, [animateChrome, clearChromeHide]);

  const revealChrome = useCallback(
    (autoHide: boolean) => {
      animateChrome(true);
      if (autoHide) scheduleChromeHide();
      else clearChromeHide();
    },
    [animateChrome, scheduleChromeHide, clearChromeHide],
  );

  /** When play starts → show chrome, then fade after 2s. Paused → keep chrome. */
  useEffect(() => {
    if (scrubbing) {
      clearChromeHide();
      animateChrome(true);
      return;
    }
    if (playing) {
      revealChrome(true);
    } else {
      revealChrome(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, track?.id, scrubbing]);

  const seekBy = (delta: number) => {
    const next = Math.max(0, Math.min(max, currentTime + delta));
    void seekTo(next);
    flash(
      delta > 0 ? `+${SEEK_STEP_SEC} วิ` : `−${SEEK_STEP_SEC} วิ`,
      delta > 0 ? 'right' : 'left',
    );
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playing) revealChrome(true);
    else revealChrome(false);
  };

  const onPlayPauseTap = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggle();
    flash(playing ? 'หยุด' : 'เล่น', 'center');
  };

  /**
   * Double-tap L/R = ±10s.
   * Chrome hidden → single tap reveals bar.
   * Chrome visible → single tap play/pause.
   */
  const onStagePress = (e: GestureResponderEvent) => {
    const now = Date.now();
    const x = e.nativeEvent.locationX;
    const isLeft = x < width * 0.5;

    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      if (pendingSingleTap.current) {
        clearTimeout(pendingSingleTap.current);
        pendingSingleTap.current = null;
      }
      lastTapAt.current = 0;
      seekBy(isLeft ? -SEEK_STEP_SEC : SEEK_STEP_SEC);
      return;
    }

    lastTapAt.current = now;
    if (pendingSingleTap.current) clearTimeout(pendingSingleTap.current);
    pendingSingleTap.current = setTimeout(() => {
      pendingSingleTap.current = null;
      if (!chromeVisibleRef.current) {
        revealChrome(playing);
        void Haptics.selectionAsync();
        return;
      }
      onPlayPauseTap();
    }, DOUBLE_TAP_MS);
  };

  useEffect(() => {
    return () => {
      if (pendingSingleTap.current) clearTimeout(pendingSingleTap.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (chromeHideTimer.current) clearTimeout(chromeHideTimer.current);
    };
  }, []);

  const showTrackMenu = (item: MusicTrack) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSettingsMenuOpen(false);
    setMenuTrack(item);
  };

  const openLibrarySettingsMenu = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuTrack(null);
    setSettingsMenuOpen(true);
  };

  const handleYoutubeMenuAction = (action: YoutubeMenuAction, item: MusicTrack | null) => {
    if (action.type === 'showLibrary') {
      setLibraryTab(action.tab);
      setQueueEdit(false);
      void Haptics.selectionAsync();
      return;
    }
    if (!item) return;
    if (action.type === 'pin') {
      togglePin(item.id);
      void Haptics.selectionAsync();
    } else if (action.type === 'use') {
      confirmUseThisSound(item);
    } else if (action.type === 'load') {
      void onLoadTrack(item);
    } else if (action.type === 'delete') {
      onDeleteTrack(item);
    }
  };

  if (!active) return null;

  const listChrome = (
    <>
      <View style={[styles.topBar, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={onMinimize} hitSlop={10} style={styles.topBtn} accessibilityLabel="ย่อ">
          <Ionicons name="chevron-down" size={26} color="#fff" />
        </Pressable>
        <Pressable
          onPress={onForceClose}
          hitSlop={10}
          style={styles.topBtn}
          accessibilityLabel="ปิดทันที"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <View style={styles.topCenter}>
          <Text style={styles.topEyebrow}>ฟังเพลง</Text>
          <Text style={styles.topHint}>
            {buffering
              ? 'กำลังโหลด…'
              : chromeVisible
                ? 'แตะ = เล่น/หยุด · ซ้าย×2 −10 · ขวา×2 +10'
                : 'แตะเพื่อแสดงชื่อเพลง · เลื่อนลงดูคลัง'}
          </Text>
        </View>
        <Pressable
          onPress={openLibrarySettingsMenu}
          hitSlop={10}
          style={[styles.topBtn, styles.settingsGear]}
          accessibilityLabel="ตั้งค่ารายการเพลง"
        >
          <Ionicons name="settings" size={20} color="#fff" />
        </Pressable>
        {ENABLE_MUSIC_UPLOAD ? (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setUploadOpen(true);
            }}
            hitSlop={10}
            style={styles.topBtn}
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.brand.primary} />
          </Pressable>
        ) : (
          <View style={styles.topBtn} />
        )}
      </View>

      <Pressable
        style={[styles.stage, { height: stageH }]}
        onPress={onStagePress}
        accessibilityLabel={
          chromeVisible
            ? playing
              ? 'แตะเพื่อหยุด'
              : 'แตะเพื่อเล่น'
            : 'แตะเพื่อแสดงชื่อเพลง'
        }
      >
        <Image source={{ uri: active.artworkUrl }} style={styles.stageArt} />
        <LinearGradient
          colors={['transparent', 'rgba(10,22,17,0.45)', 'rgba(10,22,17,0.88)']}
          style={StyleSheet.absoluteFill}
        />
        {tapFlash ? (
          <View
            style={[
              styles.flashBadge,
              tapFlash.side === 'left' && styles.flashLeft,
              tapFlash.side === 'right' && styles.flashRight,
            ]}
            pointerEvents="none"
          >
            <Ionicons
              name={
                tapFlash.side === 'left'
                  ? 'play-back'
                  : tapFlash.side === 'right'
                    ? 'play-forward'
                    : tapFlash.label === 'หยุด'
                      ? 'pause'
                      : 'play'
              }
              size={22}
              color="#fff"
            />
            <Text style={styles.flashText}>{tapFlash.label}</Text>
          </View>
        ) : null}
        {!playing && !tapFlash && chromeVisible ? (
          <View style={styles.pausedHint} pointerEvents="none">
            <Ionicons name="play" size={36} color="rgba(255,255,255,0.85)" />
          </View>
        ) : null}

        {/* Title + seek — pops in on play, fades after 2s */}
        <Animated.View
          style={[
            styles.chromeOverlay,
            {
              opacity: chromeAnim,
              transform: [
                {
                  translateY: chromeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents={chromeVisible ? 'box-none' : 'none'}
        >
          <Pressable
            onLongPress={() => showTrackMenu(active)}
            delayLongPress={350}
            style={styles.titleBlock}
          >
            <Text style={styles.title} numberOfLines={2}>
              {active.title}
              {activePinned ? '  📌' : ''}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {active.artist}
              {active.mediaKind === 'video' ? ' · วิดีโอเพลง' : ''}
            </Text>
          </Pressable>
          <View style={styles.seekBlock}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={max}
              value={progress}
              minimumTrackTintColor={colors.brand.primary}
              maximumTrackTintColor="rgba(255,255,255,0.2)"
              thumbTintColor="#fff"
              onSlidingStart={() => {
                setScrubbing(true);
                setScrub(currentTime);
              }}
              onValueChange={setScrub}
              onSlidingComplete={(v) => {
                setScrubbing(false);
                void seekTo(v);
                if (playing) scheduleChromeHide();
              }}
            />
            <View style={styles.timeRow}>
              <Text style={styles.time}>{formatTrackTime(progress)}</Text>
              <Text style={styles.time}>{formatTrackTime(max)}</Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>

      <View style={styles.librarySheet}>
        <View style={styles.libraryGrabber} />
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.5)" />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาชื่อ / ศิลปิน / แนว (ชิลล์, โลฟาย…)"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.45)" />
            </Pressable>
          ) : null}
        </View>

        <MusicLibrarySidebar
          active={libraryTab}
          onChange={(tab) => {
            setLibraryTab(tab);
            setQueueEdit(false);
          }}
          onAdd={ENABLE_MUSIC_UPLOAD ? () => setUploadOpen(true) : undefined}
        />

        <View style={styles.listHeader}>
          <Text style={styles.queueTitle}>{listTitle}</Text>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setQueueEdit((v) => !v);
            }}
            style={[styles.queueEditBtn, queueEdit && styles.queueEditBtnOn]}
          >
            <Ionicons
              name="swap-vertical"
              size={16}
              color={queueEdit ? colors.brand.ink : colors.brand.primary}
            />
            <Text style={[styles.queueEditText, queueEdit && styles.queueEditTextOn]}>
              {queueEdit ? 'เสร็จ' : 'จัดคิว'}
            </Text>
          </Pressable>
          {ENABLE_MUSIC_UPLOAD ? (
            <Pressable onPress={() => setUploadOpen(true)}>
              <Text style={styles.uploadLink}>+ ลงเพลง</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </>
  );

  const listPad = { paddingHorizontal: GRID_H_PAD, paddingBottom: insets.bottom + 28 };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0B1F17', '#122820', '#0A1611']} style={StyleSheet.absoluteFill} />

      {queueEdit ? (
        <FlatList
          style={styles.libraryFlex}
          data={editList}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={listPad}
          ListHeaderComponent={
            <>
              {listChrome}
              <Text style={styles.editHint}>
                {libraryTab === 'pinned'
                  ? 'เลื่อนขึ้น/ลงเพื่อจัดคิวเพลย์ลิสต์ปักหมุด — กดเล่นจากแท็บปักหมุด'
                  : 'เลื่อนขึ้น/ลงเพื่อจัดคิวเพลงที่กำลังเล่น'}
              </Text>
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>ยังไม่มีคิว</Text>
              <Text style={styles.emptySub}>
                {libraryTab === 'pinned'
                  ? 'ปักหมุดเพลงก่อน แล้วค่อยจัดลำดับที่นี่'
                  : 'เล่นเพลงก่อน แล้วกดจัดคิวเพื่อเรียงลำดับ'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const activeRow = item.id === active.id;
            return (
              <View style={[styles.queueRow, activeRow && styles.queueRowActive]}>
                <View style={styles.moveCol}>
                  <Pressable
                    hitSlop={6}
                    disabled={index === 0}
                    onPress={() => onMoveRow(index, -1)}
                    style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}
                  >
                    <Ionicons name="chevron-up" size={18} color="#fff" />
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    disabled={index >= editList.length - 1}
                    onPress={() => onMoveRow(index, 1)}
                    style={[
                      styles.moveBtn,
                      index >= editList.length - 1 && styles.moveBtnDisabled,
                    ]}
                  >
                    <Ionicons name="chevron-down" size={18} color="#fff" />
                  </Pressable>
                </View>
                <Text style={styles.queueIndex}>{index + 1}</Text>
                <Image source={{ uri: item.artworkUrl }} style={styles.queueArt} />
                <View style={styles.queueMeta}>
                  <Text
                    style={[styles.queueName, activeRow && styles.queueNameActive]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.queueArtist} numberOfLines={1}>
                    {item.artist}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          key={`grid-${libraryTab}`}
          style={styles.libraryFlex}
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={styles.gridRow}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={listPad}
          ListHeaderComponent={
            <>
              {listChrome}
              {libraryTab === 'pinned' ? (
                <Text style={styles.editHint}>
                  แท็บนี้เล่นเฉพาะคิวปักหมุด · กด「จัดคิว」เพื่อเรียงลำดับ
                </Text>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>ไม่พบเพลง</Text>
              <Text style={styles.emptySub}>
                {libraryTab === 'pinned'
                  ? 'ยังไม่มีเพลงปักหมุด — กดค้างรายการ หรือ ⋮ เพื่อปักหมุด'
                  : libraryTab === 'history'
                    ? 'ยังไม่มีประวัติชม — เล่นเกิน 3 วิ แล้วจะขึ้นที่นี่แบบ TikTok'
                    : libraryTab === 'frequent'
                      ? 'ยังไม่มีสถิติเล่นบ่อย — เล่นซ้ำแล้วจะเรียงที่นี่'
                      : 'ลองพิมพ์ชื่อ / แนวเพลง (ชิลล์ โลฟาย โฟกัส)'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) =>
            renderTrackTile(item, index, { showPinBadge: libraryTab === 'pinned' })
          }
        />
      )}

      {ENABLE_MUSIC_UPLOAD ? (
        <MusicUploadSheet visible={uploadOpen} onClose={() => setUploadOpen(false)} />
      ) : null}

      <MusicYoutubeMenu
        visible={!!menuTrack || settingsMenuOpen}
        title={menuTrack?.title ?? 'รายการเพลง'}
        subtitle={
          menuTrack
            ? menuTrack.artist
            : 'เลือกโหมดการแสดงคลัง · ทั้งหมด / ปักหมุด / เล่นบ่อย'
        }
        trackActions={
          menuTrack
            ? { pinned: isPinned(menuTrack.id), loaded: isLoaded(menuTrack.id) }
            : null
        }
        activeLibraryTab={libraryTab}
        onClose={() => {
          setMenuTrack(null);
          setSettingsMenuOpen(false);
        }}
        onAction={(action) => handleYoutubeMenuAction(action, menuTrack)}
      />
    </View>
  );

  function renderTrackTile(
    item: MusicTrack,
    index: number,
    opts: { showPinBadge: boolean },
  ) {
    const activeRow = item.id === active.id;
    const loaded = isLoaded(item.id);
    const views = totalViewsFn(item.id);
    const watched = historyTracks.find((h) => h.track.id === item.id);
    const isRightCol = index % GRID_COLS === GRID_COLS - 1;
    return (
      <Pressable
        style={[
          styles.tile,
          { width: tileW, height: tileH, marginRight: isRightCol ? 0 : GRID_GAP },
          activeRow && styles.tileActive,
        ]}
        onPress={() => onPlayItem(item)}
        onLongPress={() => showTrackMenu(item)}
        delayLongPress={380}
      >
        <Image source={{ uri: item.artworkUrl }} style={styles.tileArt} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.82)']}
          style={styles.tileFade}
        />

        <View style={styles.tileViews}>
          <Ionicons name="play" size={9} color="#fff" />
          <Text style={styles.tileViewsText}>{formatViewsLabel(views)}</Text>
        </View>

        {opts.showPinBadge ? (
          <View style={styles.tilePin}>
            <Text style={styles.tilePinText}>📌</Text>
          </View>
        ) : activeRow && playing ? (
          <View style={styles.tilePlaying}>
            <Ionicons name="musical-notes" size={14} color={colors.brand.primary} />
          </View>
        ) : item.mediaKind === 'video' ? (
          <View style={styles.tileKind}>
            <Ionicons name="videocam" size={11} color="#fff" />
          </View>
        ) : null}

        <Pressable
          hitSlop={8}
          onPress={() => showTrackMenu(item)}
          style={styles.tileMenu}
          accessibilityLabel="เมนูเพลง"
        >
          {loadingId === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="ellipsis-vertical" size={16} color="#fff" />
          )}
        </Pressable>

        <View style={styles.tileCaption}>
          <Text style={[styles.tileTitle, activeRow && styles.tileTitleActive]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.tileMeta} numberOfLines={1}>
            {libraryTab === 'history' && watched
              ? formatWatchAgo(watched.at)
              : formatTrackTime(item.durationHintSec)}
            {loaded ? ' · 💾' : ''}
          </Text>
        </View>
      </Pressable>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A1611' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsGear: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2B6CB0',
    marginRight: 2,
  },
  topCenter: { flex: 1, alignItems: 'center' },
  topEyebrow: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  topHint: {
    color: colors.brand.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  stage: {
    marginHorizontal: 0,
    width: '100%',
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  stageArt: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  chromeOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 4,
    backgroundColor: 'rgba(8,18,14,0.55)',
  },
  librarySheet: {
    marginTop: 0,
    backgroundColor: '#0E1C16',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(0,214,143,0.22)',
  },
  libraryGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 6,
  },
  flashBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    minWidth: 88,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  flashLeft: {
    alignSelf: 'flex-start',
    left: 28,
  },
  flashRight: {
    alignSelf: 'flex-end',
    right: 28,
  },
  flashText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  pausedHint: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 2,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  artist: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  seekBlock: { paddingHorizontal: 12, marginTop: 2 },
  slider: { width: '100%', height: 28 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
  },
  time: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  searchRow: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    padding: 0,
  },
  libraryFlex: { flex: 1 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  queueTitle: { color: '#fff', fontWeight: '900', fontSize: 14, flex: 1 },
  uploadLink: { color: colors.brand.primary, fontWeight: '900', fontSize: 13 },
  queueEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,214,143,0.45)',
    backgroundColor: 'rgba(0,214,143,0.1)',
  },
  queueEditBtnOn: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  queueEditText: { color: colors.brand.primary, fontWeight: '900', fontSize: 12 },
  queueEditTextOn: { color: colors.brand.ink },
  editHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingBottom: 8,
    lineHeight: 16,
  },
  moveCol: { gap: 2, marginRight: 2 },
  moveBtn: {
    width: 28,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  moveBtnDisabled: { opacity: 0.25 },
  empty: { alignItems: 'center', paddingVertical: 36, gap: 6, paddingHorizontal: 12 },
  emptyTitle: { color: '#fff', fontWeight: '800' },
  emptySub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, textAlign: 'center' },
  gridRow: {
    flexDirection: 'row',
    marginBottom: GRID_GAP,
  },
  tile: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1A2A22',
  },
  tileActive: {
    borderWidth: 2,
    borderColor: colors.brand.primary,
  },
  tileArt: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  tileFade: {
    ...StyleSheet.absoluteFill,
  },
  tileCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 28,
    gap: 2,
  },
  tileTitle: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  tileTitleActive: { color: colors.brand.primary },
  tileMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '700',
  },
  tileMenu: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tileViews: {
    position: 'absolute',
    left: 8,
    bottom: 44,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  tileViewsText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  tilePin: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
  },
  tilePinText: { fontSize: 13 },
  tileKind: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tilePlaying: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  queueRowActive: { backgroundColor: 'rgba(0,214,143,0.12)' },
  queueIndex: {
    width: 20,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
  queueArt: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#333' },
  queueMeta: { flex: 1, gap: 2 },
  queueName: { color: 'rgba(255,255,255,0.9)', fontWeight: '700', fontSize: 13 },
  queueNameActive: { color: colors.brand.primary },
  queueArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' },
});
