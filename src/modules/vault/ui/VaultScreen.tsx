import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { LockScreen } from './LockScreen';
import { colors } from '@/shared/theme/colors';

export function VaultScreen() {
  const insets = useSafeAreaInsets();
  const unlocked = useVaultStore((s) => s.unlocked);
  const items = useVaultStore((s) => s.items);
  const vehicles = useVaultStore((s) => s.vehicles);
  const lock = useVaultStore((s) => s.lock);

  if (!unlocked) return <LockScreen />;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text.inverse} />
        </Pressable>
        <Text style={styles.title}>Boom Vault</Text>
        <Pressable onPress={lock}>
          <Text style={styles.lock}>ล็อก</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>Secure Secret Vault</Text>
        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.kind}>{item.kind}</Text>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemSub}>{item.subtitle}</Text>
          </View>
        ))}

        <Text style={[styles.section, { marginTop: 18 }]}>Knowledge & Vehicle History</Text>
        {vehicles.map((v) => (
          <View key={v.id} style={styles.vehicle}>
            <Text style={styles.vehicleModel}>{v.model}</Text>
            <Text style={styles.vehicleMeta}>{v.plate}</Text>
            <Text style={styles.vehicleSpec}>{v.batterySpec}</Text>
            <Text style={styles.vehicleNotes}>{v.notes}</Text>
            <Text style={styles.vehicleService}>บริการล่าสุด: {v.lastService}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.ink,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  title: {
    color: colors.accent.vault,
    fontWeight: '900',
    fontSize: 18,
  },
  lock: {
    color: colors.brand.primary,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    color: colors.text.onDark,
    fontWeight: '800',
    marginBottom: 10,
  },
  item: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.25)',
  },
  kind: {
    color: colors.accent.vault,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  itemTitle: {
    color: colors.text.inverse,
    fontWeight: '800',
    marginTop: 4,
  },
  itemSub: {
    color: colors.text.muted,
    marginTop: 2,
  },
  vehicle: {
    backgroundColor: 'rgba(0,214,143,0.08)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,214,143,0.25)',
  },
  vehicleModel: {
    color: colors.text.inverse,
    fontWeight: '900',
  },
  vehicleMeta: {
    color: colors.text.muted,
    marginTop: 2,
  },
  vehicleSpec: {
    color: colors.brand.primary,
    marginTop: 6,
    fontWeight: '700',
  },
  vehicleNotes: {
    color: colors.text.onDark,
    marginTop: 6,
  },
  vehicleService: {
    color: colors.text.muted,
    marginTop: 6,
    fontSize: 12,
  },
});
