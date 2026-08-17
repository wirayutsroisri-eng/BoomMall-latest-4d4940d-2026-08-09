import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/shared/theme/colors';
import {
  MAX_VISIBLE_PACK_SKUS,
  groupPackLines,
  packSummary,
  skuBadgeLabel,
} from '@/modules/store/domain/pack-lines';

export type LabelPreviewLine = {
  title: string;
  option?: string;
  sku?: string;
  qty: number;
  unitPrice: number;
  imageUri?: string;
  productId?: string;
};

export type LabelPreviewModel = {
  trackingNumber: string;
  carrier: string;
  shopName: string;
  shopAddress?: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  paymentKind: 'PAID' | 'COD' | 'MIXED';
  codAmountThb: number;
  orderIds: string[];
  lines: LabelPreviewLine[];
  summaryLabel?: string;
  productImageUri?: string;
  printedAt: string;
};

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

function BarcodeStripes({ value }: { value: string }) {
  const bars = React.useMemo(
    () => Array.from({ length: 18 }, (_, i) => 1 + ((value.charCodeAt(i % value.length) + i * 7) % 3)),
    [value],
  );
  return (
    <View style={styles.barcode}>
      {bars.map((w, i) => (
        <View
          key={i}
          style={{ width: w, flex: w, backgroundColor: i % 2 === 0 ? '#0B1F17' : 'transparent', height: '100%' }}
        />
      ))}
    </View>
  );
}

export const ShippingLabelSheet = forwardRef<View, { model: LabelPreviewModel; width: number }>(
  function ShippingLabelSheet({ model, width }, ref) {
    const height = width * 1.5;
    const net = model.lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
    const isCod = model.paymentKind !== 'PAID';
    const summary = model.summaryLabel ?? packSummary(model.lines).label;
    const packGroups = groupPackLines(
      model.lines.map((line) => ({
        title: line.title,
        option: line.option,
        qty: line.qty,
        sku: line.sku,
        unitPrice: line.unitPrice,
        imageUri: line.imageUri,
        productId: line.productId,
      })),
    );
    let shown = 0;

    return (
      <View ref={ref} collapsable={false} style={[styles.sheet, { width, height }]}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.mark}>
              <Text style={styles.markText}>B</Text>
            </View>
            <View>
              <Text style={styles.wordmark}>Boom Mall</Text>
              <Text style={styles.wordSub}>SHIPPING LABEL · 4×6</Text>
            </View>
          </View>
          <Text style={styles.carrier}>{model.carrier.toUpperCase()}</Text>
        </View>

        <Text style={styles.track}>{model.trackingNumber}</Text>
        <View style={styles.scanRow}>
          <BarcodeStripes value={model.trackingNumber} />
          <View style={styles.qrBox}>
            <View style={styles.qrInner} />
            <Text style={styles.qrHint}>QR</Text>
          </View>
        </View>

        <View style={[styles.badge, isCod ? styles.badgeCod : styles.badgePaid]}>
          <Text style={[styles.badgeText, isCod ? styles.badgeCodText : styles.badgePaidText]}>
            {isCod ? `เก็บเงินปลายทาง (COD: ${formatTHB(model.codAmountThb)})` : 'ชำระเงินแล้ว (PAID)'}
          </Text>
        </View>

        <View style={styles.parties}>
          <View style={styles.box}>
            <Text style={styles.kicker}>ผู้ส่ง · FROM</Text>
            <Text style={styles.who} numberOfLines={2}>
              {model.shopName}
            </Text>
            {model.shopAddress ? (
              <Text style={styles.addr} numberOfLines={2}>
                {model.shopAddress}
              </Text>
            ) : null}
          </View>
          <View style={[styles.box, styles.boxTo]}>
            <Text style={styles.kicker}>ผู้รับ · SHIP TO</Text>
            <Text style={styles.who} numberOfLines={2}>
              {model.recipientName}
            </Text>
            <Text style={styles.phone}>{model.recipientPhone}</Text>
            <Text style={styles.addr} numberOfLines={3}>
              {model.recipientAddress}
            </Text>
          </View>
        </View>

        <Text style={styles.oids} numberOfLines={2}>
          รวม {model.orderIds.length} คำสั่งซื้อ · {model.orderIds.join(' · ')}
        </Text>

        <View style={styles.tableHead}>
          <Text style={[styles.th, { width: 16 }]}>[ ]</Text>
          <Text style={[styles.th, { width: 18 }]} />
          <Text style={[styles.th, { flex: 1 }]}>จัดของ · ตัวเลือก</Text>
          <Text style={[styles.th, { width: 52 }]}>SKU</Text>
          <Text style={[styles.th, { width: 24, textAlign: 'right' }]}>ชิ้น</Text>
        </View>
        {packGroups.map((group) => {
          const room = MAX_VISIBLE_PACK_SKUS - shown;
          if (room <= 0) return null;
          const variants = group.variants.slice(0, room);
          shown += variants.length;
          return (
            <View key={group.productId ?? group.title}>
              <Text style={styles.groupTitle} numberOfLines={1}>
                {group.title}
              </Text>
              {variants.map((line, i) => {
                const badge = skuBadgeLabel(line.option);
                return (
                  <View key={`${line.sku ?? line.option ?? i}`} style={styles.tr}>
                    <View style={styles.check} />
                    {line.imageUri ? (
                      <Image source={{ uri: line.imageUri }} style={styles.packImg} fadeDuration={0} />
                    ) : (
                      <View style={styles.packMark}>
                        <Text style={styles.packMarkText}>{line.title.trim().slice(0, 1) || '•'}</Text>
                      </View>
                    )}
                    <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>
                      {badge || line.sku || line.title}
                    </Text>
                    <Text style={[styles.tdOpt, { width: 52 }]} numberOfLines={1}>
                      {line.sku ?? ''}
                    </Text>
                    <Text style={[styles.td, { width: 24, textAlign: 'right' }]}>x{line.qty}</Text>
                  </View>
                );
              })}
            </View>
          );
        })}
        {model.lines.length > MAX_VISIBLE_PACK_SKUS ? (
          <Text style={styles.more}>
            + อีก {model.lines.length - MAX_VISIBLE_PACK_SKUS} รายการ รวมในยอดสุทธิแล้ว
          </Text>
        ) : null}

        <View style={styles.totals}>
          <Text style={styles.totalText}>{summary}</Text>
          <Text style={styles.totalText}>ยอดสุทธิ {formatTHB(net)}</Text>
        </View>
        <Text style={styles.foot}>Thank you for shopping on Boom Mall</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#0B1F17',
  },
  header: {
    backgroundColor: '#0B1F17',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontWeight: '900', color: '#0B1F17', fontSize: 13 },
  wordmark: { color: '#fff', fontWeight: '900', fontSize: 12 },
  wordSub: { color: '#00D68F', fontWeight: '800', fontSize: 7, letterSpacing: 0.4 },
  carrier: { color: '#fff', fontWeight: '900', fontSize: 10 },
  track: { marginTop: 6, fontWeight: '900', fontSize: 13, color: '#0B1F17', letterSpacing: 0.4 },
  scanRow: { flexDirection: 'row', gap: 8, marginTop: 4, alignItems: 'center' },
  barcode: { flex: 1, height: 28, flexDirection: 'row', alignItems: 'stretch' },
  qrBox: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: '#0B1F17',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  qrInner: { position: 'absolute', width: 22, height: 22, borderWidth: 3, borderColor: '#0B1F17' },
  qrHint: { fontSize: 7, fontWeight: '900', color: '#0B1F17' },
  badge: { marginTop: 6, borderRadius: 5, paddingVertical: 4, alignItems: 'center' },
  badgePaid: { backgroundColor: '#0B1F17' },
  badgeCod: { backgroundColor: '#F5A524' },
  badgeText: { fontWeight: '900', fontSize: 10 },
  badgePaidText: { color: '#00D68F' },
  badgeCodText: { color: '#1A1204' },
  parties: { flexDirection: 'row', gap: 6, marginTop: 6 },
  box: { flex: 1, borderWidth: 1, borderColor: '#0B1F17', borderRadius: 6, padding: 5 },
  boxTo: { backgroundColor: '#E8F7F0' },
  kicker: { fontSize: 7, fontWeight: '800', color: '#4A5C54' },
  who: { fontSize: 10, fontWeight: '900', color: '#0B1F17', marginTop: 2 },
  phone: { fontSize: 9, fontWeight: '800', marginTop: 1 },
  addr: { fontSize: 8, fontWeight: '600', color: '#4A5C54', marginTop: 2 },
  oids: { marginTop: 5, fontSize: 8, fontWeight: '800', color: '#0B1F17' },
  groupTitle: { marginTop: 3, fontSize: 8, fontWeight: '900', color: '#0B1F17' },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0B1F17',
    marginTop: 5,
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 3,
  },
  th: { color: '#fff', fontSize: 7, fontWeight: '800' },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 3,
    borderBottomWidth: 1,
    borderColor: '#0B1F17',
  },
  check: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderColor: '#0B1F17',
    backgroundColor: '#fff',
  },
  packImg: { width: 16, height: 16, borderRadius: 2, backgroundColor: '#fff' },
  packMark: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#0B1F17',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  packMarkText: { fontSize: 8, fontWeight: '900', color: '#0B1F17' },
  td: { fontSize: 8, fontWeight: '800', color: '#0B1F17' },
  tdOpt: { fontSize: 7, fontWeight: '900', color: '#0B1F17' },
  more: { fontSize: 7, fontWeight: '700', color: '#4A5C54', marginTop: 2 },
  totals: {
    marginTop: 'auto',
    backgroundColor: '#0B1F17',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  totalText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  foot: { textAlign: 'center', marginTop: 5, fontSize: 8, fontWeight: '800', color: colors.brand.primaryDark },
});
