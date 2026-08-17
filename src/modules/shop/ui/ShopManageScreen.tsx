import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ShopModulePanel } from './ShopModulePanel';
import { colors } from '@/shared/theme/colors';

/** หน้าเต็มเมื่อเปิดจากดีปลิงก์ — โมดูลจริงเกาะที่แท็บร้านในโปรไฟล์ */
export function ShopManageScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>โมดูลร้านค้า</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <ShopModulePanel />
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
});
