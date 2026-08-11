import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';
import { safeReplace } from '@/shared/navigation/safeNavigate';

type CreateContext = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  onPress: () => void;
};

const CONTEXTS: CreateContext[] = [
  {
    key: 'content',
    title: 'ลงรูป / วิดีโอ',
    subtitle: 'คลิปฟีด · สตอรี่ · คอนเทนต์ทั่วไป',
    icon: 'camera',
    accent: '#00D68F',
    onPress: () => {
      safeReplace('/create-modal');
    },
  },
  {
    key: 'demand',
    title: 'ประกาศหางาน / หาช่าง',
    subtitle: 'เว็บบอร์ด · ให้บูมบอทจับคู่ผู้รับงาน',
    icon: 'construct-outline',
    accent: '#2E8CFF',
    onPress: () => {
      safeReplace({ pathname: '/board-create', params: { side: 'demand', locked: '1' } });
    },
  },
  {
    key: 'supply',
    title: 'รับงาน / เสนอบริการ',
    subtitle: 'บัตรรับงานบนเว็บบอร์ด · รอจับคู่',
    icon: 'briefcase-outline',
    accent: '#F5A524',
    onPress: () => {
      safeReplace({ pathname: '/board-create', params: { side: 'supply', locked: '1' } });
    },
  },
  {
    key: 'sell',
    title: 'ลงขายสินค้า',
    subtitle: 'คลังร้าน · ราคา · สต็อก — ไม่ปนกับหางาน',
    icon: 'bag-handle',
    accent: '#FE2C55',
    onPress: () => {
      safeReplace({ pathname: '/create-details', params: { mode: 'sell' } });
    },
  },
];

/**
 * Create hub — pick intent before opening the matching form.
 * Keeps content / board demand / board supply / sell product separate.
 */
export function CreateHubScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <LinearGradient
        colors={['#E8F7F0', '#F4F7F5', '#F4F7F5']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
          hitSlop={10}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={26} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>สร้างอะไรดี?</Text>
          <Text style={styles.sub}>แยกตามบริบท — ไม่ปนเว็บบอร์ดกับลงขายสินค้า</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.list}>
        {CONTEXTS.map((ctx) => (
          <Pressable
            key={ctx.key}
            style={styles.card}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              ctx.onPress();
            }}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${ctx.accent}22` }]}>
              <Ionicons name={ctx.icon} size={26} color={ctx.accent} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{ctx.title}</Text>
              <Text style={styles.cardSub}>{ctx.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, alignItems: 'center', gap: 4 },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 3 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text.primary,
  },
  cardSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 16,
  },
});
