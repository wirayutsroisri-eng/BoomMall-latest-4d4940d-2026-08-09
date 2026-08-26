import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';

type DeviceRow = {
  id: string;
  deviceName: string;
  lastSeenAt: string;
  approxLocation: string | null;
};

export function LoginDevicesScreen() {
  const insets = useSafeAreaInsets();
  const devices: DeviceRow[] = [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>อุปกรณ์ที่เข้าสู่ระบบ</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 48 }}>
        <Text style={styles.lead}>จัดการเครื่องที่ล็อกอินอยู่ เพิกถอนแล้วต้องเข้าสู่ระบบใหม่</Text>
        {devices.length === 0 ? (
          <Text style={styles.empty}>ยังไม่มีอุปกรณ์ที่ใช้งานอยู่</Text>
        ) : (
          devices.map((d) => (
            <View key={d.id} style={styles.card}>
              <View style={styles.iconWrap}>
                <Ionicons name="phone-portrait-outline" size={18} color={colors.text.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{d.deviceName}</Text>
                <Text style={styles.sub}>
                  ล่าสุด {new Date(d.lastSeenAt).toLocaleString('th-TH')}
                  {d.approxLocation ? ` · ${d.approxLocation}` : ''}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  lead: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
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
  name: { fontWeight: '800', color: colors.text.primary, fontSize: 15 },
  sub: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
  revokeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(254,44,85,0.12)',
  },
  revokeText: { color: colors.brand.pink, fontWeight: '800', fontSize: 12 },
  empty: { color: colors.text.muted, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 40 },
});
