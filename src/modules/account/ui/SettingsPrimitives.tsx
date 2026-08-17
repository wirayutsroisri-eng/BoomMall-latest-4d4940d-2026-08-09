import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';

export function SettingsSection({ title, first }: { title: string; first?: boolean }) {
  return <Text style={[styles.section, first && styles.sectionFirst]}>{title}</Text>;
}

export function SettingsRow({
  icon,
  title,
  subtitle,
  onPress,
  trailing,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  danger?: boolean;
}) {
  const inner = (
    <>
      <View style={[styles.iconWrap, danger && styles.iconWrapDanger]}>
        <Ionicons name={icon} size={18} color={danger ? colors.brand.pink : colors.text.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger && styles.rowTitleDanger]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      {trailing ??
        (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.text.muted} /> : null)}
    </>
  );

  if (onPress) {
    return (
      <Pressable style={styles.row} onPress={onPress}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.row}>{inner}</View>;
}

const styles = StyleSheet.create({
  section: {
    fontWeight: '800',
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 8,
    marginTop: 22,
    letterSpacing: 0.2,
  },
  sectionFirst: { marginTop: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 8,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.canvas,
  },
  iconWrapDanger: {
    backgroundColor: 'rgba(254,44,85,0.1)',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontWeight: '800', color: colors.text.primary, fontSize: 15 },
  rowTitleDanger: { color: colors.brand.pink },
  rowSub: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
});
