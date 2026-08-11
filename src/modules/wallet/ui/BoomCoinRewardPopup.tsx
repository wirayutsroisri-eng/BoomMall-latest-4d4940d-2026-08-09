import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useBoomTreeStore } from '../state/boom-tree-store';
import { colors } from '@/shared/theme/colors';

/**
 * Soft toast popup — not full-screen modal content chrome.
 * Coalesces multiple rewards into one +N display.
 */
export function BoomCoinRewardPopup() {
  const popup = useBoomTreeStore((s) => s.popup);
  const dismissPopup = useBoomTreeStore((s) => s.dismissPopup);
  const opacity = useSharedValue(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (!popup.visible) {
      opacity.value = 0;
      return;
    }
    opacity.value = withSequence(
      withTiming(1, { duration: reduceMotion ? 120 : 220 }),
      withDelay(
        2200,
        withTiming(0, { duration: reduceMotion ? 120 : 280 }, (finished) => {
          if (finished) runOnJS(dismissPopup)();
        }),
      ),
    );
  }, [popup.visible, popup.amount, reduceMotion, opacity, dismissPopup]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!popup.visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={dismissPopup}>
      <Pressable style={styles.backdrop} onPress={dismissPopup} accessibilityLabel="ปิดการแจ้งเตือนรางวัล">
        <Animated.View style={[styles.card, style]}>
          <Text style={styles.emoji}>🌳✨</Text>
          <Text style={styles.title}>{popup.message || 'ต้นไม้ของคุณออกผลแล้ว'}</Text>
          <Text style={styles.amount}>
            +{popup.amount} Boom Coin 🪙
          </Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 120,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brand.primary,
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  emoji: { fontSize: 28 },
  title: {
    marginTop: 6,
    fontWeight: '800',
    color: colors.text.primary,
    fontSize: 14,
  },
  amount: {
    marginTop: 4,
    fontWeight: '900',
    color: colors.brand.primaryDark,
    fontSize: 16,
  },
});
