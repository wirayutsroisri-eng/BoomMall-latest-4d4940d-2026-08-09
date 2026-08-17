import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import type { MasterSku } from '@/modules/commerce/domain/types';
import { colors } from '@/shared/theme/colors';
import { ENABLE_SIMULATED_CAMERA_TOOLS } from '@/shared/compliance/appStoreGates';

const FRAME = Math.min(Dimensions.get('window').width - 72, 280);

type DetectedHint = {
  label: string;
  confidence: number;
};

type MatchRow = {
  master: MasterSku;
  score: number;
  reason: string;
};

function hashSeed(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

/** Mock visual classifier — deterministic from image URI so demos stay stable */
function detectFromImage(uri: string): DetectedHint[] {
  const seed = hashSeed(uri);
  const pool: DetectedHint[] = [
    { label: 'แบตเตอรี่ LiFePO4', confidence: 0.92 },
    { label: 'Controller FOC', confidence: 0.88 },
    { label: 'มอเตอร์ฮับ', confidence: 0.84 },
    { label: 'อะไหล่ CNC', confidence: 0.79 },
    { label: 'สายชาร์จ / Converter', confidence: 0.76 },
    { label: 'ยาง / ล้อ', confidence: 0.71 },
  ];
  const start = seed % pool.length;
  return [0, 1, 2].map((offset) => {
    const item = pool[(start + offset) % pool.length];
    const jitter = ((seed >> (offset * 3)) % 8) / 100;
    return { ...item, confidence: Math.min(0.97, item.confidence - jitter) };
  });
}

function matchProducts(masters: MasterSku[], hints: DetectedHint[], uri: string): MatchRow[] {
  const seed = hashSeed(uri);
  const keywords = hints.flatMap((h) => h.label.toLowerCase().split(/[\s/]+/));

  return masters
    .map((master, index) => {
      const hay = `${master.title} ${master.tags.join(' ')} ${master.categoryKey ?? ''}`.toLowerCase();
      let score = 0.35 + ((seed + index * 17) % 25) / 100;
      const hit = keywords.find((k) => k.length > 2 && hay.includes(k));
      if (hit) score += 0.35;
      if (hints.some((h) => hay.includes(h.label.split(' ')[0].toLowerCase()))) score += 0.15;
      if (/battery|lifepo4|แบต/.test(hay) && hints[0]?.label.includes('แบต')) score += 0.2;
      if (/controller|foc|กล่อง/.test(hay) && /controller|foc/i.test(hints[0]?.label ?? '')) score += 0.2;
      if (/motor|hub|มอเตอร์/.test(hay) && /มอเตอร์|hub/i.test(hints[0]?.label ?? '')) score += 0.2;
      return {
        master,
        score: Math.min(0.99, score),
        reason: hit ? `ตรงกับ "${hints[0]?.label}"` : `คล้ายรูปที่สแกน · ${(score * 100).toFixed(0)}%`,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function ImageProductSearchScreen() {
  const insets = useSafeAreaInsets();
  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [hints, setHints] = useState<DetectedHint[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  const scanY = useSharedValue(0);
  useEffect(() => {
    scanY.value = withRepeat(
      withSequence(withTiming(FRAME - 3, { duration: 1400 }), withTiming(0, { duration: 1400 })),
      -1,
      false,
    );
  }, [scanY]);
  const scanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanY.value }],
  }));

  const variantsByMaster = useMemo(() => {
    const map = new Map<string, typeof variants>();
    for (const v of variants) {
      const list = map.get(v.masterSkuId);
      if (list) list.push(v);
      else map.set(v.masterSkuId, [v]);
    }
    return map;
  }, [variants]);

  const analyze = (uri: string) => {
    setImageUri(uri);
    setAnalyzing(true);
    setHints([]);
    setMatches([]);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Simulate on-device vision latency
    setTimeout(() => {
      const detected = detectFromImage(uri);
      const rows = matchProducts(masters, detected, uri);
      setHints(detected);
      setMatches(rows);
      setAnalyzing(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 900);
  };

  const pickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์คลังภาพ', 'อนุญาตให้ BoomMall เข้าถึงรูปภาพเพื่อค้นหาสินค้า');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) analyze(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'ต้องการสิทธิ์กล้อง',
        'อนุญาตกล้องเพื่อถ่ายรูปสินค้า หรือใช้ "เลือกรูป" จากคลังภาพ',
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) analyze(result.assets[0].uri);
  };

  const simulateScan = () => {
    const demoUri = `https://picsum.photos/seed/boommall-scan-${Date.now() % 7}/720/720`;
    analyze(demoUri);
  };

  const openProduct = (master: MasterSku) => {
    router.push({ pathname: '/shop/product/[id]', params: { id: master.id } });
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#101814', '#000000']} style={StyleSheet.absoluteFill} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={styles.title}>สแกนรูปหาสินค้า</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.center}>
          <View style={styles.frame}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <View style={styles.frameEmpty}>
                <Ionicons name="camera-outline" size={42} color="rgba(255,255,255,0.45)" />
                <Text style={styles.frameEmptyText}>วางสินค้าในกรอบ</Text>
              </View>
            )}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            {!imageUri || analyzing ? (
              <Animated.View style={[styles.scanLine, scanLineStyle]} />
            ) : null}
            {analyzing ? (
              <View style={styles.analyzingOverlay}>
                <ActivityIndicator color={colors.brand.primary} />
                <Text style={styles.analyzingText}>กำลังวิเคราะห์รูป...</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.hint}>เลือกรูปจากคลัง หรือสแกนด้วยกล้อง เพื่อหาสินค้าที่คล้ายกัน</Text>
        </View>

        {/* Action box */}
        <View style={styles.actionBox}>
          <Text style={styles.actionTitle}>กล่องค้นหาด้วยรูป</Text>
          <Text style={styles.actionSub}>รองรับทั้งเลือกรูปและถ่าย/สแกนรูปสินค้า</Text>

          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={pickFromLibrary}>
              <View style={styles.actionIcon}>
                <Ionicons name="images-outline" size={22} color={colors.brand.primaryDark} />
              </View>
              <Text style={styles.actionBtnText}>เลือกรูป</Text>
            </Pressable>

            <Pressable style={styles.actionBtn} onPress={takePhoto}>
              <View style={styles.actionIcon}>
                <Ionicons name="camera-outline" size={22} color={colors.brand.primaryDark} />
              </View>
              <Text style={styles.actionBtnText}>สแกนรูป</Text>
            </Pressable>

            {ENABLE_SIMULATED_CAMERA_TOOLS ? (
              <Pressable style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={simulateScan}>
                <View style={[styles.actionIcon, styles.actionIconPrimary]}>
                  <Ionicons name="scan-outline" size={22} color={colors.brand.ink} />
                </View>
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>จำลองสแกน</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Detected labels */}
        {hints.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ระบบมองเห็นแล้ว</Text>
            <View style={styles.hintChips}>
              {hints.map((h) => (
                <View key={h.label} style={styles.hintChip}>
                  <Text style={styles.hintChipText}>
                    {h.label} · {(h.confidence * 100).toFixed(0)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Matches */}
        {matches.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>สินค้าที่พบ ({matches.length})</Text>
            {matches.map((row) => {
              const vs = variantsByMaster.get(row.master.id) ?? [];
              const price = vs.length
                ? Math.min(...vs.map((v) => v.price))
                : row.master.basePrice;
              return (
                <Pressable
                  key={row.master.id}
                  style={styles.resultCard}
                  onPress={() => openProduct(row.master)}
                >
                  <Image
                    source={{
                      uri: row.master.imageUri ?? masterContentImage(row.master.id),
                    }}
                    style={styles.resultThumb}
                  />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.resultTitle} numberOfLines={2}>
                      {row.master.title}
                    </Text>
                    <Text style={styles.resultMeta} numberOfLines={1}>
                      {row.reason} · {vs.length || 1} SKU
                    </Text>
                    <Text style={styles.resultPrice}>{formatTHB(price)}</Text>
                  </View>
                  <View style={styles.scorePill}>
                    <Text style={styles.scorePillText}>{(row.score * 100).toFixed(0)}%</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {imageUri && !analyzing && !matches.length ? (
          <Text style={styles.empty}>ไม่พบสินค้าที่ใกล้เคียง — ลองเลือกรูปอื่น</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontWeight: '800', fontSize: 15 },
  center: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  frame: {
    width: FRAME,
    height: FRAME,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  frameEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  frameEmptyText: {
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '700',
    fontSize: 13,
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: colors.brand.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand.primary,
  },
  analyzingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  analyzingText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  hint: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  actionBox: {
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 14,
    gap: 8,
  },
  actionTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  actionSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnPrimary: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: {
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnTextPrimary: {
    color: colors.brand.ink,
  },
  section: {
    marginTop: 18,
    paddingHorizontal: 16,
    gap: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 2,
  },
  hintChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hintChip: {
    backgroundColor: 'rgba(0,214,143,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,214,143,0.35)',
  },
  hintChipText: {
    color: colors.brand.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  resultThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#1A2A22',
  },
  resultTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  resultMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
  },
  resultPrice: {
    color: colors.brand.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  scorePill: {
    backgroundColor: colors.brand.primary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  scorePillText: {
    color: colors.brand.ink,
    fontSize: 11,
    fontWeight: '900',
  },
  empty: {
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 13,
  },
});
