/**
 * Form text field with reliable paste on iOS / web.
 *
 * iOS often shows AutoFill instead of Paste. Keep the system menu, turn off
 * autofill, and always offer วาง on the keyboard accessory while focused.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  InputAccessoryView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { colors } from '@/shared/theme/colors';

type Props = Omit<TextInputProps, 'onChangeText' | 'value'> & {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  containerStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function FormTextInput({
  value,
  onChangeText,
  label,
  containerStyle,
  labelStyle,
  onFocus,
  onBlur,
  onSelectionChange,
  style,
  multiline,
  autoCorrect,
  ...rest
}: Props) {
  const accessoryId = useId().replace(/:/g, '');
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [canPaste, setCanPaste] = useState(false);
  const selectionRef = useRef({ start: value.length, end: value.length });

  const refreshClipboard = useCallback(async () => {
    try {
      setCanPaste(await Clipboard.hasStringAsync());
    } catch {
      setCanPaste(false);
    }
  }, []);

  useEffect(() => {
    if (!focused) return;
    void refreshClipboard();
    const sub = Clipboard.addClipboardListener(() => {
      void refreshClipboard();
    });
    return () => Clipboard.removeClipboardListener(sub);
  }, [focused, refreshClipboard]);

  const insertClipboard = useCallback(async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (!clip) {
        setCanPaste(false);
        return;
      }
      const { start, end } = selectionRef.current;
      const safeStart = Math.min(Math.max(0, start), value.length);
      const safeEnd = Math.min(Math.max(end, safeStart), value.length);
      const next = value.slice(0, safeStart) + clip + value.slice(safeEnd);
      const caret = safeStart + clip.length;
      onChangeText(next);
      selectionRef.current = { start: caret, end: caret };
      requestAnimationFrame(() => {
        inputRef.current?.setNativeProps?.({
          selection: { start: caret, end: caret },
        });
      });
      setCanPaste(true);
    } catch {
      setCanPaste(false);
    }
  }, [onChangeText, value]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !focused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'v') return;
      e.preventDefault();
      void insertClipboard();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [focused, insertClipboard]);

  const showAccessory = Platform.OS === 'ios' && focused;

  return (
    <View style={containerStyle}>
      {label ? <Text style={[styles.label, labelStyle]}>{label}</Text> : null}
      <TextInput
        ref={inputRef}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        style={style}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : rest.textAlignVertical}
        contextMenuHidden={false}
        textContentType="none"
        autoComplete="off"
        importantForAutofill="no"
        spellCheck={false}
        autoCorrect={autoCorrect ?? false}
        inputAccessoryViewID={showAccessory ? accessoryId : undefined}
        onSelectionChange={(e) => {
          selectionRef.current = e.nativeEvent.selection;
          onSelectionChange?.(e);
        }}
        onFocus={(e) => {
          setFocused(true);
          selectionRef.current = { start: value.length, end: value.length };
          void refreshClipboard();
          onFocus?.(e);
        }}
        onPressIn={() => {
          void refreshClipboard();
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        // @ts-expect-error RN web supports onPaste
        onPaste={(e: { preventDefault?: () => void; clipboardData?: DataTransfer | null }) => {
          if (Platform.OS !== 'web') return;
          e.preventDefault?.();
          const text = e.clipboardData?.getData('text/plain');
          if (text != null) {
            const { start, end } = selectionRef.current;
            onChangeText(value.slice(0, start) + text + value.slice(end));
          } else {
            void insertClipboard();
          }
        }}
      />

      {showAccessory ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessory}>
            <Text style={styles.accessoryHint}>คลิปบอร์ดพร้อมวาง</Text>
            <Pressable onPress={() => void insertClipboard()} style={styles.accessoryBtn} hitSlop={8}>
              <Text style={styles.accessoryBtnText}>วาง</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text.secondary,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 6,
  },
  accessory: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F2F2F7',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
  },
  accessoryHint: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  accessoryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.brand.primaryDark,
  },
  accessoryBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
});
