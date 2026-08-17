import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { StockStatus } from '@/modules/commerce/domain/types';
import { colors } from '@/shared/theme/colors';

export const INVENTORY_CARD_H = 108;

const STOCK_DOT: Record<StockStatus, string> = {
  ready: '#22C55E',
  low: '#F5A524',
  out: '#FF3B4A',
};

const STOCK_LABEL: Record<StockStatus, string> = {
  ready: 'พร้อมขาย',
  low: 'สต็อกต่ำ',
  out: 'หมดสต็อก',
};

const OPTION_PREVIEW = 3;

type Props = {
  productId: string;
  imageUri: string;
  coverKind?: 'image' | 'video';
  title: string;
  priceLabel: string;
  optionLines: string[];
  stock: number;
  tone: StockStatus;
  disabled?: boolean;
  sourceWarehouse?: string;
  activityCount?: number;
  canEdit?: boolean;
  promoted?: boolean;
  onOpen: (productId: string) => void;
  onPreview: (productId: string) => void;
  onAlertPress?: (productId: string) => void;
};

function InventoryProductCardInner({
  productId,
  imageUri,
  coverKind = 'image',
  title,
  priceLabel,
  optionLines,
  stock,
  tone,
  disabled,
  sourceWarehouse,
  activityCount,
  canEdit,
  promoted,
  onOpen,
  onPreview,
  onAlertPress,
}: Props) {
  const optionCount = optionLines.length;
  const multi = optionCount > 1;
  const preview = optionLines.slice(0, OPTION_PREVIEW);
  const extra = Math.max(0, optionCount - preview.length);

  return (
    <Pressable
      style={[styles.card, disabled && { opacity: 0.55 }]}
      onPress={() => onOpen(productId)}
      onLongPress={() => onPreview(productId)}
      delayLongPress={380}
      accessibilityRole="button"
      accessibilityLabel={canEdit ? `แก้ไข ${title}` : title}
    >
      <View style={styles.thumbWrap}>
        <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        {coverKind === 'video' ? (
          <View style={styles.videoBadge} pointerEvents="none">
            <Ionicons name="play" size={16} color="#fff" />
          </View>
        ) : null}
        {promoted ? (
          <View style={styles.promoBadge} pointerEvents="none">
            <Ionicons name="megaphone" size={10} color="#fff" />
          </View>
        ) : null}
        <View style={[styles.statusDot, { backgroundColor: STOCK_DOT[tone] }]} />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {activityCount && activityCount > 0 && onAlertPress ? (
            <Pressable
              style={styles.alertBadge}
              onPress={() => onAlertPress(productId)}
              hitSlop={6}
            >
              <Ionicons name="notifications" size={10} color="#fff" />
              <Text style={styles.alertBadgeText}>{activityCount}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.price} numberOfLines={1}>
          {priceLabel}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.statusChip}>
            <View style={[styles.statusChipDot, { backgroundColor: STOCK_DOT[tone] }]} />
            <Text style={styles.statusChipText}>{STOCK_LABEL[tone]}</Text>
          </View>
          <Text style={styles.stockMeta}>รวม {stock.toLocaleString('th-TH')} ชิ้น</Text>
        </View>
        {sourceWarehouse ? (
          <Text style={styles.source} numberOfLines={1}>
            จากคลัง {sourceWarehouse}
          </Text>
        ) : null}
      </View>

      <View style={styles.optionCol} pointerEvents="none">
        <Text style={styles.optionCount}>
          {multi ? `${optionCount} ตัวเลือก` : 'รุ่นเดียว'}
        </Text>
        {preview.map((line, index) => (
          <Text key={`${index}-${line}`} style={styles.optionName} numberOfLines={1}>
            {line}
          </Text>
        ))}
        {extra > 0 ? <Text style={styles.optionMore}>+ อีก {extra}</Text> : null}
      </View>
    </Pressable>
  );
}

export const InventoryProductCard = memo(InventoryProductCardInner);

const styles = StyleSheet.create({
  card: {
    height: INVENTORY_CARD_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  thumbWrap: {
    width: 84,
    height: 84,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.brand.forest,
  },
  thumb: { width: 84, height: 84 },
  videoBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  promoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text.primary },
  price: { fontSize: 15, fontWeight: '800', color: colors.brand.primaryDark },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusChipDot: { width: 7, height: 7, borderRadius: 4 },
  statusChipText: { fontSize: 11, fontWeight: '700', color: colors.text.secondary },
  stockMeta: { fontSize: 11, fontWeight: '700', color: colors.text.secondary },
  source: { fontSize: 11, fontWeight: '600', color: colors.accent.info },
  alertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.accent.live,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  alertBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  optionCol: {
    width: 92,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  optionCount: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brand.primaryDark,
    marginBottom: 2,
  },
  optionName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'right',
    maxWidth: 92,
  },
  optionMore: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
  },
});
