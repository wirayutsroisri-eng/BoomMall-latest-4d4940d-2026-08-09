import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  dark?: boolean;
};

export function ContentRefreshOverlay({ visible, dark = false }: Props) {
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.layer}>
      <View style={[styles.pill, dark && styles.pillDark]}>
        <ActivityIndicator size="small" color={dark ? '#FFFFFF' : '#111714'} />
        <Text style={[styles.label, dark && styles.labelDark]}>กำลังโหลดคอนเทนต์ใหม่…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 106,
    left: 0,
    right: 0,
    zIndex: 100,
    alignItems: 'center',
  },
  pill: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pillDark: { backgroundColor: 'rgba(10,14,12,0.94)' },
  label: { color: '#111714', fontSize: 13, fontWeight: '800' },
  labelDark: { color: '#FFFFFF' },
});
