import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useBoomWalletStore } from '@/modules/wallet/state/boom-wallet-store';
import { useBoomTreeStore } from '@/modules/wallet/state/boom-tree-store';
import { BOOM_COIN_SYMBOL } from '@/modules/wallet/domain/boom-coin';
import { describeTx } from '@/modules/wallet/services/WalletDomain';
import { formatCoinBalance } from '@/modules/wallet/domain/boom-coin';
import { BoomTreeView } from './BoomTreeView';
import { BoomCoinBalanceView } from './BoomCoinBalanceView';
import { BoomCoinRewardPopup } from './BoomCoinRewardPopup';
import { BoomCoinRewardAnimation } from './BoomCoinRewardAnimation';
import { colors } from '@/shared/theme/colors';
import { ENABLE_BOOM_COIN_PURCHASE_UI } from '@/shared/compliance/appStoreGates';

function groupByDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'วันนี้';
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export function BoomWalletScreen() {
  const insets = useSafeAreaInsets();
  const available = useBoomWalletStore((s) => s.available);
  const history = useBoomWalletStore((s) => s.history);
  const refresh = useBoomWalletStore((s) => s.refresh);
  const previewTopUp = useBoomWalletStore((s) => s.previewTopUp);
  const enablePin = useBoomWalletStore((s) => s.enablePin);
  const profileId = useBoomWalletStore((s) => s.profileId);
  const stage = useBoomTreeStore((s) => s.stage);
  const progress = useBoomTreeStore((s) => s.rewardProgress);
  const rewardReady = useBoomTreeStore((s) => s.rewardReady);
  const claimReward = useBoomTreeStore((s) => s.claimReward);
  const pendingClaimAmount = useBoomTreeStore((s) => s.pendingClaimAmount);
  const lastClaimAnimToken = useBoomTreeStore((s) => s.lastClaimAnimToken);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastClaimAmount, setLastClaimAmount] = useState(1);

  const walletId = `wlt_${profileId}`;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof history>();
    for (const tx of history) {
      const key = groupByDay(tx.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    }
    return [...map.entries()];
  }, [history]);

  const requireStepUp = async (): Promise<boolean> => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'ยืนยันตัวตนเพื่อเคลื่อนย้าย Boom Coin',
        cancelLabel: 'ยกเลิก',
        disableDeviceFallback: false,
      });
      if (result.success) return true;
    }
    return await new Promise((resolve) => {
      Alert.prompt(
        'Wallet PIN',
        'กรอก PIN 6 หลัก (Preview — ตั้งได้จากความปลอดภัย)',
        [
          { text: 'ยกเลิก', style: 'cancel', onPress: () => resolve(false) },
          {
            text: 'ยืนยัน',
            onPress: (pin?: string) => {
              if (pin && /^\d{6}$/.test(pin)) {
                try {
                  enablePin(pin);
                } catch {
                  /* already set */
                }
                resolve(true);
              } else resolve(false);
            },
          },
        ],
        'secure-text',
      );
    });
  };

  const onPay = async () => {
    const ok = await requireStepUp();
    if (!ok) return;
    Alert.alert('จ่าย', 'Commerce checkout จะล็อก Coin ผ่าน Ledger (Phase 6 Preview hook พร้อมแล้ว)');
  };

  const onTransfer = async () => {
    const ok = await requireStepUp();
    if (!ok) return;
    Alert.alert('โอน', 'โอนภายใน BoomMall เท่านั้น — external_transfer_enabled=false');
  };

  const onReceive = () => {
    void Haptics.selectionAsync();
    Alert.alert('รับ Coin', 'แชร์โปรไฟล์เพื่อให้คนอื่นกด 🪙 สนับสนุนคุณ');
  };

  const onTopUpPreview = async () => {
    const ok = await requireStepUp();
    if (!ok) return;
    const result = previewTopUp(100);
    void Haptics.notificationAsync(
      result.ok
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
    Alert.alert(
      result.ok ? 'เติมจาก Treasury (Preview)' : 'ไม่สำเร็จ',
      result.ok
        ? `+100 ${BOOM_COIN_SYMBOL} จาก PLATFORM_TREASURY (ไม่ใช่เงินจริง)`
        : 'เติมไม่สำเร็จ',
    );
    refresh();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle}>Boom Wallet</Text>
        <Pressable hitSlop={10} onPress={() => router.push('/wallet/security')}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.text.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceEmoji}>{BOOM_COIN_SYMBOL}</Text>
          <BoomCoinBalanceView
            balance={available}
            animToken={lastClaimAnimToken}
            size="lg"
            tone="onDark"
          />
          <Text style={styles.balanceUnit}>Boom Coin</Text>
          <Text style={styles.balanceHint}>
            ใช้ได้ภายใน BoomMall เท่านั้น · ไม่แลกเป็นเงินสด
          </Text>
          <Text style={styles.previewBadge}>Preview / Test — ไม่ใช่เงินจริง · ห้ามถอนออก</Text>
        </View>

        <View style={styles.treeCard}>
          <View style={{ position: 'relative', alignItems: 'center' }}>
            <BoomTreeView
              stage={stage}
              progress={progress}
              rewardReady={rewardReady}
              size="md"
              showProgress
              onPress={() => {
                void Haptics.selectionAsync();
                if (rewardReady) {
                  void (async () => {
                    const result = await claimReward();
                    if (result.ok) {
                      setLastClaimAmount(result.amount);
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                  })();
                  return;
                }
                Alert.alert(
                  'Boom Tree',
                  `${Math.trunc(progress)}%\nทำกิจกรรมใน BoomMall เพื่อให้ต้นไม้เติบโต`,
                );
              }}
            />
            <BoomCoinRewardAnimation token={lastClaimAnimToken} amount={lastClaimAmount} />
          </View>
          <Text style={styles.treeHint}>
            {rewardReady
              ? `มีเหรียญให้เก็บ · แตะต้นไม้เพื่อรับ ${pendingClaimAmount} 🪙`
              : 'ต้นไม้สะสม Reward — ไม่ใช่ดอกเบี้ยหรือ Wallet แยก'}
          </Text>
        </View>

        <View style={styles.actions}>
          {[
            { label: 'ใช้ Coin', icon: 'card-outline' as const, onPress: onPay },
            { label: 'โอน', icon: 'swap-horizontal-outline' as const, onPress: onTransfer },
            { label: 'รับ Coin', icon: 'download-outline' as const, onPress: onReceive },
            { label: 'ประวัติ', icon: 'time-outline' as const, onPress: () => refresh() },
            {
              label: 'ความปลอดภัย',
              icon: 'lock-closed-outline' as const,
              onPress: () => router.push('/wallet/security'),
            },
          ].map((a) => (
            <Pressable key={a.label} style={styles.actionBtn} onPress={() => void a.onPress()}>
              <View style={styles.actionIcon}>
                <Ionicons name={a.icon} size={20} color={colors.brand.primaryDark} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {ENABLE_BOOM_COIN_PURCHASE_UI ? (
          <Pressable style={styles.topUpBtn} onPress={() => void onTopUpPreview()}>
            <Text style={styles.topUpText}>เติม +100 จาก Treasury (Preview เท่านั้น)</Text>
          </Pressable>
        ) : null}

        {grouped.map(([day, rows]) => (
          <View key={day} style={styles.dayBlock}>
            <Text style={styles.dayTitle}>{day}</Text>
            {rows.map((tx) => {
              const desc = describeTx(tx, walletId);
              const open = selectedId === tx.id;
              return (
                <Pressable
                  key={tx.id}
                  style={styles.txRow}
                  onPress={() => setSelectedId(open ? null : tx.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txLabel}>{desc.label}</Text>
                    <Text style={styles.txMeta}>{tx.type} · {tx.status}</Text>
                    {open ? (
                      <Text style={styles.txDetail}>
                        id: {tx.id}{'\n'}
                        hash: {tx.recordHash.slice(0, 12)}…{'\n'}
                        idempotency: {tx.idempotencyKey}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.txAmount, desc.sign === '+' ? styles.plus : styles.minus]}>
                    {desc.sign}
                    {tx.amount}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <BoomCoinRewardPopup />
    </View>
  );
}

/** Alias per architecture checklist. */
export const BoomWalletView = BoomWalletScreen;

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
  balanceCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.brand.ink,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  balanceEmoji: { fontSize: 36 },
  balanceUnit: {
    marginTop: 4,
    color: colors.brand.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  balanceHint: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  previewBadge: {
    marginTop: 10,
    color: colors.accent.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  treeCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
    gap: 6,
  },
  treeHint: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 8,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 18,
    gap: 10,
  },
  actionBtn: { width: '30%', alignItems: 'center', gap: 6, marginBottom: 8 },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, fontWeight: '700', color: colors.text.primary },
  topUpBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  topUpText: { fontWeight: '800', color: colors.brand.primaryDark, fontSize: 13 },
  dayBlock: { paddingHorizontal: 16, marginBottom: 16 },
  dayTitle: { fontWeight: '900', fontSize: 15, color: colors.text.primary, marginBottom: 8 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border.soft,
    gap: 10,
  },
  txLabel: { fontWeight: '800', color: colors.text.primary, fontSize: 14 },
  txMeta: { color: colors.text.muted, fontSize: 11, marginTop: 2 },
  txDetail: { marginTop: 8, color: colors.text.secondary, fontSize: 11, lineHeight: 16 },
  txAmount: { fontWeight: '900', fontSize: 16 },
  plus: { color: colors.brand.primaryDark },
  minus: { color: colors.brand.pink },
});
