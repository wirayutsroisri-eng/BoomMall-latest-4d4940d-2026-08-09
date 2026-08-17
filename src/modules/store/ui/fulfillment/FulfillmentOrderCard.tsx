import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';
import type { IncomingOrder, IncomingOrderLine } from '@/modules/store/domain/types';
import {
  MAX_VISIBLE_PACK_SKUS,
  groupPackLines,
  packSummary,
  skuBadgeLabel,
} from '@/modules/store/domain/pack-lines';
import {
  fulfillmentPriorityOf,
  provinceFromAddress,
  type FulfillmentPriority,
} from '@/modules/store/domain/fulfillment-priority';
import { courierHeadline } from '@/modules/store/domain/courier-status';

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export { linesOfOrder } from '@/modules/store/domain/pack-lines';

function UrgentBadge({ label }: { label: string }) {
  return (
    <View style={styles.urgentBadge}>
      <Text style={styles.urgentText}>{label}</Text>
    </View>
  );
}

function productMark(title: string) {
  return title.trim().slice(0, 1) || '•';
}

function SkuRow({ line }: { line: IncomingOrderLine }) {
  const badge = skuBadgeLabel(line.option);
  return (
    <View style={styles.skuRow}>
      {line.imageUri ? (
        <Image source={{ uri: line.imageUri }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPh]}>
          <Text style={styles.thumbMark}>{productMark(line.title)}</Text>
        </View>
      )}
      <View style={styles.skuBody}>
        {badge ? (
          <View style={styles.skuBadge}>
            <Text style={styles.skuBadgeText}>{badge}</Text>
          </View>
        ) : null}
        {line.sku ? (
          <Text style={styles.skuCode} numberOfLines={1}>
            {line.sku}
          </Text>
        ) : null}
      </View>
      <Text style={styles.qty}>x{line.qty}</Text>
    </View>
  );
}

function ProductBlock({
  title,
  variants,
}: {
  title: string;
  variants: IncomingOrderLine[];
}) {
  return (
    <View style={styles.productBlock}>
      <Text style={styles.product} numberOfLines={2}>
        {title}
      </Text>
      {variants.map((line, index) => (
        <SkuRow key={`${line.sku ?? line.option ?? index}`} line={line} />
      ))}
    </View>
  );
}

type Stage = 'pack' | 'shipping' | 'done';

type Props = {
  order: IncomingOrder;
  now: number;
  lines: IncomingOrderLine[];
  orderCount?: number;
  amount: number;
  stage?: Stage;
  selecting?: boolean;
  selected?: boolean;
  onOpen: () => void;
  onShare: () => void;
  onPrint: () => void;
  onChatBuyer: () => void;
  onLongPress?: () => void;
  onToggleSelect?: () => void;
  onMarkDelivered?: () => void;
};

export function FulfillmentOrderCard({
  order,
  now,
  lines,
  orderCount = 1,
  amount,
  stage = 'pack',
  selecting = false,
  selected = false,
  onOpen,
  onShare,
  onPrint,
  onChatBuyer,
  onLongPress,
  onToggleSelect,
  onMarkDelivered,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const priority: FulfillmentPriority = fulfillmentPriorityOf(order, now);
  const province = provinceFromAddress(order.shippingAddress, order.province);
  const groups = groupPackLines(lines);
  const summary = packSummary(lines);
  const overflow = Math.max(0, lines.length - MAX_VISIBLE_PACK_SKUS);
  const canExpand = overflow > 0;
  const visibleGroups = (() => {
    if (expanded || !canExpand) return groups;
    const out: typeof groups = [];
    let used = 0;
    for (const group of groups) {
      const room = MAX_VISIBLE_PACK_SKUS - used;
      if (room <= 0) break;
      if (group.variants.length <= room) {
        out.push(group);
        used += group.variants.length;
        continue;
      }
      out.push({ ...group, variants: group.variants.slice(0, room) });
      break;
    }
    return out;
  })();

  return (
    <Pressable
      style={[styles.card, selected && styles.cardOn]}
      onPress={selecting ? onToggleSelect : onOpen}
      onLongPress={onLongPress}
      delayLongPress={380}
    >
      <View style={styles.top}>
        {selecting ? (
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={selected ? colors.brand.primary : colors.text.muted}
          />
        ) : null}
        {stage === 'shipping' ? (
          <View style={styles.shipBadge}>
            <Text style={styles.shipBadgeText}>กำลังจัดส่ง</Text>
          </View>
        ) : stage === 'done' ? (
          <View style={styles.quietBadge}>
            <Text style={styles.quietText}>สำเร็จแล้ว</Text>
          </View>
        ) : priority.urgent ? (
          <UrgentBadge label={priority.badgeLabel} />
        ) : (
          <View style={styles.quietBadge}>
            <Text style={styles.quietText}>{priority.badgeLabel}</Text>
          </View>
        )}
        <Text style={styles.oid} numberOfLines={1}>
          {orderCount > 1 ? `${order.id} · รวม ${orderCount} ออเดอร์` : order.id}
        </Text>
        <Text style={[styles.eta, stage === 'pack' && priority.overdue && styles.etaHot]} numberOfLines={1}>
          {stage === 'shipping'
            ? courierHeadline(order.courierEvent, order.trackingNo)
            : stage === 'done'
              ? courierHeadline(order.courierEvent ?? 'DELIVERED', order.trackingNo)
              : priority.countdownLabel}
        </Text>
      </View>

      <View style={styles.summaryBadge}>
        <Text style={styles.summaryText}>{summary.label}</Text>
      </View>

      <View style={styles.body}>
        {visibleGroups.map((group) => (
          <ProductBlock
            key={group.productId ?? group.title}
            title={group.title}
            variants={group.variants}
          />
        ))}
        {canExpand ? (
          <Pressable
            style={styles.expandRow}
            onPress={(e) => {
              e.stopPropagation?.();
              setExpanded((v) => !v);
            }}
          >
            <Text style={styles.more}>
              {expanded ? 'ย่อรายการสินค้า' : `+ อีก ${overflow} ตัวเลือกในออเดอร์นี้`}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.brand.primaryDark}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.shipBox}>
        <Text style={styles.shipName} numberOfLines={1}>
          {order.customerName}
          {province ? ` · ${province}` : ''}
        </Text>
        {order.recipientPhone ? (
          <Text style={styles.shipPhone} numberOfLines={1}>
            {order.recipientPhone}
          </Text>
        ) : null}
        {order.shippingAddress ? (
          <Text style={styles.shipAddr} numberOfLines={3}>
            {order.shippingAddress}
          </Text>
        ) : null}
      </View>

      <View style={styles.payRow}>
        {order.paymentMethod === 'COD' ? (
          <View style={styles.cod}>
            <Text style={styles.codText}>COD {formatTHB(amount)}</Text>
          </View>
        ) : (
          <View style={styles.paid}>
            <Text style={styles.paidText}>PAID</Text>
          </View>
        )}
        <Text style={styles.amount}>{formatTHB(amount)}</Text>
        {selecting ? null : (
        <View style={styles.iconActions}>
          <Pressable
            style={styles.iconBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onShare();
            }}
            hitSlop={6}
            accessibilityLabel="แชร์"
          >
            <Ionicons name="share-outline" size={18} color={colors.brand.primaryDark} />
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              onChatBuyer();
            }}
            hitSlop={6}
            accessibilityLabel="แชท"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand.primaryDark} />
          </Pressable>
          <Pressable
            style={styles.iconBtnDark}
            onPress={(e) => {
              e.stopPropagation?.();
              onPrint();
            }}
            hitSlop={6}
            accessibilityLabel="พิมพ์"
          >
            <Ionicons name="print-outline" size={18} color="#fff" />
          </Pressable>
        </View>
        )}
      </View>
      {stage === 'shipping' && onMarkDelivered && !selecting ? (
        <Pressable
          style={styles.deliverBtn}
          onPress={(e) => {
            e.stopPropagation?.();
            onMarkDelivered();
          }}
        >
          <Text style={styles.deliverBtnText}>ยืนยันว่าส่งถึงแล้ว</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    gap: 10,
    shadowColor: '#0B1F17',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardOn: {
    borderWidth: 2,
    borderColor: colors.brand.primary,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  urgentBadge: {
    backgroundColor: '#C81E4A',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  urgentText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  quietBadge: {
    backgroundColor: '#E8F7F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  quietText: { color: colors.brand.primaryDark, fontSize: 11, fontWeight: '800' },
  shipBadge: {
    backgroundColor: '#0B1F17',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shipBadgeText: { color: '#00D68F', fontSize: 11, fontWeight: '900' },
  deliverBtn: {
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliverBtnText: { fontSize: 14, fontWeight: '800', color: colors.brand.primaryDark },
  oid: { flex: 1, fontSize: 11, fontWeight: '800', color: colors.text.muted },
  eta: { fontSize: 11, fontWeight: '800', color: '#9A6700' },
  etaHot: { color: '#C81E4A' },
  summaryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0B1F17',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  summaryText: { color: '#00D68F', fontSize: 11, fontWeight: '900' },
  body: { gap: 10 },
  productBlock: { gap: 6 },
  product: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  skuRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  thumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E8F7F0' },
  thumbPh: { backgroundColor: '#0B1F17', alignItems: 'center', justifyContent: 'center' },
  thumbMark: { color: '#fff', fontSize: 14, fontWeight: '900' },
  skuBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  skuBadge: {
    backgroundColor: '#E8F7F0',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#0B1F17',
  },
  skuBadgeText: { fontSize: 12, fontWeight: '900', color: '#0B1F17' },
  skuCode: { fontSize: 11, fontWeight: '700', color: colors.text.muted },
  qty: { fontSize: 15, fontWeight: '900', color: colors.text.primary, minWidth: 28, textAlign: 'right' },
  expandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  more: { fontSize: 12, fontWeight: '800', color: colors.brand.primaryDark },
  shipBox: {
    backgroundColor: '#F4F7F5',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  shipName: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  shipPhone: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  shipAddr: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary, lineHeight: 17 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cod: { backgroundColor: '#F5A524', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  codText: { fontSize: 11, fontWeight: '900', color: '#1A1204' },
  paid: { backgroundColor: '#0B1F17', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  paidText: { fontSize: 11, fontWeight: '900', color: '#00D68F' },
  amount: { flex: 1, fontSize: 16, fontWeight: '900', color: colors.text.primary },
  iconActions: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E8F7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0B1F17',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
