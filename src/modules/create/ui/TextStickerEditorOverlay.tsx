import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { TextOverlayStyleToolbar } from './TextOverlayStyleToolbar';

type Props = {
  visible: boolean;
  text: string;
  color: string;
  backgroundOpacity: number;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  fontLabel: string;
  locked: boolean;
  onTextChange: (value: string) => void;
  onCycleColor: () => void;
  onCycleBackgroundColor: () => void;
  onCycleBackgroundOpacity: () => void;
  onCycleStroke: () => void;
  onCycleFont: () => void;
  onToggleLock: () => void;
  /** กดเสร็จสิ้น / แตะพื้นหลัง → ปิดคีย์บอร์ด + ล็อกเป็นโหมด Sticker */
  onDone: () => void;
};

/**
 * ตัวพิมพ์ข้อความ (Text Sticker Editor) — แตะพื้นหลัง 1 ครั้ง
 * → ปิดคีย์บอร์ดทันที + ล็อกเป็นโหมด Sticker (พร้อมลาก/บีบ/หมุน)
 */
export function TextStickerEditorOverlay({
  visible,
  text,
  color,
  backgroundOpacity,
  backgroundColor,
  strokeColor,
  strokeWidth,
  fontLabel,
  locked,
  onTextChange,
  onCycleColor,
  onCycleBackgroundColor,
  onCycleBackgroundOpacity,
  onCycleStroke,
  onCycleFont,
  onToggleLock,
  onDone,
}: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const finish = () => {
    Keyboard.dismiss();
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onDone();
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Visual dimmer only. A full-screen Pressable here used to own both touch
          pointers before TextStickerLayer could recognize pinch/rotation. Blank
          taps are handled by TextStickerLayer so the live OverlayObject remains
          directly interactive while the keyboard is open. */}
      <View pointerEvents="none" style={styles.backdrop} />

      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]} pointerEvents="box-none">
        <TextOverlayStyleToolbar
          color={color}
          backgroundOpacity={backgroundOpacity}
          backgroundColor={backgroundColor}
          strokeColor={strokeColor}
          strokeWidth={strokeWidth}
          fontLabel={fontLabel}
          locked={locked}
          onCycleColor={onCycleColor}
          onCycleBackgroundColor={onCycleBackgroundColor}
          onCycleBackgroundOpacity={onCycleBackgroundOpacity}
          onCycleStroke={onCycleStroke}
          onCycleFont={onCycleFont}
          onToggleLock={onToggleLock}
          onDone={finish}
        />
      </View>

      {/* Keyboard controller only. The visible text is always the same OverlayObject
          rendered by TextStickerLayer, so editing never creates a second label. */}
      <TextInput
        ref={inputRef}
        style={styles.keyboardInput}
        value={text}
        onChangeText={onTextChange}
        autoFocus
        maxLength={120}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={finish}
        accessibilityLabel="แก้ไขข้อความบนสื่อ"
      />

      <Text style={[styles.hint, { bottom: Math.max(insets.bottom, 12) + 56 }]}>
        แตะพื้นหลังหรือกดเสร็จสิ้น · แล้วลากย้าย / บีบย่อ-ขยายได้
      </Text>

    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.38)',
    zIndex: 1,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  keyboardInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: 0,
    top: 0,
  },
  hint: {
    position: 'absolute',
    left: 20,
    right: 20,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    zIndex: 3,
  },
});
