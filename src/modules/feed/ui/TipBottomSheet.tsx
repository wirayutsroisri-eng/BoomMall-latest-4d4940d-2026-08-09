import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/shared/theme/colors';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useWalletStore } from '@/modules/wallet/state/wallet-store';
import { TIP_PRESETS, TOPUP_PRESETS } from '@/modules/wallet/domain/types';
import { ENABLE_BOOM_COIN_PURCHASE_UI, ENABLE_CONTENT_TIPS } from '@/shared/compliance/appStoreGates';
import { CoinIcon } from './CoinIcon';

type Props = {
  feedId: string | null;
  onDismissed?: () => void;
};

export const TipBottomSheet = forwardRef<BottomSheetModal, Props>(
  function TipBottomSheet({ feedId, onDismissed }, ref) {
    const insets = useSafeAreaInsets();
    const items = useFeedStore((s) => s.items);
    const tipClip = useFeedStore((s) => s.tipClip);
    const closeTip = useFeedStore((s) => s.closeTip);
    const balance = useWalletStore((s) => s.balance);
    const tip = useWalletStore((s) => s.tip);
    const topUp = useWalletStore((s) => s.topUp);
    const [amount, setAmount] = useState<(typeof TIP_PRESETS)[number]>(10);
    const [busy, setBusy] = useState(false);

    const snapPoints = useMemo(() => ['48%'], []);
    const item = useMemo(
      () => (feedId ? items.find((i) => i.id === feedId) ?? null : null),
      [feedId, items],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} />
      ),
      [],
    );

    const onConfirm = () => {
      if (!ENABLE_CONTENT_TIPS || !item || !feedId || busy) return;
      setBusy(true);
      const result = tip({
        amount,
        feedId,
        toHandle: item.authorHandle,
        toName: item.author,
      });
      if (!result.ok) {
        setBusy(false);
        if (result.reason === 'insufficient') {
          Alert.alert(
            'เหรียญไม่พอ',
            ENABLE_BOOM_COIN_PURCHASE_UI
              ? 'เติม BoomMall Coins ก่อนส่งเหรียญให้ครีเอเตอร์'
              : 'ยังไม่รองรับการเติมเหรียญในเวอร์ชันนี้',
            ENABLE_BOOM_COIN_PURCHASE_UI
              ? [
                  { text: 'ปิด', style: 'cancel' },
                  {
                    text: 'เติม 100',
                    onPress: () => {
                      topUp(100);
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    },
                  },
                ]
              : [{ text: 'ตกลง', style: 'cancel' }],
          );
          return;
        }
        Alert.alert('ส่งไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
        return;
      }

      tipClip(feedId, amount);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBusy(false);
      if (typeof ref !== 'function' && ref?.current) {
        ref.current.dismiss();
      }
    };

    if (!ENABLE_CONTENT_TIPS) {
      return null;
    }

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheet}
        handleIndicatorStyle={styles.handle}
        onDismiss={() => {
          closeTip();
          onDismissed?.();
        }}
      >
        <BottomSheetView style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.headerRow}>
            <CoinIcon size={36} active />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>ส่งเหรียญให้ครีเอเตอร์</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {item ? `${item.author} · @${item.authorHandle.replace(/^@/, '')}` : '—'}
              </Text>
            </View>
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>ยอดในวอลเล็ต</Text>
            <Text style={styles.balanceValue}>{balance.toLocaleString('th-TH')} เหรียญ</Text>
          </View>

          <Text style={styles.sectionLabel}>เลือกจำนวน</Text>
          <View style={styles.presetRow}>
            {TIP_PRESETS.map((n) => {
              const active = amount === n;
              return (
                <Pressable
                  key={n}
                  style={[styles.preset, active && styles.presetActive]}
                  onPress={() => {
                    setAmount(n);
                    void Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.presetText, active && styles.presetTextActive]}>{n}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.sendBtn, (busy || !item) && styles.sendBtnDisabled]}
            onPress={onConfirm}
            disabled={busy || !item}
          >
            <CoinIcon size={22} active />
            <Text style={styles.sendBtnText}>ส่ง {amount} เหรียญ</Text>
          </Pressable>

          {ENABLE_BOOM_COIN_PURCHASE_UI ? (
            <>
              <Text style={styles.topUpHint}>เหรียญไม่พอ? เติมด่วน</Text>
              <View style={styles.topUpRow}>
                {TOPUP_PRESETS.map((n) => (
                  <Pressable
                    key={n}
                    style={styles.topUpChip}
                    onPress={() => {
                      topUp(n);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={styles.topUpChipText}>+{n}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface.sheet,
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  body: {
    paddingHorizontal: 18,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: colors.text.inverse,
    fontSize: 17,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '600',
  },
  balanceCard: {
    backgroundColor: 'rgba(201,162,39,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
  },
  balanceValue: {
    marginTop: 2,
    color: colors.accent.warning,
    fontSize: 22,
    fontWeight: '900',
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '800',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  presetActive: {
    backgroundColor: 'rgba(201,162,39,0.28)',
    borderColor: colors.accent.vault,
  },
  presetText: {
    color: colors.text.inverse,
    fontWeight: '900',
    fontSize: 15,
  },
  presetTextActive: {
    color: colors.accent.warning,
  },
  sendBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent.vault,
    borderRadius: 14,
    paddingVertical: 14,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: {
    color: colors.brand.ink,
    fontWeight: '900',
    fontSize: 15,
  },
  topUpHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
  },
  topUpRow: {
    flexDirection: 'row',
    gap: 8,
  },
  topUpChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  topUpChipText: {
    color: colors.text.inverse,
    fontWeight: '800',
    fontSize: 13,
  },
});
