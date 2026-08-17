import React, { useState } from 'react';
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { PAYOUT_KIND_META, THAI_BANKS, maskAccountNo } from '../domain/payout-accounts';
import { useSellerWithdrawStore, type WithdrawDestination } from '../state/seller-withdraw-store';
import { colors } from '@/shared/theme/colors';

const KINDS: WithdrawDestination['kind'][] = ['promptpay', 'bank_account'];

export function SellerPayoutScreen() {
  const insets = useSafeAreaInsets();
  const destination = useSellerWithdrawStore((s) => s.destination);
  const setDestination = useSellerWithdrawStore((s) => s.setDestination);
  const clearDestination = useSellerWithdrawStore((s) => s.clearDestination);

  const [editing, setEditing] = useState<WithdrawDestination['kind'] | null>(null);
  const [accountNo, setAccountNo] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState<(typeof THAI_BANKS)[number] | ''>('');

  const openEdit = (kind: WithdrawDestination['kind']) => {
    setAccountNo(destination?.kind === kind ? destination.accountNo : '');
    setAccountName(destination?.kind === kind ? destination.accountName ?? '' : '');
    setBankName(
      destination?.kind === kind ? ((destination.bankName as (typeof THAI_BANKS)[number]) ?? '') : '',
    );
    setEditing(kind);
  };

  const save = () => {
    if (!editing) return;
    const result = setDestination({
      kind: editing,
      accountNo,
      accountName,
      bankName: bankName || undefined,
    });
    if (!result.ok) {
      Alert.alert('ยังบันทึกไม่ได้', result.reason);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(null);
  };

  const confirmClear = () => {
    if (!destination) return;
    Alert.alert('ลบบัญชีถอนนี้?', PAYOUT_KIND_META[destination.kind].title, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          clearDestination();
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
        <Text style={styles.headerTitle}>บัญชีถอนเงิน</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        <Text style={styles.lead}>
          บัญชีนี้ใช้ถอนยอดสุทธิจากแพลตฟอร์มหลังหัก GP ไม่ใช่ช่องทางให้ลูกค้าโอนตรง
        </Text>

        {KINDS.map((kind) => {
          const meta = PAYOUT_KIND_META[kind];
          const on = destination?.kind === kind;
          const detail = on
            ? kind === 'promptpay'
              ? maskAccountNo(destination.accountNo)
              : `${destination.bankName ?? ''} ${maskAccountNo(destination.accountNo)}`.trim()
            : 'ยังไม่ได้ใส่';
          return (
            <View key={kind} style={styles.card}>
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Ionicons
                  name={meta.icon}
                  size={22}
                  color={on ? colors.brand.primaryDark : colors.text.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{meta.title}</Text>
                <Text style={styles.cardSub}>{detail}</Text>
              </View>
              <Pressable style={styles.editBtn} onPress={() => openEdit(kind)}>
                <Text style={styles.editText}>{on ? 'แก้' : 'ใส่'}</Text>
              </Pressable>
              {on ? (
                <Pressable hitSlop={8} onPress={confirmClear}>
                  <Ionicons name="trash-outline" size={18} color={colors.brand.pink} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={editing != null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <DragDownDismiss onDismiss={() => setEditing(null)} showDim rootInModal style={{ flex: 1, justifyContent: 'flex-end' }}>
          {editing ? (
            <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.handle} />
              <Text style={styles.sheetTitle}>{PAYOUT_KIND_META[editing].title}</Text>
              <Text style={styles.sheetHint}>{PAYOUT_KIND_META[editing].hint}</Text>

              {editing === 'bank_account' ? (
                <>
                  <Text style={styles.fieldLabel}>ธนาคาร</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.banks}>
                    {THAI_BANKS.map((b) => (
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

              <Text style={styles.fieldLabel}>{editing === 'promptpay' ? 'เลขพร้อมเพย์' : 'เลขบัญชี'}</Text>
              <TextInput
                style={styles.input}
                value={accountNo}
                onChangeText={setAccountNo}
                keyboardType="number-pad"
                placeholder={editing === 'promptpay' ? '0812345678' : 'xxx-x-xxxxx-x'}
                placeholderTextColor={colors.text.muted}
              />

              <Pressable style={styles.saveBtn} onPress={save}>
                <Text style={styles.saveText}>บันทึกบัญชีถอน</Text>
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
  iconWrapOn: { backgroundColor: colors.brand.mist },
  cardTitle: { fontWeight: '800', fontSize: 15, color: colors.text.primary },
  cardSub: { color: colors.text.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
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
  bankChipOn: { backgroundColor: colors.brand.mist },
  bankChipText: { fontWeight: '800', fontSize: 12, color: colors.text.secondary },
  bankChipTextOn: { color: colors.brand.primaryDark },
  saveBtn: {
    marginTop: 18,
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  saveText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
