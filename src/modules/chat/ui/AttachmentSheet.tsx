import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';
import { ENABLE_CALLS } from '@/shared/compliance/appStoreGates';

export type AttachmentAction =
  | 'camera'
  | 'gallery'
  | 'file'
  | 'reply'
  | 'location'
  | 'coupon'
  | 'order'
  | 'call';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: AttachmentAction) => void;
};

const SPRING = { damping: 22, stiffness: 280, mass: 0.7 };
const PANEL_HEIGHT = 208;

const ALL_ACTIONS: Array<{
  key: AttachmentAction;
  emoji: string;
  label: string;
  iconBg: string;
}> = [
  { key: 'camera', emoji: '📸', label: 'กล้อง', iconBg: '#E8F1FF' },
  { key: 'gallery', emoji: '🖼️', label: 'รูป & วิดีโอ', iconBg: '#EAF8F1' },
  { key: 'reply', emoji: '💬', label: 'ข้อความตอบกลับ', iconBg: '#F0ECFF' },
  { key: 'coupon', emoji: '🏷️', label: 'คูปอง', iconBg: '#FFF7E0' },
  { key: 'order', emoji: '🛒', label: 'Order', iconBg: '#E8F7F0' },
  { key: 'call', emoji: '📞', label: 'คำขอการโทร', iconBg: '#EAF3FF' },
];

/** Hide unfinished attachment types (file/location) and gated calls — App Store 2.1 */
function visibleActions() {
  return ALL_ACTIONS.filter((a) => {
    if (a.key === 'call') return ENABLE_CALLS;
    return true;
  });
}

/**
 * LINE OA–style attachment panel — expands below the composer with iOS spring
 * physics, safe-area padding, and a soft glass surface.
 */
export function AttachmentSheet({ visible, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = visible
      ? withSpring(1, SPRING)
      : withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [visible, progress]);

  const panelStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, PANEL_HEIGHT + Math.max(insets.bottom, 10)]),
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 1, 1]),
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [24, 0]) }],
  }));

  return (
    <Animated.View style={[styles.panel, panelStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <BlurView intensity={42} tint="light" style={styles.blur}>
        <Animated.View style={contentStyle}>
          <View style={styles.header}>
            <View style={styles.grabber} />
            <Pressable
              style={styles.closeBtn}
              hitSlop={10}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              accessibilityLabel="ปิดแผงส่งสื่อ"
            >
              <Ionicons name="close" size={16} color={colors.text.secondary} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {visibleActions().map((item) => (
              <Pressable
                key={item.key}
                style={styles.cell}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(item.key);
                }}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
                  <Text style={styles.emoji}>{item.emoji}</Text>
                </View>
                <Text style={styles.label} numberOfLines={2}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: 'hidden',
    backgroundColor: colors.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  blur: {
    flex: 1,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  header: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
  },
  closeBtn: {
    position: 'absolute',
    right: 2,
    top: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10, 22, 17, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 5,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 23,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 13,
    paddingHorizontal: 2,
  },
});
