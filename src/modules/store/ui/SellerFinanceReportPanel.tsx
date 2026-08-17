import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '@/shared/theme/colors';
import {
  downloadSellerStatementFile,
  fetchSellerStatement,
  type SellerStatementBundle,
  type SellerStatementQuery,
} from '@/modules/commerce/data/commerceApi';

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
}

const MONTHS = [
  { v: 1, l: 'ม.ค.' },
  { v: 2, l: 'ก.พ.' },
  { v: 3, l: 'มี.ค.' },
  { v: 4, l: 'เม.ย.' },
  { v: 5, l: 'พ.ค.' },
  { v: 6, l: 'มิ.ย.' },
  { v: 7, l: 'ก.ค.' },
  { v: 8, l: 'ส.ค.' },
  { v: 9, l: 'ก.ย.' },
  { v: 10, l: 'ต.ค.' },
  { v: 11, l: 'พ.ย.' },
  { v: 12, l: 'ธ.ค.' },
];

type Mode = 'month' | 'range';

async function shareBinary(bytes: Uint8Array, filename: string, mime: string) {
  const file = new File(Paths.cache, filename);
  if (file.exists) {
    try {
      file.delete();
    } catch {
      /* ignore */
    }
  }
  file.create();
  file.write(bytes);
  await Share.share({
    url: file.uri,
    title: filename,
    message: filename,
  });
  return { uri: file.uri, mime };
}

type Props = {
  /** เปิดฟอร์มบัญชี+ภาษี จากหน้าแม่ */
  onEditTaxProfile?: () => void;
};

export function SellerFinanceReportPanel({ onEditTaxProfile }: Props) {
  const now = useMemo(() => new Date(), []);
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [from, setFrom] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
  );
  const [to, setTo] = useState(() => now.toISOString().slice(0, 10));

  const [data, setData] = useState<SellerStatementBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

  const query = useMemo((): SellerStatementQuery => {
    if (mode === 'range') return { from, to };
    return { month, year };
  }, [mode, month, year, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchSellerStatement(query);
      setData(res.data);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'โหลดรายงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = async (format: 'pdf' | 'xlsx') => {
    setBusy(format);
    setError(null);
    try {
      const file = await downloadSellerStatementFile({ ...query, format });
      await shareBinary(file.bytes, file.filename, file.mime);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'พร้อมแชร์ไฟล์แล้ว',
        format === 'pdf'
          ? 'เลือกแอปเพื่อบันทึกหรือส่งใบสรุปยอดบัญชีให้สำนักงานบัญชี'
          : 'เลือกแอปเพื่อบันทึกไฟล์ Excel ประวัติคำสั่งซื้อ',
      );
    } catch (e) {
      Alert.alert('ดาวน์โหลดไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่');
    } finally {
      setBusy(null);
    }
  };

  const s = data?.summary;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>รายงานสรุปรายได้ร้านค้า</Text>
      <Text style={styles.sub}>ดาวน์โหลดใบสรุปยอดส่งสำนักงานบัญชี — ตามงวดที่เลือก</Text>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeChip, mode === 'month' && styles.modeChipOn]}
          onPress={() => setMode('month')}
        >
          <Text style={[styles.modeText, mode === 'month' && styles.modeTextOn]}>เดือน/ปี</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, mode === 'range' && styles.modeChipOn]}
          onPress={() => setMode('range')}
        >
          <Text style={[styles.modeText, mode === 'range' && styles.modeTextOn]}>ช่วงวันที่</Text>
        </Pressable>
      </View>

      {mode === 'month' ? (
        <View>
          <Text style={styles.label}>เดือน</Text>
          <View style={styles.monthGrid}>
            {MONTHS.map((m) => (
              <Pressable
                key={m.v}
                style={[styles.monthChip, month === m.v && styles.monthChipOn]}
                onPress={() => setMonth(m.v)}
              >
                <Text style={[styles.monthText, month === m.v && styles.monthTextOn]}>{m.l}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>ปี</Text>
          <View style={styles.yearRow}>
            <Pressable style={styles.yearBtn} onPress={() => setYear((y) => y - 1)}>
              <Ionicons name="remove" size={18} color={colors.text.primary} />
            </Pressable>
            <Text style={styles.yearValue}>{year}</Text>
            <Pressable style={styles.yearBtn} onPress={() => setYear((y) => y + 1)}>
              <Ionicons name="add" size={18} color={colors.text.primary} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.rangeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>จากวันที่</Text>
            <TextInput
              style={styles.input}
              value={from}
              onChangeText={setFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="none"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>ถึงวันที่</Text>
            <TextInput
              style={styles.input}
              value={to}
              onChangeText={setTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.text.muted}
              autoCapitalize="none"
            />
          </View>
        </View>
      )}

      <Pressable style={styles.refreshBtn} onPress={() => void load()} disabled={loading}>
        <Ionicons name="refresh" size={16} color={colors.brand.primaryDark} />
        <Text style={styles.refreshText}>{loading ? 'กำลังโหลด…' : 'อัปเดตสรุปงวด'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && !data ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.brand.primaryDark} />
      ) : s ? (
        <>
          <Text style={styles.period}>งวด {data?.period.label}</Text>
          {!data?.store.taxId ? (
            <Pressable
              style={styles.warn}
              onPress={() => {
                if (onEditTaxProfile) onEditTaxProfile();
                else Alert.alert('กรอกข้อมูลภาษี', 'กลับไปที่การ์ดบัญชีรับเงินและข้อมูลภาษีด้านบน');
              }}
            >
              <Text style={styles.warnText}>
                ยังไม่มีเลขผู้เสียภาษีบนใบสรุป — แตะเพื่อไปกรอกก่อนส่งบัญชี
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.storeMeta} numberOfLines={2}>
              {data.store.name} · ภาษี {data.store.taxId}
              {data.store.address ? ` · ${data.store.address}` : ''}
            </Text>
          )}

          <View style={styles.exportBox}>
            <Text style={styles.exportTitle}>นำออกไฟล์ส่งบัญชี</Text>
            <Text style={styles.exportSub}>เลือกงวดด้านบน แล้วดาวน์โหลดเอกสารทางการ</Text>
            <Pressable
              style={[styles.dlBtn, styles.dlPrimary, busy && { opacity: 0.6 }]}
              disabled={Boolean(busy)}
              onPress={() => void download('pdf')}
            >
              <Ionicons name="document-text-outline" size={18} color="#fff" />
              <Text style={styles.dlPrimaryText}>
                {busy === 'pdf' ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลดใบสรุปยอด (PDF)'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.dlBtn, styles.dlSecondary, busy && { opacity: 0.6 }]}
              disabled={Boolean(busy)}
              onPress={() => void download('xlsx')}
            >
              <Ionicons name="grid-outline" size={18} color={colors.brand.primaryDark} />
              <Text style={styles.dlSecondaryText}>
                {busy === 'xlsx' ? 'กำลังสร้าง Excel…' : 'ดาวน์โหลดประวัติออเดอร์ (Excel)'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.cards}>
            <View style={[styles.card, styles.cardWide]}>
              <Text style={styles.cardLabel}>ยอดขายรวม (Gross Sales)</Text>
              <Text style={styles.cardValue}>{formatTHB(s.grossSales)}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>ค่าธรรมเนียม GP</Text>
              <Text style={[styles.cardValue, styles.cardExpense]}>{formatTHB(s.platformGpFee)}</Text>
              <Text style={styles.cardHint}>ค่าใช้จ่ายของร้าน</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>ยอดสุทธิที่ได้รับจริง</Text>
              <Text style={styles.cardValue}>{formatTHB(s.netEarningsPaid)}</Text>
              <Text style={styles.cardHint}>Net Earnings (โอนแล้ว)</Text>
            </View>
            <View style={[styles.card, styles.cardWide]}>
              <Text style={styles.cardLabel}>จำนวนคำสั่งซื้อทั้งหมด</Text>
              <Text style={styles.cardValue}>{s.totalOrders.toLocaleString('th-TH')}</Text>
              {s.pendingOrders > 0 ? (
                <Text style={styles.cardHint}>พัก escrow {s.pendingOrders} รายการ</Text>
              ) : null}
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  heading: { fontSize: 16, fontWeight: '800', color: colors.text.primary },
  sub: { marginTop: 4, fontSize: 12, fontWeight: '600', color: colors.text.secondary, marginBottom: 12 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
  },
  modeChipOn: { backgroundColor: colors.brand.primaryDark },
  modeText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  modeTextOn: { color: '#fff' },
  label: { fontSize: 11, fontWeight: '700', color: colors.text.muted, marginBottom: 6 },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  monthChip: {
    width: '15%',
    minWidth: 48,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
  },
  monthChipOn: { backgroundColor: 'rgba(12,122,82,0.15)' },
  monthText: { fontSize: 12, fontWeight: '700', color: colors.text.secondary },
  monthTextOn: { color: colors.brand.primaryDark },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 },
  yearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearValue: { fontSize: 20, fontWeight: '800', color: colors.text.primary, minWidth: 64, textAlign: 'center' },
  rangeRow: { flexDirection: 'row', gap: 10 },
  input: {
    backgroundColor: colors.surface.canvas,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
  },
  refreshText: { fontSize: 13, fontWeight: '800', color: colors.brand.primaryDark },
  error: { color: '#C81E4A', fontWeight: '700', fontSize: 12, marginBottom: 8 },
  period: { fontSize: 13, fontWeight: '700', color: colors.text.secondary, marginBottom: 10 },
  warn: {
    backgroundColor: '#FFF4E5',
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  warnText: { color: '#9A6700', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  storeMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 10,
    lineHeight: 17,
  },
  exportBox: {
    backgroundColor: colors.surface.canvas,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  exportTitle: { fontSize: 14, fontWeight: '800', color: colors.text.primary },
  exportSub: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface.canvas,
    borderRadius: 12,
    padding: 12,
  },
  cardWide: { width: '100%' },
  cardLabel: { fontSize: 11, fontWeight: '700', color: colors.text.secondary },
  cardValue: { marginTop: 6, fontSize: 20, fontWeight: '800', color: colors.text.primary },
  cardExpense: { color: '#C81E4A' },
  cardHint: { marginTop: 2, fontSize: 10, fontWeight: '600', color: colors.text.muted },
  dlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 8,
  },
  dlPrimary: { backgroundColor: colors.brand.primaryDark },
  dlPrimaryText: { fontWeight: '800', fontSize: 13, color: '#fff' },
  dlSecondary: { backgroundColor: '#fff', marginBottom: 0 },
  dlSecondaryText: { fontWeight: '800', fontSize: 13, color: colors.brand.primaryDark },
});
