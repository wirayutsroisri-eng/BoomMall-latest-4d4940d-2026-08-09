import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FormTextInput } from '@/shared/components/FormTextInput';
import { colors } from '@/shared/theme/colors';
import { newSpecDraft, type SpecDraft } from '@/modules/commerce/domain/product-specs';

type Props = {
  title?: string;
  hint?: string;
  rows: SpecDraft[];
  onChange: (rows: SpecDraft[]) => void;
  editable?: boolean;
  compact?: boolean;
};

export function SpecRowsEditor({
  title,
  hint,
  rows,
  onChange,
  editable = true,
  compact = false,
}: Props) {
  const list = rows.length ? rows : [newSpecDraft()];

  const patch = (id: string, next: Partial<SpecDraft>) => {
    onChange(list.map((row) => (row.id === id ? { ...row, ...next } : row)));
  };

  const remove = (id: string) => {
    const next = list.filter((row) => row.id !== id);
    onChange(next.length ? next : [newSpecDraft()]);
  };

  return (
    <View>
      {title ? <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text> : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {list.map((row) => (
        <View key={row.id} style={styles.row}>
          <FormTextInput
            style={styles.input}
            value={row.label}
            onChangeText={(t) => patch(row.id, { label: t })}
            placeholder="ชื่อ เช่น แรงดัน"
            placeholderTextColor={colors.text.muted}
            editable={editable}
            containerStyle={styles.cell}
          />
          <FormTextInput
            style={styles.input}
            value={row.value}
            onChangeText={(t) => patch(row.id, { value: t })}
            placeholder="พิมพ์เอง เช่น 48V"
            placeholderTextColor={colors.text.muted}
            editable={editable}
            containerStyle={styles.cell}
          />
          {editable ? (
            <Pressable
              style={styles.remove}
              onPress={() => {
                Alert.alert('ลบสเปกนี้?', 'แถวสเปกจะถูกนำออก', [
                  { text: 'ยกเลิก', style: 'cancel' },
                  { text: 'ลบ', style: 'destructive', onPress: () => remove(row.id) },
                ]);
              }}
              hitSlop={8}
              accessibilityLabel="ลบสเปก"
            >
              <Ionicons name="close" size={16} color={colors.text.muted} />
            </Pressable>
          ) : (
            <View style={styles.remove} />
          )}
        </View>
      ))}
      {editable ? (
        <Pressable
          style={styles.add}
          onPress={() => onChange([...list, newSpecDraft()])}
        >
          <Ionicons name="add" size={16} color={colors.brand.primaryDark} />
          <Text style={styles.addText}>เพิ่มสเปก</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 6,
  },
  titleCompact: { marginTop: 10 },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
    marginBottom: 8,
    lineHeight: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  cell: { flex: 1, marginBottom: 0 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    fontSize: 14,
  },
  remove: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
  },
  addText: { fontSize: 13, fontWeight: '800', color: colors.brand.primaryDark },
});
