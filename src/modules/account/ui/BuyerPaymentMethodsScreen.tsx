import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import {
  BUYER_BANKS,
  BUYER_PAYMENT_META,
  buyerHint,
  type BuyerPaymentKind,
} from '../domain/buyer-payment';
import { useBuyerPaymentStore } from '../state/buyer-payment-store';
import { colors } from '@/shared/theme/colors';

const KINDS: BuyerPaymentKind[] = ['truemoney', 'promptpay', 'bank_account', 'card', 'boommall_pay'];

export function BuyerPaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string }>();
  const instruments = useBuyerPaymentStore((s) => s.instruments);
  const upsert = useBuyerPaymentStore((s) => s.upsert);
  const remove = useBuyerPaymentStore((s) => s.remove);

  const [editing, setEditing] = useState<BuyerPaymentKind | null>(null);
  const [accountNo, setAccountNo] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState<(typeof BUYER_BANKS)[number] | ''>('');

  const byKind = useMemo(() => new Map(instruments.map((a) => [a.kind, a])), [instruments]);

  const openEdit = (kind: BuyerPaymentKind) => {
    const row = byKind.get(kind);
    setAccountNo(row?.accountNo ?? row?.last4 ?? '');
    setAccountName(row?.accountName ?? '');
    setBankName((row?.bankName as (typeof BUYER_BANKS)[number]) ?? '');
    setEditing(kind);
  };

  useEffect(() => {
    const kind = params.kind;
    if (kind && KINDS.includes(kind as BuyerPaymentKind)) openEdit(kind as BuyerPaymentKind);
    // open once from deep link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.kind]);

  const save = () => {
    if (!editing) return;
    const result = upsert({ kind: editing, accountNo, accountName, bankName: bankName || undefined });
    if (!result.ok) {
      Alert.alert('ยังบันทึกไม่ได้', result.reason);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(null);
  };

  const activateSimple = (kind: BuyerPaymentKind) => {
    const result = upsert({ kind });
    if (!result.ok) {
      Alert.alert('ยังเปิดไม่ได้', result.reason);
      return;
    }
    void Haptics.selectionAsync();
  };

  const confirmRemove = (kind: BuyerPaymentKind) => {
    const row = byKind.get(kind);
    if (!row) return;
    Alert.alert('ลบช่องทางนี้?', BUYER_PAYMENT_META[kind].title, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          remove(row.id);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>ช่องทางชำระเงิน</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.lead}>เพิ่มช่องทางชำระเงินเพื่อความสะดวกในการสั่งซื้อสินค้า</Text>

        {KINDS.map((kind) => {
          const meta = BUYER_PAYMENT_META[kind];
          const row = byKind.get(kind);
          return (
            <View key={kind} style={styles.card}>
              <View style={[styles.iconWrap, row && styles.iconWrapOn]}>
                <Ionicons name={meta.icon} size={22} color={row ? '#EE4D2D' : colors.text.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{meta.title}</Text>
                <Text style={styles.cardSub}>{row ? buyerHint(row) ?? 'พร้อมใช้' : 'ยังไม่ได้สมัคร'}</Text>
              </View>
              {row ? (
                <>
                  {meta.needsDetails ? (
                    <Pressable style={styles.editBtn} onPress={() => openEdit(kind)}>
                      <Text style={styles.editText}>แก้</Text>
                    </Pressable>
                  ) : null}
                  <Pressable hitSlop={8} onPress={() => confirmRemove(kind)}>
                    <Ionicons name="trash-outline" size={18} color={colors.brand.pink} />
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={styles.enrollBtn}
                  onPress={() => (meta.needsDetails ? openEdit(kind) : activateSimple(kind))}
                >
                  <Text style={styles.enrollText}>สมัคร</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={editing != null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <DragDownDismiss onDismiss={() => setEditing(null)} showDim rootInModal style={{ flex: 1, justifyContent: 'flex-end' }}>
          {editing ? (
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>{BUYER_PAYMENT_META[editing].title}</Text>
              <Text style={styles.sheetHint}>{BUYER_PAYMENT_META[editing].hint}</Text>

              {editing === 'bank_account' ? (
                <>
                  <Text style={styles.fieldLabel}>ธนาคาร</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banks}>
                    {BUYER_BANKS.map((b) => (
                      <Pressable
                        key={b}
                        style={[styles.bankChip, bankName === b && styles.bankChipOn]}
                        onPress={() => setBankName(b)}
                      >
                        <Text style={[styles.bankChipText, bankName === b && styles.bankChipTextOn]}>{b}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  <Text style={styles.fieldLabel}>ชื่อบัญชี</Text>
                  <TextInput
                    style={styles.input}
                    value={accountName}
                    onChangeText={setAccountName}
                    placeholder="ชื่อเจ้าของบัญชี"
                    placeholderTextColor={colors.text.muted}
                  />
                </>
              ) : null}

              {BUYER_PAYMENT_META[editing].needsDetails ? (
                <>
                  <Text style={styles.fieldLabel}>
                    {editing === 'truemoney'
                      ? 'เบอร์ TrueMoney'
                      : editing === 'promptpay'
                        ? 'เลขพร้อมเพย์'
                        : editing === 'card'
                          ? 'เลขบัตร'
                          : 'เลขบัญชี'}
                  </Text>
                  <TextInput
                    style={styles.input}
                    value={accountNo}
                    onChangeText={setAccountNo}
                    keyboardType="number-pad"
                    placeholder={editing === 'card' ? 'เก็บแค่ 4 ตัวท้าย' : '0812345678'}
                    placeholderTextColor={colors.text.muted}
                  />
                </>
              ) : null}

              <Pressable style={styles.saveBtn} onPress={save}>
                <Text style={styles.saveText}>บันทึกช่องทาง</Text>
              </Pressable>
            </View>
          ) : null}
        </DragDownDismiss>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  lead: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 20,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOn: { backgroundColor: 'rgba(238,77,45,0.1)' },
  cardTitle: { fontWeight: '800', fontSize: 15, color: colors.text.primary },
  cardSub: { color: colors.text.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  enrollBtn: {
    backgroundColor: '#EE4D2D',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  enrollText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  editText: { fontWeight: '800', fontSize: 12, color: colors.text.primary },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text.primary },
  sheetHint: { color: colors.text.secondary, fontSize: 13, marginTop: 4, marginBottom: 14 },
  fieldLabel: { fontWeight: '800', fontSize: 12, color: colors.text.muted, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: colors.surface.canvas,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  banks: { gap: 8, paddingBottom: 4 },
  bankChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface.canvas,
  },
  bankChipOn: { backgroundColor: 'rgba(238,77,45,0.1)' },
  bankChipText: { fontWeight: '800', fontSize: 12, color: colors.text.secondary },
  bankChipTextOn: { color: '#EE4D2D' },
  saveBtn: {
    marginTop: 18,
    backgroundColor: '#EE4D2D',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  saveText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
