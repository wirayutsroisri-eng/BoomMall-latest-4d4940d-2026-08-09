import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  PAYMENT_OPTIONS,
  type PaymentMethodId,
  useCheckoutStore,
} from '@/modules/commerce/state/checkout-store';
import { useBuyerPaymentStore } from '@/modules/account/state/buyer-payment-store';
import { buyerHint, type BuyerPaymentKind } from '@/modules/account/domain/buyer-payment';
import { colors } from '@/shared/theme/colors';

const ORANGE = '#EE4D2D';

const ICONS: Record<PaymentMethodId, keyof typeof Ionicons.glyphMap> = {
  boommall_pay: 'wallet-outline',
  bank_account: 'business-outline',
  card: 'card-outline',
  promptpay: 'qr-code-outline',
  cod: 'cash-outline',
  mobile_banking: 'phone-portrait-outline',
  truemoney: 'phone-portrait-outline',
};

const KIND_BY_METHOD: Partial<Record<PaymentMethodId, BuyerPaymentKind>> = {
  truemoney: 'truemoney',
  promptpay: 'promptpay',
  bank_account: 'bank_account',
  mobile_banking: 'bank_account',
  card: 'card',
  boommall_pay: 'boommall_pay',
};

function enrollKind(id: PaymentMethodId): BuyerPaymentKind | undefined {
  return KIND_BY_METHOD[id];
}

export function PaymentMethodScreen() {
  const insets = useSafeAreaInsets();
  const paymentMethod = useCheckoutStore((s) => s.paymentMethod);
  const setPaymentMethod = useCheckoutStore((s) => s.setPaymentMethod);
  const instruments = useBuyerPaymentStore((s) => s.instruments);
  const byKind = useMemo(() => new Map(instruments.map((a) => [a.kind, a])), [instruments]);

  const ready = (id: PaymentMethodId) => {
    if (id === 'cod') return true;
    const kind = enrollKind(id);
    return kind ? byKind.has(kind) : false;
  };

  useEffect(() => {
    if (!ready(paymentMethod)) setPaymentMethod('cod');
  }, [paymentMethod, setPaymentMethod, instruments]);

  const select = (id: PaymentMethodId) => {
    if (!ready(id)) return;
    void Haptics.selectionAsync();
    setPaymentMethod(id);
  };

  const enroll = (id: PaymentMethodId) => {
    const kind = enrollKind(id);
    router.push({ pathname: '/settings/payments', params: kind ? { kind } : {} });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={ORANGE} />
        </Pressable>
        <Text style={styles.title}>ช่องทางการชำระเงิน</Text>
        <Pressable onPress={() => router.push('/settings/payments')}>
          <Text style={styles.manage}>จัดการ</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>
        <Text style={styles.lead}>จ่ายเข้าบัญชี BoomMall — ร้านเห็นยอดหลังหัก GP ในสมุดบัญชี</Text>
        <View style={styles.card}>
          {PAYMENT_OPTIONS.map((p) => {
            const selected = paymentMethod === p.id;
            const on = ready(p.id);
            const kind = enrollKind(p.id);
            const hint = kind ? buyerHint(byKind.get(kind)) : p.id === 'cod' ? 'จ่ายตอนรับของ' : undefined;
            return (
              <Pressable
                key={p.id}
                style={styles.row}
                onPress={() => (on ? select(p.id) : enroll(p.id))}
              >
                <Ionicons
                  name={ICONS[p.id]}
                  size={22}
                  color={selected ? ORANGE : colors.text.secondary}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.label}>{p.label}</Text>
                  {hint ? <Text style={styles.hint}>{hint}</Text> : null}
                </View>
                {!on && p.activate ? (
                  <View style={styles.enrollBtn}>
                    <Text style={styles.enrollText}>สมัคร</Text>
                  </View>
                ) : selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={ORANGE} />
                ) : (
                  <View style={styles.radio} />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          style={styles.confirmBtn}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.back();
          }}
        >
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
  manage: { fontSize: 13, fontWeight: '800', color: ORANGE },
  lead: {
    marginHorizontal: 12,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 18,
  },
  card: {
    marginHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
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
  hint: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.border.strong,
  },
  enrollBtn: {
    backgroundColor: ORANGE,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  enrollText: { color: '#fff', fontWeight: '800', fontSize: 12 },
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
