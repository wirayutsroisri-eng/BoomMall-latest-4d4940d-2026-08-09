import React, { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors } from '@/shared/theme/colors';

type Props = {
  value: string;
  onChange: (pin: string) => void;
  autoFocus?: boolean;
};

/** ช่อง PIN 6 หลักแบบแยกช่อง + ซ่อนตัวเลข */
export function PinSixInput({ value, onChange, autoFocus }: Props) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const setAt = (index: number, char: string) => {
    const next = digits.slice();
    next[index] = char;
    const joined = next.join('').replace(/\D/g, '').slice(0, 6);
    onChange(joined);
    if (char && index < 5) refs.current[index + 1]?.focus();
  };

  return (
    <View style={styles.row}>
      {digits.map((d, i) => (
        <Pressable key={i} onPress={() => refs.current[i]?.focus()} style={styles.cell}>
          <TextInput
            ref={(el) => {
              refs.current[i] = el;
            }}
            style={styles.input}
            value={d}
            onChangeText={(t) => {
              const last = t.replace(/\D/g, '').slice(-1);
              setAt(i, last);
            }}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digits[i] && i > 0) {
                setAt(i - 1, '');
                refs.current[i - 1]?.focus();
              }
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={1}
            textContentType="oneTimeCode"
            autoFocus={autoFocus && i === 0}
            selectTextOnFocus
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.surface.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    width: '100%',
    height: '100%',
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
  },
});
