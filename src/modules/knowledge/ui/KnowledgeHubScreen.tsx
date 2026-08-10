import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useKnowledgeStore } from '@/modules/knowledge/state/knowledge-store';
import { colors } from '@/shared/theme/colors';

export function KnowledgeHubScreen() {
  const insets = useSafeAreaInsets();
  const ready = useKnowledgeStore((s) => s.ready);
  const articles = useKnowledgeStore((s) => s.articles);
  const vehicles = useKnowledgeStore((s) => s.vehicles);
  const hydrate = useKnowledgeStore((s) => s.hydrate);
  const toggleOffline = useKnowledgeStore((s) => s.toggleOffline);

  useEffect(() => {
    if (!ready) void hydrate();
  }, [hydrate, ready]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.title}>EV Knowledge Hub</Text>
        <View style={{ width: 26 }} />
      </View>
      <Text style={styles.subtitle}>Offline-First SQLite · ลบแอปไม่ลงเพราะคลังวิชายังอยู่ในเครื่อง</Text>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>บันทึกประจำรถ</Text>
        {vehicles.map((v) => (
          <View key={v.id} style={styles.card}>
            <Text style={styles.cardTitle}>{v.model}</Text>
            <Text style={styles.meta}>{v.plate}</Text>
            <Text style={styles.spec}>{v.batterySpec}</Text>
            <Text style={styles.body}>{v.notes}</Text>
            <Text style={styles.diagram}>⚡ {v.wiringDiagramNote}</Text>
            <Text style={styles.meta}>บริการล่าสุด: {v.lastService}</Text>
          </View>
        ))}

        <Text style={[styles.section, { marginTop: 16 }]}>บทความเทคนิค (เซฟออฟไลน์)</Text>
        {articles.map((a) => (
          <View key={a.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.category}>{a.category}</Text>
              <Pressable onPress={() => void toggleOffline(a.id)}>
                <Text style={styles.offlineToggle}>
                  {a.savedOffline ? '✓ Offline' : 'เซฟ Offline'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.cardTitle}>{a.title}</Text>
            <Text style={styles.body}>{a.summary}</Text>
            <Text style={styles.detail}>{a.body}</Text>
          </View>
        ))}
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
    paddingHorizontal: 14,
  },
  title: { fontWeight: '900', fontSize: 18, color: colors.text.primary },
  subtitle: {
    color: colors.text.secondary,
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    fontSize: 12,
  },
  content: { padding: 16, paddingBottom: 40 },
  section: { fontWeight: '800', color: colors.text.primary, marginBottom: 8 },
  card: {
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  category: {
    color: colors.brand.primaryDark,
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  offlineToggle: { color: colors.brand.primaryDark, fontWeight: '800', fontSize: 12 },
  cardTitle: { fontWeight: '900', color: colors.text.primary, fontSize: 15 },
  meta: { color: colors.text.muted, marginTop: 4, fontSize: 12 },
  spec: { color: colors.brand.primaryDark, fontWeight: '700', marginTop: 6 },
  body: { color: colors.text.secondary, marginTop: 6, lineHeight: 20 },
  detail: { color: colors.text.primary, marginTop: 8, lineHeight: 20, fontSize: 13 },
  diagram: {
    marginTop: 8,
    color: colors.text.primary,
    backgroundColor: colors.brand.mist,
    padding: 8,
    borderRadius: 10,
    overflow: 'hidden',
    fontSize: 12,
    lineHeight: 18,
  },
});
