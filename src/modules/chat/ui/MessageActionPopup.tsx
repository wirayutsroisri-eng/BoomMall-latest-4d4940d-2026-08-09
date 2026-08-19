import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { isCurrentChatUser } from '@/modules/chat/data/chatRealtimeApi';
import type { ChatMessage } from '@/modules/chat/domain/types';

export type MessageActionKey =
  | 'copy'
  | 'forward'
  | 'favorite'
  | 'edit'
  | 'delete'
  | 'select'
  | 'quote'
  | 'remind'
  | 'open'
  | 'search';

type Item = {
  key: MessageActionKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export function actionsForMessage(message: ChatMessage): Item[] {
  const mine = isCurrentChatUser(message.senderId);
  const items: Item[] = [];
  if (message.kind === 'text' && message.text) {
    items.push({ key: 'copy', label: 'คัดลอก', icon: 'copy-outline' });
  }
  items.push(
    { key: 'forward', label: 'ส่งต่อ', icon: 'arrow-redo-outline' },
    {
      key: 'favorite',
      label: 'รายการโปรด',
      icon: message.isFavorite ? 'cube' : 'cube-outline',
    },
  );
  if (mine && message.kind === 'text') {
    items.push({ key: 'edit', label: 'แก้ไข', icon: 'create-outline' });
  }
  items.push(
    { key: 'delete', label: 'ลบ', icon: 'trash-outline' },
    { key: 'select', label: 'เลือก', icon: 'list-outline' },
    { key: 'quote', label: 'อ้างอิง', icon: 'chatbox-ellipses-outline' },
    {
      key: 'remind',
      label: 'การแจ้ง\nเตือน',
      icon: message.isReminded ? 'notifications' : 'notifications-outline',
    },
  );
  if (message.kind === 'image' || message.kind === 'file') {
    items.push({ key: 'open', label: 'เปิด', icon: 'open-outline' });
  }
  items.push({ key: 'search', label: 'ค้นหา', icon: 'search-outline' });
  return items;
}

type Props = {
  visible: boolean;
  message: ChatMessage | null;
  onClose: () => void;
  onAction: (key: MessageActionKey, message: ChatMessage) => void;
};

export function MessageActionPopup({ visible, message, onClose, onAction }: Props) {
  const items = message ? actionsForMessage(message) : [];
  const dragY = useSharedValue(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finishClose = () => {
    dragY.value = 0;
    onCloseRef.current();
  };

  useEffect(() => {
    if (!visible) dragY.value = 0;
  }, [visible, dragY]);

  const tapBackdrop = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        runOnJS(finishClose)();
      }),
    [],
  );

  const panCard = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(12)
        .failOffsetX([-24, 24])
        .onUpdate((e) => {
          dragY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (dragY.value > 56 || e.velocityY > 900) {
            dragY.value = withTiming(220, { duration: 140 }, (done) => {
              if (done) runOnJS(finishClose)();
            });
          } else {
            dragY.value = withTiming(0, { duration: 160 });
          }
        }),
    [dragY],
  );

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={finishClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <GestureDetector gesture={tapBackdrop}>
          <View style={styles.backdrop} accessibilityLabel="ปิดเมนู" />
        </GestureDetector>
        <GestureDetector gesture={panCard}>
          <Animated.View style={[styles.card, cardStyle]}>
            <View style={styles.grid}>
              {chunk(items, 5).map((row, rowIndex) => (
                <View key={rowIndex} style={[styles.row, rowIndex > 0 && styles.rowDivider]}>
                  {row.map((item) => (
                    <Pressable
                      key={item.key}
                      style={styles.cell}
                      onPress={() => {
                        if (!message) return;
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        finishClose();
                        onAction(item.key, message);
                      }}
                    >
                      <Ionicons name={item.icon} size={22} color="#FFFFFF" />
                      <Text style={styles.label} numberOfLines={2}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function chunk<T>(list: T[], size: number) {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: 'rgba(58, 58, 60, 0.96)',
    borderRadius: 14,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 6,
    width: 332,
    zIndex: 2,
  },
  grid: {
    width: 320,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
    marginTop: 4,
    paddingTop: 8,
  },
  cell: {
    width: 64,
    alignItems: 'center',
    paddingVertical: 8,
    minHeight: 64,
    gap: 6,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
