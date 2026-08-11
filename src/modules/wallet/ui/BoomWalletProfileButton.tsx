import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useBoomTreeStore } from '../state/boom-tree-store';
import { BoomTreeView } from './BoomTreeView';
import { BoomCoinRewardAnimation } from './BoomCoinRewardAnimation';
import { colors } from '@/shared/theme/colors';

/**
 * Owner Boom Tree strip under profile bio — reward progress only.
 * Wallet balance lives in the profile action button (CoinIcon + amount).
 */
export function BoomWalletProfileButton() {
  const stage = useBoomTreeStore((s) => s.stage);
  const progress = useBoomTreeStore((s) => s.rewardProgress);
  const rewardReady = useBoomTreeStore((s) => s.rewardReady);
  const pendingClaimAmount = useBoomTreeStore((s) => s.pendingClaimAmount);
  const claimReward = useBoomTreeStore((s) => s.claimReward);
  const lastClaimAnimToken = useBoomTreeStore((s) => s.lastClaimAnimToken);
  const setPreviewFixture = useBoomTreeStore((s) => s.setPreviewFixture);
  const [lastClaimAmount, setLastClaimAmount] = useState(1);

  const onTreePress = () => {
    void Haptics.selectionAsync();
    if (rewardReady) {
      Alert.alert('🌳🪙 Boom Tree', `เก็บ ${pendingClaimAmount} Boom Coin`, [
        { text: 'ภายหลัง', style: 'cancel' },
        {
          text: 'เก็บเลย',
          onPress: () => {
            void (async () => {
              const result = await claimReward();
              if (result.ok) {
                setLastClaimAmount(result.amount);
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } else {
                Alert.alert('ยังเก็บไม่ได้', result.reason);
              }
            })();
          },
        },
      ]);
      return;
    }
    Alert.alert(
      `${stage === 'seedling' ? '🌱' : '🌿'} Boom Tree`,
      `${Math.trunc(progress)}%\n\nทำกิจกรรมใน BoomMall เพื่อให้ต้นไม้เติบโต`,
      [
        { text: 'ปิด', style: 'cancel' },
        {
          text: 'Preview States',
          onPress: () =>
            Alert.alert('Boom Tree Preview (Mock)', undefined, [
              { text: '🌱 10%', onPress: () => setPreviewFixture('seedling_10') },
              { text: '🌿 72%', onPress: () => setPreviewFixture('growing_72') },
              { text: '🌳 100%', onPress: () => setPreviewFixture('ready_100') },
              {
                text: '🌳🪙 Ready',
                onPress: () => setPreviewFixture('coin_ready'),
              },
              { text: 'ยกเลิก', style: 'cancel' },
            ]),
        },
      ],
    );
  };

  return (
    <Pressable style={styles.row} onPress={onTreePress}>
      <View style={styles.treeSlot}>
        <BoomTreeView
          stage={stage}
          progress={progress}
          rewardReady={rewardReady}
          size="sm"
          showProgress={false}
        />
        <BoomCoinRewardAnimation token={lastClaimAnimToken} amount={lastClaimAmount} />
      </View>
      <View style={styles.meta}>
        <Text style={styles.title}>Boom Tree</Text>
        <Text style={styles.sub}>
          {rewardReady
            ? 'มีเหรียญให้เก็บ — แตะเพื่อรับ'
            : `${Math.trunc(progress)}% · ทำกิจกรรมเพื่อให้ต้นไม้เติบโต`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 12,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  treeSlot: {
    position: 'relative',
    width: 40,
    alignItems: 'center',
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontWeight: '900',
    fontSize: 13,
    color: colors.text.primary,
  },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
