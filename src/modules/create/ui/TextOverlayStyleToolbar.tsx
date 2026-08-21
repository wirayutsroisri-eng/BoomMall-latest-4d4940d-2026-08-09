import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  color: string;
  backgroundOpacity: number;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  fontLabel: string;
  locked: boolean;
  onCycleColor: () => void;
  onCycleBackgroundColor: () => void;
  onCycleBackgroundOpacity: () => void;
  onCycleStroke: () => void;
  onCycleFont: () => void;
  onToggleLock: () => void;
  onDone?: () => void;
};

/** One compact tap-to-cycle toolbar shared by typing and selected-text modes. */
export function TextOverlayStyleToolbar({
  color,
  backgroundOpacity,
  backgroundColor,
  strokeColor,
  strokeWidth,
  fontLabel,
  locked,
  onCycleColor,
  onCycleBackgroundColor,
  onCycleBackgroundOpacity,
  onCycleStroke,
  onCycleFont,
  onToggleLock,
  onDone,
}: Props) {
  return (
    <View style={styles.row} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroller}
        contentContainerStyle={styles.tools}
        keyboardShouldPersistTaps="always"
      >
        <Pressable style={styles.button} onPress={onCycleColor} hitSlop={4}>
          <View style={[styles.colorDot, { backgroundColor: color }]} />
          <Text style={styles.label}>สี</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onCycleFont} hitSlop={4}>
          <Text style={styles.glyph}>Aa</Text>
          <Text style={styles.label} numberOfLines={1}>{fontLabel}</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onCycleBackgroundColor} hitSlop={4}>
          <View style={[styles.backgroundDot, { backgroundColor }]} />
          <Text style={styles.label}>BG</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onCycleBackgroundOpacity} hitSlop={4}>
          <Text style={styles.glyph}>◐</Text>
          <Text style={styles.label}>{Math.round(backgroundOpacity * 100)}%</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={onCycleStroke} hitSlop={4}>
          <View style={[styles.strokeDot, {
            borderColor: strokeWidth > 0 ? strokeColor : 'rgba(255,255,255,0.35)',
            borderWidth: strokeWidth > 0 ? 2 : 1,
          }]} />
          <Text style={styles.label}>ขอบ</Text>
        </Pressable>
        <Pressable
          style={[styles.button, locked && styles.lockedButton]}
          onPress={onToggleLock}
          hitSlop={4}
          accessibilityLabel={locked ? 'ปลดล็อกข้อความ' : 'ล็อกข้อความ'}
        >
          <Text style={styles.glyph}>{locked ? '🔒' : '🔓'}</Text>
          <Text style={styles.label}>Lock</Text>
        </Pressable>
      </ScrollView>
      {onDone ? (
        <Pressable onPress={onDone} hitSlop={8} style={styles.doneButton}>
          <Text style={styles.done}>เสร็จสิ้น</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  scroller: { flexShrink: 1, flexGrow: 0 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 2, paddingVertical: 4 },
  button: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  lockedButton: { backgroundColor: 'rgba(254,44,85,0.72)' },
  colorDot: { width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: '#fff' },
  backgroundDot: { width: 17, height: 17, borderRadius: 5, borderWidth: 1, borderColor: '#fff' },
  strokeDot: { width: 17, height: 17, borderRadius: 9, backgroundColor: 'transparent' },
  glyph: { color: '#fff', fontSize: 14, fontWeight: '900' },
  label: { color: '#fff', fontSize: 11, fontWeight: '800', maxWidth: 48 },
  doneButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  done: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
