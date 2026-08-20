import React, { useMemo } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Avatar } from '@/shared/components/Avatar';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { isCurrentChatUser } from '@/modules/chat/data/chatRealtimeApi';
import { useChatStore } from '@/modules/chat/state/chat-store';
import type { ChatMessage, Conversation } from '@/modules/chat/domain/types';
import { isDaylightHours } from './chatDayNight';

const IOS_RED = '#FF3B30';
const IOS_BLUE = '#007AFF';

type PopupTheme = {
  backdropTint: 'light' | 'dark';
  backdropIntensity: number;
  backdropWash: string;
  previewBg: string;
  menuBg: string;
  menuBlurTint: 'light' | 'dark';
  menuBlurFill: string;
  label: string;
  meta: string;
  incoming: string;
  incomingText: string;
  separator: string;
  press: string;
};

const LIGHT: PopupTheme = {
  backdropTint: 'light',
  backdropIntensity: 36,
  backdropWash: 'rgba(245, 245, 247, 0.72)',
  previewBg: '#FFFFFF',
  menuBg: 'rgba(242, 242, 247, 0.92)',
  menuBlurTint: 'light',
  menuBlurFill: 'rgba(255,255,255,0.72)',
  label: '#000000',
  meta: '#8E8E93',
  incoming: '#E9E9EB',
  incomingText: '#000000',
  separator: 'rgba(60, 60, 67, 0.29)',
  press: 'rgba(0, 0, 0, 0.08)',
};

const DARK: PopupTheme = {
  backdropTint: 'dark',
  backdropIntensity: 52,
  backdropWash: 'rgba(0, 0, 0, 0.42)',
  previewBg: '#1C1C1E',
  menuBg: 'rgba(44, 44, 46, 0.82)',
  menuBlurTint: 'dark',
  menuBlurFill: 'rgba(28, 28, 30, 0.45)',
  label: '#FFFFFF',
  meta: '#8E8E93',
  incoming: '#3A3A3C',
  incomingText: '#FFFFFF',
  separator: 'rgba(84, 84, 88, 0.65)',
  press: 'rgba(255, 255, 255, 0.10)',
};

type Props = {
  visible: boolean;
  conversation: Conversation | null;
  onClose: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
  onDelete: (id: string) => void;
  onBlock: (id: string) => void;
  onOpen: (id: string) => void;
};

type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

function snippet(message: ChatMessage): string {
  switch (message.kind) {
    case 'image':
      return 'รูปภาพ';
    case 'file':
      return message.fileName || 'ไฟล์';
    case 'voice':
      return `ข้อความเสียง ${message.durationSec ?? 0}s`;
    case 'quotation':
      return message.quotation?.title ?? 'ใบเสนอราคา';
    case 'product':
      return message.product?.title ?? 'สินค้า';
    case 'order_ref':
      return message.orderRef ? `ออเดอร์ ${message.orderRef.orderId}` : 'ออเดอร์';
    case 'content_ref':
      return message.contentRef?.title ?? 'คอนเทนต์';
    case 'job_match':
      return message.jobMatch?.header ?? 'งาน';
    default:
      return message.text?.trim() || 'ข้อความ';
  }
}

function isEmojiOnly(text: string) {
  return text.length <= 4 && !/[0-9A-Za-zก-๙]/.test(text);
}

const EMPTY_MESSAGES: ChatMessage[] = [];

/**
 * iOS Haptic Touch context menu — blurred backdrop, conversation preview card,
 * then a frosted action list with labels on the left and SF-style icons on the right.
 */
export function ChatItemActionSheet({
  visible,
  conversation,
  onClose,
  onTogglePin,
  onToggleMute,
  onArchive,
  onMarkRead,
  onMarkUnread,
  onDelete,
  onBlock,
  onOpen,
}: Props) {
  const theme = isDaylightHours() ? LIGHT : DARK;
  const conversationId = conversation?.id;
  const messages = useChatStore((s) =>
    conversationId ? (s.messagesById[conversationId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  );

  const previewMessages = useMemo(() => {
    if (!conversation) return [];
    const recent = messages.slice(-5);
    if (recent.length > 0) return recent;
    return [
      {
        id: 'preview-fallback',
        conversationId: conversation.id,
        senderId: 'peer',
        kind: 'text' as const,
        text: conversation.lastMessage,
        createdAt: conversation.updatedAt,
      } satisfies ChatMessage,
    ];
  }, [conversation, messages]);

  if (!conversation) return null;

  const stamp = previewMessages[0]?.createdAt ?? conversation.updatedAt;

  const items: MenuItem[] = [
    conversation.unread > 0
      ? {
          key: 'read',
          label: 'ระบุว่าอ่านแล้ว',
          icon: 'mail-open-outline',
          onPress: () => onMarkRead(conversation.id),
        }
      : {
          key: 'unread',
          label: 'ระบุว่ายังไม่ได้อ่าน',
          icon: 'mail-unread-outline',
          onPress: () => onMarkUnread(conversation.id),
        },
    {
      key: 'pin',
      label: conversation.isPinned ? 'เลิกปักหมุด' : 'ปักหมุด',
      icon: conversation.isPinned ? 'pin' : 'pin-outline',
      onPress: () => onTogglePin(conversation.id),
    },
    {
      key: 'mute',
      label: conversation.isMuted ? 'เปิดการแจ้งเตือน' : 'ปิดการแจ้งเตือน',
      icon: conversation.isMuted ? 'notifications-outline' : 'notifications-off-outline',
      onPress: () => onToggleMute(conversation.id),
    },
    {
      key: 'archive',
      label: 'จัดเก็บ',
      icon: 'archive-outline',
      onPress: () => onArchive(conversation.id),
    },
    {
      key: 'delete',
      label: 'ลบ',
      icon: 'trash-outline',
      destructive: true,
      onPress: () => onDelete(conversation.id),
    },
    {
      key: 'block',
      label: 'บล็อก',
      icon: 'remove-circle-outline',
      destructive: true,
      onPress: () => onBlock(conversation.id),
    },
  ];

  const run = (fn: () => void) => {
    void Haptics.selectionAsync();
    onClose();
    fn();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <BlurView intensity={theme.backdropIntensity} tint={theme.backdropTint} style={styles.flex}>
          <View pointerEvents="none" style={[styles.wash, { backgroundColor: theme.backdropWash }]} />
          <View style={styles.stage} pointerEvents="box-none">
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityLabel="ปิด"
            />
            <DragDownDismiss onDismiss={onClose} style={styles.stack}>
              <Pressable
                style={[styles.preview, { backgroundColor: theme.previewBg }]}
                onPress={() => run(() => onOpen(conversation.id))}
                accessibilityRole="button"
                accessibilityLabel={`เปิดแชท ${conversation.peerName}`}
              >
                <Text style={[styles.stamp, { color: theme.meta }]}>{stamp}</Text>
                <View style={styles.previewBody}>
                  {previewMessages.map((message) => (
                    <PreviewBubble
                      key={message.id}
                      message={message}
                      conversation={conversation}
                      theme={theme}
                    />
                  ))}
                </View>
              </Pressable>

              <View style={[styles.menu, { backgroundColor: theme.menuBg }]}>
                <BlurView
                  intensity={72}
                  tint={theme.menuBlurTint}
                  style={{ backgroundColor: theme.menuBlurFill }}
                >
                  {items.map((item, i) => (
                    <Pressable
                      key={item.key}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && { backgroundColor: theme.press },
                      ]}
                      onPress={() => run(item.onPress)}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      {i > 0 ? (
                        <View style={[styles.separator, { backgroundColor: theme.separator }]} />
                      ) : null}
                      <Text
                        style={[
                          styles.rowLabel,
                          { color: item.destructive ? IOS_RED : theme.label },
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={item.destructive ? IOS_RED : theme.label}
                      />
                    </Pressable>
                  ))}
                </BlurView>
              </View>
            </DragDownDismiss>
          </View>
        </BlurView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function PreviewBubble({
  message,
  conversation,
  theme,
}: {
  message: ChatMessage;
  conversation: Conversation;
  theme: PopupTheme;
}) {
  const mine = isCurrentChatUser(message.senderId);
  const text = snippet(message);
  const sticker = message.kind === 'text' && isEmojiOnly(text);

  if (message.kind === 'image' && message.imageUri) {
    return (
      <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowPeer]}>
        {!mine ? (
          <Avatar
            uri={conversation.avatarUri}
            initial={conversation.peerName.slice(0, 1)}
            backgroundColor={conversation.avatarColor}
            size={22}
            radius={11}
            borderWidth={0}
          />
        ) : null}
        <Image
          source={{ uri: message.imageUri }}
          style={[styles.previewImage, { backgroundColor: theme.incoming }]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowPeer]}>
      {!mine ? (
        <Avatar
          uri={conversation.avatarUri}
          initial={conversation.peerName.slice(0, 1)}
          backgroundColor={conversation.avatarColor}
          size={22}
          radius={11}
          borderWidth={0}
        />
      ) : (
        <View style={styles.avatarSpacer} />
      )}
      <View
        style={[
          styles.bubble,
          mine
            ? styles.bubbleMine
            : [styles.bubblePeer, { backgroundColor: theme.incoming }],
          sticker && styles.bubbleSticker,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: mine ? '#FFFFFF' : theme.incomingText },
            sticker && styles.bubbleTextSticker,
          ]}
          numberOfLines={3}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wash: {
    ...StyleSheet.absoluteFill,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  stack: {
    width: '100%',
    maxWidth: 300,
    alignSelf: 'center',
    overflow: 'visible',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 18,
  },
  preview: {
    borderRadius: 20,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 168,
    maxHeight: 268,
  },
  stamp: {
    alignSelf: 'center',
    fontSize: 12,
    marginBottom: 10,
    fontWeight: '500',
  },
  previewBody: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 6,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    maxWidth: '100%',
  },
  msgRowPeer: {
    alignSelf: 'flex-start',
    paddingRight: 28,
  },
  msgRowMine: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
    paddingLeft: 36,
  },
  avatarSpacer: { width: 0 },
  bubble: {
    maxWidth: '100%',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubblePeer: {
    borderBottomLeftRadius: 5,
  },
  bubbleMine: {
    backgroundColor: IOS_BLUE,
    borderBottomRightRadius: 5,
  },
  bubbleSticker: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextSticker: {
    fontSize: 44,
    lineHeight: 50,
  },
  previewImage: {
    width: 92,
    height: 92,
    borderRadius: 14,
  },
  menu: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  separator: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: -0.24,
  },
});
