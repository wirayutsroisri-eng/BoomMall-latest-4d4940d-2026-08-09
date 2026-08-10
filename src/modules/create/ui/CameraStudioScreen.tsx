import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@/shared/theme/colors';

type ClipMode = '60s' | '15s' | 'photo' | 'live';

const MODES: Array<{ key: ClipMode; label: string }> = [
  { key: '60s', label: '60s' },
  { key: '15s', label: '15s' },
  { key: 'photo', label: 'ภาพถ่าย' },
  { key: 'live', label: 'ไลฟ์' },
];

function formatTimer(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
  return `${m}:${s}`;
}

export function CameraStudioScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<ClipMode>('15s');
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulse = useSharedValue(1);

  useEffect(() => {
    if (recording) {
      pulse.value = withRepeat(
        withSequence(withTiming(1.12, { duration: 500 }), withTiming(1, { duration: 500 })),
        -1,
        false,
      );
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      pulse.value = withTiming(1, { duration: 150 });
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const onPressShutter = () => {
    if (mode === 'live') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('LIVE', 'กำลังเริ่มไลฟ์สด Boom EV Shop Chanthaburi...');
      return;
    }
    if (mode === 'photo') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      router.push('/create-details');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (recording) {
      setRecording(false);
      router.push('/create-details');
    } else {
      setRecording(true);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1a1a1a', '#000000', '#050505']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.gridLine} />
      <View style={[styles.gridLineV, { left: '33%' }]} />
      <View style={[styles.gridLineV, { left: '66%' }]} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        <Pressable
          style={styles.soundPill}
          onPress={() => Alert.alert('เลือกเพลง', 'ค้นหาเสียง/เพลงประกอบคลิป')}
        >
          <Ionicons name="musical-notes" size={14} color="#fff" />
          <Text style={styles.soundPillText}>เพิ่มเสียง</Text>
        </Pressable>

        <Pressable
          style={styles.iconBtn}
          onPress={() => setFlash((f) => !f)}
          hitSlop={8}
        >
          <Ionicons name={flash ? 'flash' : 'flash-off'} size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.rightRail}>
        <RailButton
          icon="camera-reverse-outline"
          label="สลับกล้อง"
          onPress={() => {
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
            void Haptics.selectionAsync();
          }}
        />
        <RailButton icon="color-filter-outline" label="ฟิลเตอร์" onPress={() => Alert.alert('ฟิลเตอร์', 'เลือกโทนสีคลิป')} />
        <RailButton icon="sparkles-outline" label="เอฟเฟกต์" onPress={() => Alert.alert('เอฟเฟกต์', 'เพิ่มเอฟเฟกต์พิเศษ')} />
        <RailButton icon="speedometer-outline" label="ความเร็ว" onPress={() => Alert.alert('ความเร็ว', 'ปรับความเร็วคลิป 0.3x–3x')} />
        <RailButton icon="timer-outline" label="ตั้งเวลา" onPress={() => Alert.alert('ตั้งเวลา', 'ตั้งเวลานับถอยหลังก่อนอัด')} />
      </View>

      {recording ? (
        <View style={[styles.timerPill, { top: insets.top + 56 }]}>
          <View style={styles.timerDot} />
          <Text style={styles.timerText}>{formatTimer(seconds)}</Text>
        </View>
      ) : (
        <View style={[styles.facingPill, { top: insets.top + 56 }]}>
          <Text style={styles.facingText}>{facing === 'back' ? 'กล้องหลัง' : 'กล้องหน้า'}</Text>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 18) }]}>
        <View style={styles.modes}>
          {MODES.map((m) => {
            const active = m.key === mode;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  setMode(m.key);
                  void Haptics.selectionAsync();
                }}
                style={styles.modeItem}
              >
                <Text style={[styles.modeText, active && styles.modeTextActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.shutterRow}>
          <Pressable
            style={styles.uploadBtn}
            onPress={() => router.push('/create-details')}
          >
            <View style={styles.uploadThumb} />
          </Pressable>

          <Pressable onPress={onPressShutter} hitSlop={10}>
            <Animated.View
              style={[
                styles.shutterRing,
                mode === 'live' && styles.shutterRingLive,
                pulseStyle,
              ]}
            >
              <View
                style={[
                  styles.shutterCore,
                  recording && styles.shutterCoreRecording,
                  mode === 'photo' && styles.shutterCorePhoto,
                ]}
              />
            </Animated.View>
          </Pressable>

          <Pressable
            style={styles.effectsBtn}
            onPress={() => Alert.alert('เทมเพลต', 'เลือกเทมเพลตคลิปสำเร็จรูป')}
          >
            <Ionicons name="apps-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RailButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.railBtn} onPress={onPress} hitSlop={4}>
      <Ionicons name={icon} size={25} color="#fff" style={styles.railIconShadow} />
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '33%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  soundPillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  rightRail: {
    position: 'absolute',
    right: 14,
    top: '18%',
    alignItems: 'center',
    gap: 22,
  },
  railBtn: {
    alignItems: 'center',
    gap: 4,
  },
  railIconShadow: {
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 4,
  },
  railLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  timerPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  timerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.live,
  },
  timerText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  facingPill: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  facingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
  },
  modes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
    marginBottom: 22,
  },
  modeItem: {
    paddingVertical: 4,
  },
  modeText: {
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '700',
    fontSize: 13,
  },
  modeTextActive: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  uploadBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.brand.forest,
  },
  shutterRing: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRingLive: {
    borderColor: colors.accent.live,
  },
  shutterCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent.live,
  },
  shutterCoreRecording: {
    width: 30,
    height: 30,
    borderRadius: 8,
  },
  shutterCorePhoto: {
    backgroundColor: '#fff',
  },
  effectsBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
