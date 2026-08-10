import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCallStore } from '@/modules/chat/state/call-store';
import { CallActionBar } from './CallActionBar';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';

export function CallOverlay() {
  const mode = useCallStore((s) => s.mode);
  const type = useCallStore((s) => s.type);
  const peerName = useCallStore((s) => s.peerName);

  if (mode === 'idle' || mode === 'ended') return null;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={styles.overlay}
    >
      <View style={styles.center}>
        <Text style={styles.badge}>WebRTC HD · Enterprise Ready</Text>
        <Avatar initial={peerName?.slice(0, 1) ?? '?'} size={96} radius={26} textStyle={styles.avatarText} />
        <Text style={styles.name}>{peerName}</Text>
        <Text style={styles.status}>
          {mode === 'connecting'
            ? `กำลังเชื่อมต่อ${type === 'video' ? 'วิดีโอ' : 'เสียง'}...`
            : type === 'video'
              ? 'วิดีโอคอล HD · สายหลุดยาก'
              : 'วอยซ์คอล · เสียงคมชัด'}
        </Text>
      </View>
      <CallActionBar />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.surface.overlay,
    justifyContent: 'space-between',
    paddingTop: 120,
    zIndex: 100,
  },
  center: {
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    color: colors.brand.primary,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 8,
  },
  avatarText: {
    fontSize: 36,
  },
  name: {
    color: colors.text.inverse,
    fontSize: 24,
    fontWeight: '900',
  },
  status: {
    color: 'rgba(255,255,255,0.7)',
  },
});
