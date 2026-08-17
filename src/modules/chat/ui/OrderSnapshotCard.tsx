import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { OrderSnapshotCard as OrderSnapshot } from '@/modules/chat/domain/types';
import { shortOrderId } from '@/modules/store/domain/order-snapshot';
import { colors } from '@/shared/theme/colors';

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

type Props = {
  snapshot: OrderSnapshot;
  compact?: boolean;
  onOpenDetail?: () => void;
};

/** Compact order pin / bubble — Tailwind-equivalent: rounded-2xl, p-2.5, gap-2, text-xs */
export function OrderSnapshotCard({ snapshot, compact, onOpenDetail }: Props) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={styles.eyebrow}>อ้างอิงคำสั่งซื้อ · {shortOrderId(snapshot.orderId)}</Text>
      <View style={styles.row}>
        {snapshot.imageUri ? (
          <Image source={{ uri: snapshot.imageUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]} />
        )}
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {snapshot.title}
          </Text>
          <Text style={styles.option} numberOfLines={1}>
            {snapshot.option || 'ตัวเลือกมาตรฐาน'} · x{snapshot.qty}
            {snapshot.extraCount ? ` · + อีก ${snapshot.extraCount}` : ''}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.amount}>{formatTHB(snapshot.amount)}</Text>
            <View style={snapshot.paymentKind === 'COD' ? styles.cod : styles.paid}>
              <Text style={snapshot.paymentKind === 'COD' ? styles.codText : styles.paidText}>
                {snapshot.paymentKind}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.status} numberOfLines={1}>
          {snapshot.orderStatusLabel}
        </Text>
        <Pressable style={styles.cta} onPress={onOpenDetail} hitSlop={6}>
          <Text style={styles.ctaText}>ดูใบปะหน้า / ข้อมูลออเดอร์</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(11,31,23,0.12)',
    maxWidth: 280,
  },
  cardCompact: {
    maxWidth: '100%',
    borderRadius: 12,
    padding: 8,
  },
  eyebrow: { fontSize: 10, fontWeight: '800', color: colors.brand.primaryDark, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#E8F7F0' },
  thumbPh: { backgroundColor: '#D7E4DC' },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  option: { marginTop: 2, fontSize: 11, fontWeight: '600', color: colors.text.secondary },
  meta: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  amount: { fontSize: 13, fontWeight: '900', color: colors.text.primary },
  paid: { backgroundColor: '#0B1F17', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  paidText: { color: '#00D68F', fontSize: 9, fontWeight: '900' },
  cod: { backgroundColor: '#F5A524', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  codText: { color: '#1A1204', fontSize: 9, fontWeight: '900' },
  footer: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  status: { flex: 1, fontSize: 11, fontWeight: '700', color: '#9A6700' },
  cta: {
    backgroundColor: '#E8F7F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  ctaText: { fontSize: 10, fontWeight: '800', color: colors.brand.primaryDark },
});
