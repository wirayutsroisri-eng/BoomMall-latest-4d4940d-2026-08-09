import React, { useEffect } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useMusicPlayerStore } from '../state/music-player-store';
import { openListenScreenNow } from '@/shared/navigation/safeNavigate';
import { colors } from '@/shared/theme/colors';

/**
 * YouTube-style mini player — stays above tab bar while music continues
 * (including when the screen is locked / app backgrounded).
 */
export function MusicMiniPlayer() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const track = useMusicPlayerStore((s) => s.track);
  const playing = useMusicPlayerStore((s) => s.playing);
  const miniVisible = useMusicPlayerStore((s) => s.miniVisible);
  const expanded = useMusicPlayerStore((s) => s.expanded);
  const toggle = useMusicPlayerStore((s) => s.toggle);
  const next = useMusicPlayerStore((s) => s.next);
  const dismiss = useMusicPlayerStore((s) => s.dismiss);
  const expand = useMusicPlayerStore((s) => s.expand);

  const onListenRoute = pathname?.includes('/listen');

  useEffect(() => {
    // Keep session wired; status listener already attached in store.
  }, []);

  if (!track || !miniVisible || expanded || onListenRoute) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 8) + 56 }]}
    >
      <Pressable
        style={styles.card}
        onPress={() => {
          void Haptics.selectionAsync();
          expand();
          openListenScreenNow();
        }}
      >
        <Image source={{ uri: track.artworkUrl }} style={styles.art} />
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
            {track.mediaKind === 'video' ? ' · วิดีโอเพลง' : ''} · ปิดจอได้
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e?.stopPropagation?.();
            void Haptics.selectionAsync();
            toggle();
          }}
          style={styles.iconBtn}
        >
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={22}
            color={colors.text.inverse}
          />
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e?.stopPropagation?.();
            void Haptics.selectionAsync();
            void next();
          }}
          style={styles.iconBtn}
        >
          <Ionicons name="play-skip-forward" size={20} color={colors.text.inverse} />
        </Pressable>
        <Pressable
          hitSlop={10}
          onPress={(e) => {
            e?.stopPropagation?.();
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            dismiss();
          }}
          style={styles.closeBtn}
          accessibilityLabel="ปิดทันที"
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 90,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A2420',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  art: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text.inverse,
    fontWeight: '800',
    fontSize: 13,
  },
  artist: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '600',
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,80,80,0.35)',
  },
});
