import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  PAYMENT_OPTIONS,
  type PaymentMethodId,
  useCheckoutStore,
} from '@/modules/commerce/state/checkout-store';
import { colors } from '@/shared/theme/colors';
import { ENABLE_CHECKOUT_PLACE_ORDER } from '@/shared/compliance/appStoreGates';

const ORANGE = '#EE4D2D';

const ICONS: Record<PaymentMethodId, keyof typeof Ionicons.glyphMap> = {
  boommall_pay: 'wallet-outline',
  bank_account: 'business-outline',
  card: 'card-outline',
  promptpay: 'qr-code-outline',
  cod: 'cash-outline',
  mobile_banking: 'phone-portrait-outline',
};

export function PaymentMethodScreen() {
  const insets = useSafeAreaInsets();
  const paymentMethod = useCheckoutStore((s) => s.paymentMethod);
  const cardLabel = useCheckoutStore((s) => s.cardLabel);
  const setPaymentMethod = useCheckoutStore((s) => s.setPaymentMethod);

  const primary = PAYMENT_OPTIONS.filter((p) =>
    ['boommall_pay', 'bank_account', 'card'].includes(p.id),
  );
  const other = PAYMENT_OPTIONS.filter(
    (p) => !['boommall_pay', 'bank_account', 'card'].includes(p.id),
  );

  const select = (id: PaymentMethodId) => {
    void Haptics.selectionAsync();
    setPaymentMethod(id, id === 'card' ? cardLabel : undefined);
  };

  const confirm = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  };

  const renderRow = (id: PaymentMethodId, label: string, opts?: { activate?: boolean; subtitle?: string }) => {
    const selected = paymentMethod === id;
    return (
      <Pressable key={id} style={styles.row} onPress={() => select(id)}>
        <Ionicons name={ICONS[id]} size={22} color={selected ? ORANGE : colors.text.secondary} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.label}>{label}</Text>
          <View style={styles.badges}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ส่งฟรี</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>ลด ฿394.00</Text>
            </View>
          </View>
        </View>
        {opts?.activate ? (
          <View style={styles.activateBtn}>
            <Text style={styles.activateText}>เปิดใช้งาน</Text>
          </View>
        ) : null}
        {opts?.subtitle ? <Text style={styles.subtitle}>{opts.subtitle}</Text> : null}
        {selected ? (
          <Ionicons name="checkmark-circle" size={22} color={ORANGE} />
        ) : (
          <View style={styles.radio} />
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={ORANGE} />
        </Pressable>
        <Text style={styles.title}>ช่องทางการชำระเงิน</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <View style={styles.card}>
          {primary.map((p) =>
            renderRow(p.id, p.label, {
              activate: p.activate,
              subtitle: p.id === 'card' ? cardLabel : p.subtitle,
            }),
          )}
          {ENABLE_CHECKOUT_PLACE_ORDER ? (
            <Pressable
              style={styles.row}
              onPress={() =>
                Alert.alert('ผูกบัญชีธนาคาร', 'จะเปิดใช้เมื่อ Payment Gateway พร้อม')
              }
            >
              <Ionicons name="add-circle-outline" size={22} color={colors.text.muted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.text.muted }]}>ผูกบัญชีธนาคาร</Text>
              </View>
              <Text style={styles.bankHint}>SCB · KBank · +7</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.section}>ช่องทางการชำระเงินอื่น</Text>
        <View style={styles.card}>
          {other.map((p) => renderRow(p.id, p.label))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.confirmBtn} onPress={confirm}>
          <Text style={styles.confirmText}>ยืนยัน</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F5F4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '900', color: colors.text.primary },
  card: {
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '900',
    color: colors.text.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  label: { fontSize: 13, fontWeight: '800', color: colors.text.primary },
  badges: { flexDirection: 'row', gap: 4 },
  badge: {
    backgroundColor: '#FFECE8',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: { color: ORANGE, fontSize: 9, fontWeight: '900' },
  activateBtn: {
    borderWidth: 1,
    borderColor: ORANGE,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activateText: { color: ORANGE, fontSize: 11, fontWeight: '900' },
  subtitle: { fontSize: 12, fontWeight: '700', color: colors.text.secondary, marginRight: 4 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border.strong,
  },
  bankHint: { fontSize: 11, color: colors.text.muted, fontWeight: '700' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
  },
  confirmBtn: {
    backgroundColor: ORANGE,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 14,
  },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
