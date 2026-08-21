import React, { useMemo } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  stockStatusOf,
} from '@/modules/commerce/domain/stock-core';
import { coverMedia, resolveProductMedia } from '@/modules/commerce/domain/product-media';
import { displayMediaUri } from '@/modules/commerce/data/product-media';
import type { MasterSku, SkuVariant, StockStatus } from '@/modules/commerce/domain/types';
import { ProductVideoThumb } from '@/modules/store/ui/sell/ProductVideoThumb';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

const SCREEN_H = Dimensions.get('window').height;
const SHEET_H = Math.round(SCREEN_H * 0.62);

type Props = {
  visible: boolean;
  product: MasterSku | null;
  variants: SkuVariant[];
  availableTotal: number;
  sellStatusLabel?: string;
  sourceWarehouse?: string;
  onClose: () => void;
  onOpenFull: () => void;
  onClone?: () => void;
  onPromote?: () => void;
  canEdit?: boolean;
};

const STATUS_COPY: Record<StockStatus, { label: string; color: string }> = {
  ready: { label: '🟢 พร้อมขาย', color: '#16A34A' },
  low: { label: '🟠 ใกล้หมด', color: '#D97706' },
  out: { label: '🔴 สินค้าหมด', color: '#DC2626' },
};

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function ProductQuickPreviewSheet({
  visible,
  product,
  variants,
  availableTotal,
  sellStatusLabel,
  sourceWarehouse,
  onClose,
  onOpenFull,
  onClone,
  onPromote,
  canEdit,
}: Props) {
  const insets = useSafeAreaInsets();

  const derived = useMemo(() => {
    if (!product) return null;
    const prices = variants.map((v) => v.price);
    const minPrice = prices.length ? Math.min(...prices) : product.basePrice;
    const maxPrice = prices.length ? Math.max(...prices) : product.basePrice;
    const priceLabel =
      minPrice === maxPrice ? formatTHB(minPrice) : `${formatTHB(minPrice)} – ${formatTHB(maxPrice)}`;
    const threshold = Math.min(
      ...variants.map((v) => v.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD),
      DEFAULT_LOW_STOCK_THRESHOLD,
    );
    const tone = stockStatusOf(availableTotal, threshold);
    const skuLine =
      variants.length === 1
        ? variants[0].sku
        : `${product.masterSku} · ${variants.length} รุ่น`;
    return { priceLabel, tone, skuLine };
  }, [product, variants, availableTotal]);

  if (!product || !derived) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <View />
      </Modal>
    );
  }

  const cover = coverMedia(resolveProductMedia(product));
  const imageUri = cover?.type === 'image' ? cover.uri : masterContentImage(product.id);
  const status = STATUS_COPY[derived.tone];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <DragDownDismiss onDismiss={onClose} rootInModal style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="ปิด" />
        <View style={[styles.sheet, { height: SHEET_H, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.handle} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
            bounces={false}
          >
            <View style={styles.hero}>
              <LinearGradient colors={['#0B3D2E', '#1A7A55']} style={StyleSheet.absoluteFill} />
              {cover?.type === 'video' ? (
                <ProductVideoThumb
                  uri={cover.uri}
                  poster={cover.thumbnailUri ? displayMediaUri(cover.thumbnailUri) : undefined}
                  style={styles.heroImage}
                  autoPlay
                />
              ) : (
                <Image source={{ uri: imageUri }} style={styles.heroImage} resizeMode="cover" />
              )}
              <LinearGradient
                colors={['transparent', 'rgba(7,20,15,0.55)']}
                style={styles.heroFade}
              />
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {product.title}
            </Text>

            <View style={styles.metaRow}>
              <View style={styles.chip}>
                <Text style={styles.chipText}>SKU {derived.skuLine}</Text>
              </View>
              {sourceWarehouse ? (
                <View style={[styles.chip, styles.chipMuted]}>
                  <Ionicons name="business-outline" size={12} color={colors.text.secondary} />
                  <Text style={styles.chipTextMuted} numberOfLines={1}>
                    {sourceWarehouse}
                  </Text>
                </View>
              ) : null}
              {product.isPromoted ? (
                <View style={[styles.chip, styles.promoChip]}>
                  <Ionicons name="megaphone" size={12} color="#fff" />
                  <Text style={styles.promoChipText}>กำลังโฆษณา</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>ราคาขาย</Text>
                <Text style={styles.statValue}>{derived.priceLabel}</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statLabel}>สต็อกคงเหลือ</Text>
                <Text style={styles.statValue}>
                  {availableTotal.toLocaleString('th-TH')} ชิ้น
                </Text>
              </View>
            </View>

            <Text style={[styles.sellStatus, { color: status.color }]}>
              {sellStatusLabel ?? status.label}
              {derived.tone === 'low'
                ? ` — เหลือ ${availableTotal.toLocaleString('th-TH')} ชิ้น`
                : ''}
            </Text>

            {onClone ? (
              <Pressable style={styles.cloneLink} onPress={onClone}>
                <Ionicons name="copy-outline" size={14} color={colors.brand.primaryDark} />
                <Text style={styles.cloneLinkText}>คัดลอกสินค้า</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {onPromote ? (
              <Pressable style={styles.promoteBtn} onPress={onPromote}>
                <Ionicons name="megaphone-outline" size={16} color={colors.brand.primaryDark} />
                <Text style={styles.promoteBtnText}>
                  {product.isPromoted ? 'ดู/จัดการโฆษณา' : 'ดันฟีดสินค้า'}
                </Text>
              </Pressable>
            ) : null}
            <View style={styles.actionRow}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>ปิด</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onOpenFull}>
              <Text style={styles.primaryBtnText}>{canEdit ? 'แก้ไขสินค้า' : 'ดูสินค้า'}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </Pressable>
            </View>
          </View>
        </View>
      </DragDownDismiss>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginTop: 10,
    marginBottom: 8,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 8 },
  hero: {
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#0B3D2E',
  },
  heroImage: { ...StyleSheet.absoluteFill },
  heroFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56 },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 10,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    backgroundColor: '#EEF2F0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '70%',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text.primary },
  chipTextMuted: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCell: {
    flex: 1,
    backgroundColor: '#F6F8F7',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statLabel: { fontSize: 11, fontWeight: '600', color: colors.text.secondary, marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  sellStatus: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  cloneLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
  },
  cloneLinkText: { fontSize: 13, fontWeight: '700', color: colors.brand.primaryDark },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  promoteBtn: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brand.primaryDark,
    backgroundColor: '#F3FBF7',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  promoteBtnText: { fontSize: 14, fontWeight: '800', color: colors.brand.primaryDark },
  promoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.primaryDark,
  },
  promoChipText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    flex: 0.42,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DBD8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  primaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
