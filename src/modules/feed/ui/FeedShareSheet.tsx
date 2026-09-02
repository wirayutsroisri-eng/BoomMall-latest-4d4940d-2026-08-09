import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import type { FeedItem } from '@/modules/feed/domain/types';
import {
  shareFeedToChannel,
  type FeedShareChannel,
} from '@/modules/feed/domain/share-clip';
import { trackFeedSignal } from '@/modules/feed/data/feedEventQueue';

type Props = {
  visible: boolean;
  item: FeedItem | null;
  onClose: () => void;
  onShared: (item: FeedItem) => void;
};

const CHANNELS: Array<{
  id: FeedShareChannel;
  label: string;
  color: string;
  icon?: keyof typeof Ionicons.glyphMap;
  glyph?: string;
}> = [
  { id: 'line', label: 'LINE', color: '#06C755', glyph: 'LINE' },
  { id: 'messenger', label: 'Messenger', color: '#0084FF', icon: 'chatbubbles' },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: 'logo-whatsapp' },
  { id: 'facebook', label: 'Facebook', color: '#1877F2', icon: 'logo-facebook' },
  { id: 'copy', label: 'คัดลอกลิงก์', color: '#2E8CFF', icon: 'link' },
  { id: 'more', label: 'อื่นๆ', color: '#E8EEEC', icon: 'ellipsis-horizontal' },
];

export function FeedShareSheet({ visible, item, onClose, onShared }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);

  if (!item) return null;

  const run = async (channel: FeedShareChannel) => {
    void Haptics.selectionAsync();
    const result = await shareFeedToChannel(item, channel).catch(() => 'dismissed' as const);
    if (result !== 'dismissed') {
      trackFeedSignal({ itemId: item.id, rootId: item.rootPostId, type: 'engage', action: 'share_link' });
    }
    if (result === 'copied') {
      setCopied(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onShared(item);
      setTimeout(() => setCopied(false), 1600);
      return;
    }
    if (result === 'shared') {
      onShared(item);
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="ปิด" />
          <DragDownDismiss onDismiss={onClose} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>แชร์กับ</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {CHANNELS.map((ch) => {
                const isCopyDone = ch.id === 'copy' && copied;
                return (
                  <Pressable
                    key={ch.id}
                    style={styles.cell}
                    onPress={() => void run(ch.id)}
                    accessibilityLabel={ch.label}
                  >
                    <View
                      style={[
                        styles.circle,
                        { backgroundColor: isCopyDone ? colors.brand.primary : ch.color },
                      ]}
                    >
                      {isCopyDone ? (
                        <Ionicons name="checkmark" size={22} color={colors.brand.ink} />
                      ) : ch.glyph ? (
                        <Text style={styles.glyph}>{ch.glyph}</Text>
                      ) : (
                        <Ionicons
                          name={ch.icon ?? 'share-outline'}
                          size={22}
                          color={ch.id === 'more' ? colors.text.primary : '#fff'}
                        />
                      )}
                    </View>
                    <Text style={styles.label} numberOfLines={1}>
                      {isCopyDone ? 'คัดลอกแล้ว' : ch.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </DragDownDismiss>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    paddingRight: 8,
  },
  cell: {
    width: 56,
    alignItems: 'center',
    gap: 6,
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
