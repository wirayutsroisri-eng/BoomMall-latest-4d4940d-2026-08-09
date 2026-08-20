import React, { useEffect, useRef } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  OVERLAY_FONTS,
  cycleOverlayTextColor,
  type OverlayFontKey,
} from '@/modules/create/domain/overlayText';

type Props = {
  visible: boolean;
  text: string;
  color: string;
  fontKey: OverlayFontKey;
  onTextChange: (value: string) => void;
  onColorChange: (color: string) => void;
  onFontChange: (font: OverlayFontKey) => void;
  onDone: () => void;
};

/**
 * TikTok-style live text editor — media keeps playing underneath.
 * Tap backdrop or Done → dismiss keyboard + close overlay.
 */
export function LiveTextEditorOverlay({
  visible,
  text,
  color,
  fontKey,
  onTextChange,
  onColorChange,
  onFontChange,
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
      <Pressable style={styles.backdrop} onPress={finish} accessibilityLabel="ปิดการพิมพ์" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          style={styles.colorBtn}
          onPress={() => onColorChange(cycleOverlayTextColor(color))}
          hitSlop={8}
        >
          <View style={[styles.colorDot, { backgroundColor: color }]} />
          <Text style={styles.colorLabel}>สี</Text>
        </Pressable>
        <Pressable onPress={finish} hitSlop={10}>
          <Text style={styles.doneLink}>เสร็จสิ้น</Text>
        </Pressable>
      </View>

      <View style={styles.inputStage} pointerEvents="box-none">
      <Pressable
        style={styles.inputWrap}
        onPress={() => inputRef.current?.focus()}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            {
              color,
              fontWeight: fontKey === 'halloween' ? '400' : '900',
              fontStyle: fontKey === 'halloween' ? 'italic' : 'normal',
            },
          ]}
          placeholder="พิมพ์ข้อความ"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={text}
          onChangeText={onTextChange}
          multiline
          autoFocus
          textAlign="center"
          maxLength={120}
          selectionColor={color}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={finish}
        />
      </Pressable>
      </View>

      <Text style={[styles.hint, { bottom: Math.max(insets.bottom, 12) + 56 }]}>
        แตะพื้นหลังหรือกดเสร็จสิ้น · แล้วลากย้ายข้อความได้
      </Text>

      <View style={[styles.fontBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <Text style={styles.fontBarTitle}>สไตล์</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {OVERLAY_FONTS.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.fontChip, fontKey === f.key && styles.fontChipActive]}
              onPress={() => onFontChange(f.key)}
            >
              <Text style={[styles.fontChipText, fontKey === f.key && styles.fontChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  colorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
  },
  colorLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  doneLink: { color: '#fff', fontWeight: '900', fontSize: 16 },
  inputStage: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  inputWrap: {
    width: '100%',
    alignItems: 'center',
  },
  input: {
    width: '100%',
    minHeight: 52,
    fontSize: 36,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 2 },
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
  fontBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  fontBarTitle: { color: '#fff', fontWeight: '800', marginRight: 4 },
  fontChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  fontChipActive: { backgroundColor: '#fff' },
  fontChipText: { color: '#fff', fontWeight: '700' },
  fontChipTextActive: { color: '#111', fontWeight: '900' },
});
