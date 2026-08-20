import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import type { FeedItem } from '@/modules/feed/domain/types';
import {
  useFeedChromeStore,
  type PlaybackRate,
} from '@/modules/feed/state/feed-chrome-store';

type Props = {
  visible: boolean;
  item: FeedItem | null;
  isOwnPost?: boolean;
  canReport?: boolean;
  saved?: boolean;
  onClose: () => void;
  onEditPost?: () => void;
  onDeletePost?: () => void;
  onInterested?: () => void;
  onNotInterested: () => void;
  onSave?: () => void;
  onReport: () => void;
  onShare: () => void;
};

const RATES: PlaybackRate[] = [0.5, 1, 1.5, 2];

export function FeedLongPressSheet({
  visible,
  item,
  isOwnPost = false,
  canReport = true,
  saved = false,
  onClose,
  onEditPost,
  onDeletePost,
  onInterested,
  onNotInterested,
  onSave,
  onReport,
  onShare,
}: Props) {
  const insets = useSafeAreaInsets();
  const playbackRate = useFeedChromeStore((s) => s.playbackRate);
  const autoAdvance = useFeedChromeStore((s) => s.autoAdvance);
  const originalSound = useFeedChromeStore((s) => s.originalSound);
  const captionsEnabled = useFeedChromeStore((s) => s.captionsEnabled);
  const setPlaybackRate = useFeedChromeStore((s) => s.setPlaybackRate);
  const setChromeHidden = useFeedChromeStore((s) => s.setChromeHidden);
  const setAutoAdvance = useFeedChromeStore((s) => s.setAutoAdvance);
  const setCaptionsEnabled = useFeedChromeStore((s) => s.setCaptionsEnabled);
  const setOriginalSound = useFeedChromeStore((s) => s.setOriginalSound);
  const [moreOpen, setMoreOpen] = useState(false);
  const hasCaptions = Boolean(item?.overlayText?.trim());

  useEffect(() => {
    if (!visible) setMoreOpen(false);
  }, [visible]);

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <DragDownDismiss
        onDismiss={onClose}
        showDim
        rootInModal
        rootStyle={styles.dismissRoot}
      >
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />

          {isOwnPost && onEditPost ? (
            <View style={styles.group}>
              <MenuRow
                icon="create-outline"
                label="แก้ไขโพสต์"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onEditPost();
                }}
              />
              {onDeletePost ? (
                <>
                  <View style={styles.divider} />
                  <MenuRow
                    icon="trash-outline"
                    label="ลบโพสต์"
                    destructive
                    onPress={() => {
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      onDeletePost();
                    }}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          <View style={styles.group}>
            {onInterested ? (
              <>
                <MenuRow
                  icon="add-circle-outline"
                  label="สนใจ"
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onInterested();
                  }}
                />
                <View style={styles.divider} />
              </>
            ) : null}
            <MenuRow
              icon="remove-circle-outline"
              label="ไม่สนใจ"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onNotInterested();
              }}
            />
          </View>

          <View style={styles.group}>
            {onSave ? (
              <>
                <MenuRow
                  icon={saved ? 'bookmark' : 'bookmark-outline'}
                  label={saved ? 'ยกเลิกการบันทึก' : 'บันทึกโพสต์'}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onSave();
                  }}
                />
                <View style={styles.divider} />
              </>
            ) : null}
            {canReport ? (
              <>
                <MenuRow
                  icon="chatbubble-ellipses-outline"
                  label="รายงานปัญหาทางรูปภาพ"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onReport();
                  }}
                />
                <View style={styles.divider} />
              </>
            ) : null}
            <MenuRow
              icon="arrow-redo-outline"
              label="แชร์"
              onPress={() => {
                void Haptics.selectionAsync();
                onShare();
              }}
            />
            <View style={styles.divider} />
            <MenuRow
              icon="ellipsis-horizontal"
              label="ตัวเลือกเพิ่มเติม"
              chevron
              expanded={moreOpen}
              onPress={() => {
                void Haptics.selectionAsync();
                setMoreOpen((v) => !v);
              }}
            />
          </View>

          {moreOpen ? (
            <View style={styles.group}>
              <View style={styles.row}>
                <Ionicons name="speedometer-outline" size={22} color={colors.text.primary} />
                <Text style={styles.rowLabel}>ความเร็ว</Text>
                <View style={styles.seg}>
                  {RATES.map((rate) => {
                    const on = playbackRate === rate;
                    return (
                      <Pressable
                        key={rate}
                        style={[styles.segBtn, on && styles.segBtnOn]}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setPlaybackRate(rate);
                        }}
                      >
                        <Text style={[styles.segText, on && styles.segTextOn]}>{rate.toFixed(1)}x</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.divider} />
              <MenuRow
                icon="expand-outline"
                label="เคลียร์หน้าจอ"
                onPress={() => {
                  setChromeHidden(true);
                  onClose();
                }}
              />
              <View style={styles.divider} />
              <MenuRow
                icon="arrow-up-outline"
                label="เลื่อนอัตโนมัติ"
                trailing={
                  <Switch
                    value={autoAdvance}
                    onValueChange={(v) => {
                      void Haptics.selectionAsync();
                      setAutoAdvance(v);
                    }}
                    trackColor={{ false: '#D1D5DB', true: colors.brand.primaryDark }}
                  />
                }
              />
              <View style={styles.divider} />
              <MenuRow
                icon="text-outline"
                label="คำบรรยายและการแปล"
                trailing={
                  <Text style={styles.hint}>
                    {!hasCaptions ? 'ยังไม่มี' : captionsEnabled ? 'เปิด' : 'ปิด'}
                  </Text>
                }
                onPress={() => {
                  if (!hasCaptions) return;
                  void Haptics.selectionAsync();
                  setCaptionsEnabled(!captionsEnabled);
                }}
              />
              <View style={styles.divider} />
              <MenuRow
                icon="headset-outline"
                label="เสียงประกอบ"
                trailing={
                  <Switch
                    value={originalSound}
                    onValueChange={(v) => {
                      void Haptics.selectionAsync();
                      setOriginalSound(v);
                    }}
                    trackColor={{ false: '#D1D5DB', true: colors.brand.primaryDark }}
                  />
                }
              />
            </View>
          ) : null}
        </View>
      </DragDownDismiss>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  trailing,
  chevron,
  expanded,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  chevron?: boolean;
  expanded?: boolean;
  destructive?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress && !trailing}>
      <Ionicons name={icon} size={22} color={destructive ? '#DC2626' : colors.text.primary} />
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>{label}</Text>
      {trailing}
      {chevron ? (
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color="#C7C7CC"
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dismissRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#E9EBEE',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C5C7CB',
    marginBottom: 6,
  },
  group: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginLeft: 50,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text.primary },
  rowLabelDestructive: { color: '#DC2626' },
  hint: { fontSize: 13, color: colors.text.secondary, fontWeight: '600' },
  seg: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  segBtnOn: { backgroundColor: colors.text.primary },
  segText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  segTextOn: { color: '#fff' },
});
