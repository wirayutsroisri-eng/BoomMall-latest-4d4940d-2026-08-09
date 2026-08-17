import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useIsFocused } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useCallStore } from '@/modules/chat/state/call-store';
import { usePresenceSession } from '@/modules/chat/ui/usePresenceSession';
import { selectChatImages, messageImageUris } from '@/modules/chat/domain/selectChatImages';
import {
  MediaGalleryPicker,
  type PickedGalleryItem,
} from '@/shared/media/MediaGalleryPicker';
import { ChatBubble } from './ChatBubble';
import { ChatMediaViewer } from './ChatMediaViewer';
import { ChatInfoSheet } from './ChatInfoSheet';
import { MessageActionPopup, type MessageActionKey } from './MessageActionPopup';
import { ReminderSheet } from './ReminderSheet';
import { AttachmentSheet, type AttachmentAction } from './AttachmentSheet';
import { WarehouseProductPickerSheet } from './WarehouseProductPickerSheet';
import { colors } from '@/shared/theme/colors';
import { recordActivity } from '@/modules/account/state/activity-store';
import { ENABLE_CALLS } from '@/shared/compliance/appStoreGates';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { Avatar } from '@/shared/components/Avatar';
import { quotePreviewImage, quotePreviewLabel, toMessageQuote } from '@/modules/chat/domain/quotePreview';
import { cancelChatReminder, scheduleChatReminder } from '@/modules/chat/data/chatReminder';
import { isCurrentChatUser } from '@/modules/chat/data/chatRealtimeApi';
import { joinChatRoom, leaveChatRoom, isChatSocketConnected } from '@/modules/chat/data/chatSocket';
import { latestServerSequence } from '@/modules/chat/domain/message-sync';
import { isDirectConversation, isShopConversation } from '@/modules/chat/domain/conversation';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import type { ChatMessage, OrderSnapshotCard, ProductCard, QuotationCard } from '@/modules/chat/domain/types';
import { OrderSnapshotCard as OrderSnapshotPin } from '@/modules/chat/ui/OrderSnapshotCard';

const EMPTY_MESSAGES: ChatMessage[] = [];
const EMPTY_INDEXES: ReadonlySet<number> = new Set();

function messageKey(id: string) {
  return `m:${id}`;
}
function imageKey(id: string, index: number) {
  return `i:${id}:${index}`;
}
function keysForMessage(msg: ChatMessage): string[] {
  const uris = messageImageUris(msg);
  if (uris.length) return uris.map((_, i) => imageKey(msg.id, i));
  return [messageKey(msg.id)];
}
function parseSelectionKey(key: string): { messageId: string; albumIndex?: number } | null {
  if (key.startsWith('m:')) return { messageId: key.slice(2) };
  if (key.startsWith('i:')) {
    const rest = key.slice(2);
    const split = rest.lastIndexOf(':');
    if (split <= 0) return null;
    const albumIndex = Number(rest.slice(split + 1));
    if (!Number.isFinite(albumIndex)) return null;
    return { messageId: rest.slice(0, split), albumIndex };
  }
  return null;
}

type BackContext = {
  from?: string;
  handle?: string;
  feedId?: string;
};

type Props = {
  conversationId: string;
  /** When opened from Visitor Profile, [< Back] returns to that creator (or Feed). */
  backContext?: BackContext;
  /** When opened by tapping a friend's Active Note, shows a Note Context Banner above the composer. */
  noteId?: string;
  /** Seller opened this thread from an order card */
  orderId?: string;
};

export function ConversationScreen({ conversationId, backContext, noteId, orderId }: Props) {
  const insets = useSafeAreaInsets();
  const chatFocused = useIsFocused();
  const [text, setText] = useState('');
  const [noteDismissed, setNoteDismissed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ messageId: string; uriIndex?: number } | null>(
    null,
  );
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoPage, setInfoPage] = useState<'home' | 'search' | 'favorites'>('home');
  const [infoQuery, setInfoQuery] = useState('');
  const [quote, setQuote] = useState<ChatMessage | null>(null);
  const [actionMessage, setActionMessage] = useState<ChatMessage | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [selectQuery, setSelectQuery] = useState('');
  const [forwardQueue, setForwardQueue] = useState<ChatMessage[]>([]);
  const [editMessage, setEditMessage] = useState<ChatMessage | null>(null);
  const [remindMessage, setRemindMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const prevMessageCount = useRef(0);

  /** อยู่ในห้องแชต → heartbeat ออนไลน์ */
  usePresenceSession('chat', chatFocused);

  const conversation = useChatStore((s) => s.getConversation(conversationId));
  const myProfile = useLoyaltyStore((s) => s.profile);
  const myAvatarUri =
    myProfile.avatarUri || `https://i.pravatar.cc/150?u=boommall-${myProfile.handle || 'me'}`;
  const myDisplayName = myProfile.displayName || 'ฉัน';
  const messages = useChatStore((s) => s.messagesById[conversationId] ?? EMPTY_MESSAGES);
  const pinnedOrder = useMemo(() => {
    const match = [...messages].reverse().find((m) => {
      if (m.kind !== 'order_ref' || !m.orderRef) return false;
      return orderId ? m.orderRef.orderId === orderId : true;
    });
    return match?.orderRef;
  }, [messages, orderId]);
  const thread = useMemo(() => [...messages].reverse(), [messages]);
  const visibleThread = useMemo(() => {
    const q = selectQuery.trim().toLowerCase();
    if (!selectMode || !q) return thread;
    return thread.filter((m) => {
      const label = quotePreviewLabel(m).toLowerCase();
      const body = (m.text ?? '').toLowerCase();
      return label.includes(q) || body.includes(q);
    });
  }, [thread, selectMode, selectQuery]);
  const selectedMessages = useMemo(() => {
    const ids = new Set<string>();
    for (const key of selectedKeys) {
      const parsed = parseSelectionKey(key);
      if (parsed) ids.add(parsed.messageId);
    }
    return messages.filter((m) => ids.has(m.id));
  }, [messages, selectedKeys]);
  const allConversations = useChatStore((s) => s.conversations);
  const chatImages = useMemo(() => selectChatImages(messages), [messages]);
  const mediaViewerIndex = useMemo(() => {
    if (!mediaViewer) return 0;
    const i = chatImages.findIndex(
      (m) =>
        m.messageId === mediaViewer.messageId &&
        (m.albumIndex ?? 0) === (mediaViewer.uriIndex ?? 0),
    );
    return i >= 0 ? i : 0;
  }, [mediaViewer, chatImages]);
  const forwardTargets = useMemo(
    () =>
      allConversations
        .filter((c) => c.id !== conversationId && !c.isArchived && !c.isHidden)
        .slice(0, 12)
        .map((c) => ({
          id: c.id,
          peerName: c.peerName,
          avatarColor: c.avatarColor,
          avatarUri: c.avatarUri,
        })),
    [allConversations, conversationId],
  );
  const notes = useChatStore((s) => s.notes);
  const activeNote = noteId ? notes.find((n) => n.id === noteId) : undefined;
  const showNoteBanner = Boolean(activeNote) && !noteDismissed;
  const sendText = useChatStore((s) => s.sendText);
  const payQuotation = useChatStore((s) => s.payQuotation);
  const convertProductToPayment = useChatStore((s) => s.convertProductToPayment);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const sendProductCard = useChatStore((s) => s.sendProductCard);
  const hydrateThread = useChatStore((s) => s.hydrateThread);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const loadingOlder = useChatStore((s) => s.loadingOlderById[conversationId] ?? false);
  const retryFailedMessage = useChatStore((s) => s.retryFailedMessage);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const sendImage = useChatStore((s) => s.sendImage);
  const sendImages = useChatStore((s) => s.sendImages);
  const replaceMessageImage = useChatStore((s) => s.replaceMessageImage);
  const sendFile = useChatStore((s) => s.sendFile);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const deleteMessages = useChatStore((s) => s.deleteMessages);
  const removeMessageImages = useChatStore((s) => s.removeMessageImages);
  const toggleFavorite = useChatStore((s) => s.toggleFavorite);
  const setMessageReminder = useChatStore((s) => s.setMessageReminder);
  const editStoredMessage = useChatStore((s) => s.editMessage);
  const forwardMessage = useChatStore((s) => s.forwardMessage);
  const sendQuotation = useChatStore((s) => s.sendQuotation);
  const startCall = useCallStore((s) => s.startCall);
  const setActive = useCallStore((s) => s.setActive);
  const callMode = useCallStore((s) => s.mode);
  const sendVoice = useChatStore((s) => s.sendVoice);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const micGranted = useRef(false);

  useEffect(() => {
    markConversationRead(conversationId);
  }, [conversationId, markConversationRead]);

  useEffect(() => {
    setActiveConversation(conversationId);
    if (conversation) {
      recordActivity({
        category: 'chat',
        title: conversation.peerName,
        subtitle: conversation.peerHandle,
        targetId: conversationId,
      });
    }
    const remoteId = conversation?.remoteId ?? conversationId;
    joinChatRoom(
      remoteId,
      latestServerSequence(useChatStore.getState().messagesById[conversationId] ?? []),
    );
    return () => {
      leaveChatRoom(remoteId);
      setActiveConversation(null);
    };
  }, [conversationId, conversation?.remoteId, setActiveConversation]);

  useEffect(() => {
    void hydrateThread(conversationId);
    const timer = setInterval(() => {
      if (!isChatSocketConnected()) void hydrateThread(conversationId);
    }, 4000);
    return () => clearInterval(timer);
  }, [conversationId, hydrateThread]);

  const jumpToLatest = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated });
    });
  }, []);

  useEffect(() => {
    prevMessageCount.current = 0;
    jumpToLatest(false);
  }, [conversationId, jumpToLatest]);

  useEffect(() => {
    const n = messages.length;
    if (n !== prevMessageCount.current) {
      jumpToLatest(prevMessageCount.current > 0);
      prevMessageCount.current = n;
    }
  }, [jumpToLatest, messages.length]);

  useEffect(() => {
    if (callMode === 'connecting') {
      const t = setTimeout(() => setActive(), 800);
      return () => clearTimeout(t);
    }
  }, [callMode, setActive]);

  useEffect(() => {
    (async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      micGranted.current = granted;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    })();
  }, []);

  const openSheet = () => {
    Keyboard.dismiss();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetOpen(true);
  };

  const closeSheet = () => setSheetOpen(false);

  const focusInput = () => {
    if (sheetOpen) setSheetOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const startRecording = async () => {
    if (!micGranted.current) {
      const { granted } = await requestRecordingPermissionsAsync();
      micGranted.current = granted;
      if (!granted) {
        Alert.alert('ต้องการสิทธิ์ไมโครโฟน', 'กรุณาอนุญาตให้ BoomMall เข้าถึงไมโครโฟนเพื่อส่งข้อความเสียง');
        return;
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { pauseMusicForRecording } = await import('@/modules/music/audio/music-session');
      await pauseMusicForRecording();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch {
      // Simulator without a mic, or permission race — fail silently, UX stays intact.
    }
  };

  const stopRecordingAndSend = async () => {
    if (!recorderState.isRecording) return;
    const durationSec = Math.max(1, Math.round(recorderState.durationMillis / 1000));
    try {
      await audioRecorder.stop();
    } catch {
      return;
    }
    const uri = audioRecorder.uri;
    if (uri) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sendVoice(conversationId, uri, durationSec);
    }
  };

  const cancelRecording = async () => {
    if (recorderState.isRecording) {
      try {
        await audioRecorder.stop();
      } catch {
        // ignore
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const pickAndSendImage = () => {
    setGalleryOpen(true);
  };

  const onGallerySend = (items: PickedGalleryItem[]) => {
    setGalleryOpen(false);
    if (!items.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const photos = items.filter((item) => item.mediaType !== 'video').map((item) => item.uri);
    const videos = items.filter((item) => item.mediaType === 'video').map((item) => item.uri);
    for (let i = 0; i < photos.length; i += 4) {
      sendImages(conversationId, photos.slice(i, i + 4));
    }
    videos.forEach((uri) => sendImages(conversationId, [uri]));
  };

  const pickAndSendFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      sendFile(conversationId, {
        fileUri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType,
        fileSize: asset.size,
      });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert('ไม่สามารถเลือกไฟล์ได้', 'ลองใหม่อีกครั้ง');
    }
  };

  const takeAndSendPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์กล้อง', 'กรุณาอนุญาตให้ BoomMall ใช้กล้องเพื่อถ่ายภาพส่งในแชต');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendImage(conversationId, result.assets[0].uri);
    }
  };

  const sendShopQuotation = () => {
    const card: QuotationCard = {
      id: `q-${Date.now()}`,
      title: `ใบเสนอราคา — ${conversation?.peerName ?? 'ร้านค้า'}`,
      description: 'รายการสินค้าและบริการจากร้าน',
      amount: 0,
      currency: 'THB',
      status: 'pending',
      expiresAt: 'วันนี้ 23:59',
    };
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendQuotation(conversationId, card);
  };

  const goBack = () => {
    if (backContext?.from === 'creator' && backContext.handle) {
      const handle = backContext.handle.replace(/^@/, '');
      const feedId = backContext.feedId;
      const q = feedId ? `?feedId=${encodeURIComponent(feedId)}` : '';
      router.replace(`/creator/${encodeURIComponent(handle)}${q}`);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/chat');
  };

  const handleQuote = useCallback((msg: ChatMessage) => {
    setQuote(msg);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedKeys(new Set());
    setSelectQuery('');
  }, []);

  const toggleSelected = useCallback((msg: ChatMessage) => {
    const keys = keysForMessage(msg);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      const allOn = keys.length > 0 && keys.every((k) => next.has(k));
      if (allOn) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }, []);

  const toggleSelectedImage = useCallback((msg: ChatMessage, index: number) => {
    const key = imageKey(msg.id, index);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const applySelectDelete = useCallback(() => {
    if (!selectedKeys.size) return;
    const count = selectedKeys.size;
    Alert.alert(
      count > 1 ? `ลบ ${count} รายการ?` : 'ลบข้อความนี้?',
      'ข้อความที่ลบจะเอาออกจากห้องแชต',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: () => {
            const whole = new Set<string>();
            const strip = new Map<string, number[]>();
            for (const key of selectedKeys) {
              const parsed = parseSelectionKey(key);
              if (!parsed) continue;
              if (parsed.albumIndex == null) {
                whole.add(parsed.messageId);
                continue;
              }
              const list = strip.get(parsed.messageId) ?? [];
              list.push(parsed.albumIndex);
              strip.set(parsed.messageId, list);
            }
            for (const [id, indexes] of strip) {
              const msg = messages.find((m) => m.id === id);
              const uris = msg ? messageImageUris(msg) : [];
              if (uris.length && indexes.length >= uris.length) {
                whole.add(id);
                strip.delete(id);
              }
            }
            for (const [id, indexes] of strip) {
              if (whole.has(id)) continue;
              removeMessageImages(conversationId, id, indexes);
            }
            if (whole.size) deleteMessages(conversationId, [...whole]);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            exitSelectMode();
          },
        },
      ],
    );
  }, [selectedKeys, messages, conversationId, removeMessageImages, deleteMessages, exitSelectMode]);

  const applySelectForward = useCallback(() => {
    if (!selectedMessages.length) return;
    setForwardQueue(selectedMessages);
  }, [selectedMessages]);

  const applySelectFavorite = useCallback(() => {
    if (!selectedMessages.length) return;
    for (const m of selectedMessages) {
      if (!m.isFavorite) toggleFavorite(conversationId, m.id);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [selectedMessages, conversationId, toggleFavorite]);

  const applySelectMore = useCallback(() => {
    if (!selectedMessages.length) return;
    const copy = () => {
      const blob = selectedMessages
        .map((m) => m.text?.trim() || quotePreviewLabel(m))
        .filter(Boolean)
        .join('\n');
      if (blob) void Clipboard.setStringAsync(blob);
    };
    const quoteOne = () => {
      if (selectedMessages.length !== 1) return;
      handleQuote(selectedMessages[0]);
      exitSelectMode();
    };
    const search = () => {
      setInfoQuery(quotePreviewLabel(selectedMessages[0]));
      setInfoPage('search');
      setInfoOpen(true);
    };
    const options = ['คัดลอก', 'อ้างอิง', 'ค้นหา', 'ยกเลิก'] as const;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...options], cancelButtonIndex: 3 },
        (index) => {
          if (index === 0) copy();
          if (index === 1) quoteOne();
          if (index === 2) search();
        },
      );
      return;
    }
    Alert.alert('เพิ่มเติม', undefined, [
      { text: 'คัดลอก', onPress: copy },
      { text: 'อ้างอิง', onPress: quoteOne },
      { text: 'ค้นหา', onPress: search },
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  }, [selectedMessages, handleQuote, exitSelectMode]);

  const handleMessageAction = useCallback(
    (key: MessageActionKey, msg: ChatMessage) => {
      switch (key) {
        case 'copy':
          if (msg.text) void Clipboard.setStringAsync(msg.text);
          break;
        case 'forward':
          setForwardQueue([msg]);
          break;
        case 'favorite':
          toggleFavorite(conversationId, msg.id);
          break;
        case 'edit':
          setEditMessage(msg);
          setEditText(msg.text ?? '');
          break;
        case 'delete':
          Alert.alert('ลบข้อความ', 'ลบข้อความนี้ออกจากห้องแชต', [
            { text: 'ยกเลิก', style: 'cancel' },
            {
              text: 'ลบ',
              style: 'destructive',
              onPress: () => deleteMessage(conversationId, msg.id),
            },
          ]);
          break;
        case 'select':
          setSheetOpen(false);
          setSelectMode(true);
          setSelectedKeys(new Set(keysForMessage(msg)));
          break;
        case 'quote':
          handleQuote(msg);
          break;
        case 'remind':
          setRemindMessage(msg);
          break;
        case 'open':
          if (msg.kind === 'image') setMediaViewer({ messageId: msg.id });
          else if (msg.fileUri) {
            void Share.share({ url: msg.fileUri, title: msg.fileName, message: msg.fileName });
          }
          break;
        case 'search':
          setInfoQuery(msg.text?.trim() || quotePreviewLabel(msg));
          setInfoPage('search');
          setInfoOpen(true);
          break;
      }
    },
    [conversationId, deleteMessage, handleQuote, toggleFavorite],
  );

  if (!conversation) {
    return (
      <View style={styles.missing}>
        <Text>ไม่พบห้องแชต</Text>
      </View>
    );
  }

  const handleAttachment = (action: AttachmentAction) => {
    closeSheet();
    switch (action) {
      case 'camera':
        void takeAndSendPhoto();
        break;
      case 'gallery':
        pickAndSendImage();
        break;
      case 'file':
        void pickAndSendFile();
        break;
      case 'reply':
        focusInput();
        break;
      case 'coupon':
        sendShopQuotation();
        break;
      case 'order':
        setOrderPickerOpen(true);
        break;
      case 'quotation':
        sendShopQuotation();
        break;
      case 'location':
        break;
    }
  };

  const openOrderDetail = (order: OrderSnapshotCard, role?: 'buyer' | 'seller') => {
    void Haptics.selectionAsync();
    if (role === 'seller') {
      router.push({ pathname: '/store/shipping', params: { orderId: order.orderId } });
      return;
    }
    router.push({ pathname: '/orders', params: { orderId: order.orderId } });
  };

  const openChatProduct = (product: ProductCard | undefined, mode: 'specs' | 'buy') => {
    if (!product?.id) return;
    const exists = useInventoryStore.getState().masters.some((row) => row.id === product.id);
    if (!exists) {
      router.push('/(tabs)/shop');
      return;
    }
    router.push({
      pathname: '/shop/product/[id]',
      params: { id: product.id, pick: mode === 'buy' ? 'buy' : '1' },
    });
  };

  const canSend = Boolean(text.trim()) || Boolean(quote);

  const quoteName =
    quote && conversation
      ? isCurrentChatUser(quote.senderId)
        ? 'ฉัน'
        : conversation.peerName
      : '';

  return (
    <KeyboardAvoidingView
      style={[styles.root, conversation.wallpaper ? { backgroundColor: conversation.wallpaper } : null]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {selectMode ? (
        <View style={[styles.selectChrome, { paddingTop: insets.top + 4 }]}>
          <View style={styles.selectHeaderRow}>
            <Pressable onPress={exitSelectMode} hitSlop={8} style={styles.selectCancelHit}>
              <Text style={styles.selectCancelLabel}>ยกเลิก</Text>
            </Pressable>
            <Text style={styles.selectHeaderTitle} numberOfLines={1}>
              {selectedKeys.size
                ? `เลือกข้อความ ${selectedKeys.size} รายการ`
                : 'เลือกข้อความ'}
            </Text>
          </View>
          <View style={styles.selectSearch}>
            <Ionicons name="search" size={16} color="#8E8E93" />
            <TextInput
              value={selectQuery}
              onChangeText={setSelectQuery}
              placeholder="ค้นหา"
              placeholderTextColor="#8E8E93"
              style={styles.selectSearchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
        </View>
      ) : (
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <View style={styles.headerBody}>
          <Text style={styles.name} numberOfLines={1}>
            {conversation.kind === 'official' ? '✓ ' : ''}
            {conversation.peerName}
          </Text>
          <Text style={styles.handle}>
            {conversation.peerTyping
              ? 'กำลังพิมพ์...'
              : conversation.kind === 'group'
                ? `${conversation.memberCount ?? 0} สมาชิก · Group Chat`
                : `${conversation.peerHandle} · WeChat Protocol`}
          </Text>
        </View>
        {ENABLE_CALLS && isDirectConversation(conversation) ? (
          <>
            <Pressable
              style={styles.callBtn}
              onPress={() => startCall(conversation.peerName, 'voice')}
              accessibilityLabel="โทร"
            >
              <Ionicons name="call" size={18} color={colors.brand.ink} />
            </Pressable>
            <Pressable
              style={styles.videoBtn}
              onPress={() => startCall(conversation.peerName, 'video')}
              accessibilityLabel="วิดีโอคอล"
            >
              <Ionicons name="videocam" size={18} color={colors.text.inverse} />
            </Pressable>
          </>
        ) : null}
        <Pressable
          style={styles.moreBtn}
          onPress={() => {
            void Haptics.selectionAsync();
            setInfoPage('home');
            setInfoQuery('');
            setInfoOpen(true);
          }}
          accessibilityLabel="เพิ่มเติม"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.text.primary} />
        </Pressable>
      </View>
      )}

      {pinnedOrder && !selectMode ? (
        <View style={styles.orderPin}>
          <OrderSnapshotPin
            snapshot={pinnedOrder}
            compact
            onOpenDetail={() => openOrderDetail(pinnedOrder, conversation.inboxRole)}
          />
        </View>
      ) : null}

      <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          inverted
          data={visibleThread}
          keyExtractor={(item) => item.id}
          extraData={selectMode ? `${selectedKeys.size}:${selectQuery}` : null}
          contentContainerStyle={[styles.list, selectMode && styles.listSelecting]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScrollBeginDrag={() => {
            if (sheetOpen) closeSheet();
          }}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
            }, 80);
          }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!selectMode) void loadOlderMessages(conversationId);
          }}
          ListFooterComponent={
            loadingOlder ? (
              <Text style={{ textAlign: 'center', color: colors.text.muted, paddingVertical: 12, fontSize: 12 }}>
                โหลดข้อความเก่า…
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <ChatBubble
              message={item}
              onPay={(qid) => payQuotation(conversationId, qid)}
              onConvertProduct={(pid) => convertProductToPayment(conversationId, pid)}
              onPressImage={(messageId, uriIndex) => setMediaViewer({ messageId, uriIndex })}
              onSelectProductSpecs={(product) => openChatProduct(product, 'specs')}
              onBuyProduct={(product) => openChatProduct(product, 'buy')}
              onOpenOrder={(order) => openOrderDetail(order, conversation.inboxRole)}
              onQuote={handleQuote}
              onLongPress={setActionMessage}
              onRetryFailed={(msg) => retryFailedMessage(conversationId, msg.id)}
              selectMode={selectMode}
              selected={
                item.kind !== 'system' &&
                keysForMessage(item).every((k) => selectedKeys.has(k)) &&
                keysForMessage(item).length > 0
              }
              selectedImageIndexes={
                selectMode && item.kind === 'image'
                  ? new Set(
                      messageImageUris(item).flatMap((_, i) =>
                        selectedKeys.has(imageKey(item.id, i)) ? [i] : [],
                      ),
                    )
                  : EMPTY_INDEXES
              }
              onToggleSelect={toggleSelected}
              onToggleImage={toggleSelectedImage}
              peerFace={{
                uri: conversation.avatarUri,
                name: conversation.peerName,
                color: conversation.avatarColor,
              }}
              myFace={{
                uri: myAvatarUri,
                name: myDisplayName,
                color: colors.brand.primary,
              }}
            />
          )}
        />
        {sheetOpen ? (
          <Pressable style={styles.sheetDismiss} onPress={closeSheet} accessibilityLabel="ปิดแผงส่งสื่อ" />
        ) : null}
      </View>

      {conversation.peerTyping && !selectMode ? (
        <Text style={styles.typing}>กำลังพิมพ์...</Text>
      ) : null}

      {showNoteBanner && activeNote && !selectMode ? (
        <View style={[styles.noteBanner, { borderLeftColor: activeNote.avatarColor }]}>
          {activeNote.imageUri ? (
            <Image source={{ uri: activeNote.imageUri }} style={styles.noteBannerThumb} />
          ) : (
            <Text style={styles.noteBannerEmoji}>{activeNote.emoji}</Text>
          )}
          <View style={styles.noteBannerBody}>
            <Text style={styles.noteBannerLabel}>ตอบกลับโมเมนต์ของ {activeNote.authorName}</Text>
            <Text style={styles.noteBannerText} numberOfLines={2}>
              “{activeNote.text}” · {activeNote.postedAt}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={() => setNoteDismissed(true)}>
            <Ionicons name="close" size={16} color={colors.text.muted} />
          </Pressable>
        </View>
      ) : null}

      {selectMode ? (
        <View style={[styles.selectToolBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <Pressable
            style={styles.selectToolBtn}
            onPress={applySelectForward}
            disabled={!selectedKeys.size}
            accessibilityLabel="ส่งต่อ"
          >
            <Ionicons
              name="arrow-undo-outline"
              size={26}
              color={selectedKeys.size ? '#111' : '#C7C7CC'}
              style={{ transform: [{ scaleX: -1 }] }}
            />
          </Pressable>
          <Pressable
            style={styles.selectToolBtn}
            onPress={applySelectFavorite}
            disabled={!selectedKeys.size}
            accessibilityLabel="รายการโปรด"
          >
            <Ionicons
              name="cube-outline"
              size={24}
              color={selectedKeys.size ? '#111' : '#C7C7CC'}
            />
          </Pressable>
          <Pressable
            style={styles.selectToolBtn}
            onPress={applySelectDelete}
            disabled={!selectedKeys.size}
            accessibilityLabel="ลบ"
          >
            <Ionicons
              name="trash-outline"
              size={24}
              color={selectedKeys.size ? '#111' : '#C7C7CC'}
            />
          </Pressable>
          <Pressable
            style={styles.selectToolBtn}
            onPress={applySelectMore}
            disabled={!selectedKeys.size}
            accessibilityLabel="เพิ่มเติม"
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={26}
              color={selectedKeys.size ? '#111' : '#C7C7CC'}
            />
          </Pressable>
        </View>
      ) : (
      <View style={styles.composerDock}>
      {quote ? (
        <View style={styles.quoteBar}>
          <Avatar
            uri={isCurrentChatUser(quote.senderId) ? myAvatarUri : conversation.avatarUri}
            initial={quoteName.slice(0, 1)}
            backgroundColor={
              isCurrentChatUser(quote.senderId) ? colors.brand.primary : conversation.avatarColor
            }
            size={28}
            radius={14}
            borderWidth={0}
          />
          <View style={styles.quoteBarBody}>
            <Text style={styles.quoteBarName} numberOfLines={1}>
              {quoteName}
            </Text>
            <Text style={styles.quoteBarText} numberOfLines={2}>
              {quotePreviewLabel(quote)}
            </Text>
          </View>
          {quotePreviewImage(quote) ? (
            <Image source={{ uri: quotePreviewImage(quote) }} style={styles.quoteBarThumb} />
          ) : null}
          <Pressable hitSlop={10} onPress={() => setQuote(null)} accessibilityLabel="ยกเลิกอ้างอิง">
            <View style={styles.quoteBarClose}>
              <Ionicons name="close" size={12} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.composer, { paddingBottom: sheetOpen ? 8 : Math.max(insets.bottom, 10) }]}>
        <Pressable
          style={[styles.plusBtn, sheetOpen && styles.plusBtnActive]}
          onPress={() => (sheetOpen ? closeSheet() : openSheet())}
          accessibilityLabel={sheetOpen ? 'ปิดแผงส่งสื่อ' : 'เปิดแผงส่งสื่อ'}
        >
          <Ionicons
            name={sheetOpen ? 'close' : 'add'}
            size={24}
            color={sheetOpen ? colors.text.inverse : colors.text.primary}
          />
        </Pressable>

        {recorderState.isRecording ? (
          <View style={styles.recordingRow}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>
              กำลังบันทึก... {Math.round(recorderState.durationMillis / 1000)}s
            </Text>
            <Pressable
              onPress={() => {
                Alert.alert('ยกเลิกการบันทึก?', 'เสียงที่กำลังอัดจะไม่ถูกส่ง', [
                  { text: 'ไม่', style: 'cancel' },
                  { text: 'ลบ', style: 'destructive', onPress: () => void cancelRecording() },
                ]);
              }}
              hitSlop={8}
              accessibilityLabel="ลบการบันทึก"
            >
              <Ionicons name="trash" size={18} color={colors.accent.live} />
            </Pressable>
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={
              quote
                ? 'พิมพ์ข้อความอ้างอิง...'
                : showNoteBanner
                  ? 'พิมพ์ตอบกลับโมเมนต์นี้...'
                  : 'พิมพ์ข้อความที่นี่...'
            }
            placeholderTextColor={colors.text.muted}
            value={text}
            onChangeText={setText}
            onFocus={() => {
              if (sheetOpen) closeSheet();
            }}
            onPressIn={focusInput}
            multiline
            maxLength={2000}
          />
        )}

        <Pressable
          style={styles.micBtn}
          onPressIn={() => {
            if (!canSend) void startRecording();
          }}
          onPressOut={() => {
            if (!canSend) void stopRecordingAndSend();
          }}
          disabled={canSend}
          accessibilityLabel="กดค้างเพื่ออัดเสียง"
        >
          <Ionicons
            name={recorderState.isRecording ? 'mic' : 'mic-outline'}
            size={22}
            color={recorderState.isRecording ? colors.accent.live : colors.text.secondary}
          />
        </Pressable>

        <Pressable
          style={[styles.sendBtn, canSend && styles.sendBtnActive]}
          onPress={() => {
            if (!canSend) return;
            sendText(
              conversationId,
              text.trim(),
              quote
                ? toMessageQuote(quote, {
                    name: isCurrentChatUser(quote.senderId) ? myDisplayName : conversation.peerName,
                    avatarUri:
                      isCurrentChatUser(quote.senderId) ? myAvatarUri : conversation.avatarUri,
                    avatarColor:
                      isCurrentChatUser(quote.senderId)
                        ? colors.brand.primary
                        : conversation.avatarColor,
                  })
                : undefined,
            );
            setText('');
            setQuote(null);
            setNoteDismissed(true);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          accessibilityLabel="ส่งข้อความ"
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={canSend ? colors.text.inverse : colors.text.muted}
          />
        </Pressable>
      </View>
      </View>
      )}

      <AttachmentSheet
        visible={sheetOpen}
        onClose={closeSheet}
        onSelect={handleAttachment}
        showQuotation={isShopConversation(conversation)}
      />

      <WarehouseProductPickerSheet
        visible={orderPickerOpen}
        shopId={conversation.shopId}
        inboxRole={conversation.inboxRole}
        onClose={() => setOrderPickerOpen(false)}
        onSend={(cards) => {
          for (const card of cards) sendProductCard(conversationId, card);
        }}
      />

      <MediaGalleryPicker
        visible={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSend={onGallerySend}
        initialMode="photo"
        allowModeSwitch
        selectionLimit={20}
        sendLabel="ส่ง"
        title="ล่าสุด"
      />

      <ChatMediaViewer
        visible={Boolean(mediaViewer) && chatImages.length > 0}
        items={chatImages}
        initialIndex={mediaViewerIndex}
        onClose={() => setMediaViewer(null)}
        forwardTargets={forwardTargets}
        onForward={(targetId, imageUri) => {
          sendImage(targetId, imageUri);
        }}
        onDelete={(messageId) => {
          deleteMessage(conversationId, messageId);
          const remaining = chatImages.filter((m) => m.messageId !== messageId);
          if (!remaining.length) {
            setMediaViewer(null);
          }
        }}
        onReplaceImage={(messageId, albumIndex, uri) => {
          replaceMessageImage(conversationId, messageId, uri, albumIndex);
        }}
      />

      <ChatInfoSheet
        visible={infoOpen}
        conversationId={conversationId}
        initialPage={infoPage}
        initialQuery={infoQuery}
        onClose={() => setInfoOpen(false)}
        onOpenMessage={(messageId) => {
          const index = visibleThread.findIndex((m) => m.id === messageId);
          if (index < 0) return;
          requestAnimationFrame(() => {
            listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.35 });
          });
        }}
      />

      <MessageActionPopup
        visible={Boolean(actionMessage)}
        message={actionMessage}
        onClose={() => setActionMessage(null)}
        onAction={handleMessageAction}
      />

      <ReminderSheet
        visible={Boolean(remindMessage)}
        alreadySet={Boolean(remindMessage?.isReminded)}
        initialAt={remindMessage?.remindAt}
        onClose={() => setRemindMessage(null)}
        onConfirm={(when) => {
          const msg = remindMessage;
          if (!msg) return;
          void (async () => {
            const id = await scheduleChatReminder({
              conversationId,
              messageId: msg.id,
              title: conversation.peerName,
              body: quotePreviewLabel(msg),
              when,
              replaceId: msg.reminderId,
            });
            if (!id) return;
            setMessageReminder(conversationId, msg.id, {
              remindAt: when.toISOString(),
              reminderId: id,
            });
            setRemindMessage(null);
          })();
        }}
        onClear={() => {
          const msg = remindMessage;
          if (!msg) return;
          void cancelChatReminder(msg.reminderId);
          setMessageReminder(conversationId, msg.id, { remindAt: null, reminderId: null });
          setRemindMessage(null);
        }}
      />

      <Modal
        visible={forwardQueue.length > 0}
        transparent
        animationType="slide"
        onRequestClose={() => setForwardQueue([])}
      >
        <DragDownDismiss
          onDismiss={() => setForwardQueue([])}
          showDim
          rootInModal
          style={styles.forwardSheet}
        >
          <Text style={styles.forwardTitle}>ส่งต่อไปยัง</Text>
          <ScrollView>
            {forwardTargets.map((t) => (
              <Pressable
                key={t.id}
                style={styles.forwardRow}
                onPress={() => {
                  forwardQueue.forEach((msg) => forwardMessage(t.id, msg));
                  setForwardQueue([]);
                  exitSelectMode();
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
              >
                {t.avatarUri ? (
                  <Image source={{ uri: t.avatarUri }} style={styles.forwardAvatar} />
                ) : (
                  <View style={[styles.forwardAvatar, { backgroundColor: t.avatarColor }]} />
                )}
                <Text style={styles.forwardName}>{t.peerName}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </DragDownDismiss>
      </Modal>

      <Modal
        visible={Boolean(editMessage)}
        transparent
        animationType="slide"
        onRequestClose={() => setEditMessage(null)}
      >
        <DragDownDismiss
          onDismiss={() => setEditMessage(null)}
          showDim
          rootInModal
          style={styles.editSheet}
        >
          <Text style={styles.forwardTitle}>แก้ไขข้อความ</Text>
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
          />
          <Pressable
            style={styles.editSave}
            onPress={() => {
              if (editMessage && editText.trim()) {
                editStoredMessage(conversationId, editMessage.id, editText);
              }
              setEditMessage(null);
            }}
          >
            <Text style={styles.editSaveText}>บันทึก</Text>
          </Pressable>
        </DragDownDismiss>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
    backgroundColor: colors.surface.card,
  },
  orderPin: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  selectChrome: {
    backgroundColor: colors.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
    paddingBottom: 10,
  },
  selectHeaderRow: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 88,
  },
  selectCancelHit: {
    position: 'absolute',
    left: 16,
    height: 44,
    justifyContent: 'center',
  },
  selectCancelLabel: {
    fontSize: 17,
    color: colors.text.primary,
  },
  selectHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  selectSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: '#EFEFEF',
  },
  selectSearchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
    paddingVertical: 0,
  },
  selectToolBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 10,
    backgroundColor: colors.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  selectToolBtn: {
    width: 56,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBody: { flex: 1 },
  name: { fontWeight: '900', fontSize: 16, color: colors.text.primary },
  handle: { color: colors.text.secondary, fontSize: 12 },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.brand.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listWrap: { flex: 1 },
  list: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 12,
  },
  listSelecting: {
    paddingLeft: 8,
    paddingRight: 12,
  },
  sheetDismiss: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  typing: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    color: colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  noteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.brand.mist,
    borderLeftWidth: 3,
  },
  noteBannerEmoji: {
    fontSize: 20,
  },
  noteBannerThumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.border.soft,
  },
  noteBannerBody: {
    flex: 1,
  },
  noteBannerLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.brand.primaryDark,
    marginBottom: 2,
  },
  noteBannerText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  composerDock: {
    flexShrink: 0,
    backgroundColor: colors.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  quoteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EDEDED',
  },
  quoteBarName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text.primary,
  },
  quoteBarBody: { flex: 1, minWidth: 0, flexShrink: 1 },
  quoteBarThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: colors.border.soft,
  },
  quoteBarPlay: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteBarFileIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.card,
  },
  quoteBarText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8E8E93',
  },
  quoteBarClose: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardSheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '70%',
    width: '100%',
    marginTop: 'auto',
  },
  forwardTitle: {
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 8,
    color: colors.text.primary,
  },
  forwardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  forwardAvatar: { width: 40, height: 40, borderRadius: 12 },
  forwardName: { fontSize: 16, color: colors.text.primary },
  editSheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
    width: '100%',
    marginTop: 'auto',
  },
  editInput: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
    fontSize: 16,
    color: colors.text.primary,
    textAlignVertical: 'top',
  },
  editSave: {
    marginTop: 12,
    backgroundColor: colors.brand.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editSaveText: { fontWeight: '800', color: colors.brand.ink },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: colors.surface.card,
  },
  plusBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.surface.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  plusBtnActive: {
    backgroundColor: colors.brand.ink,
    borderColor: colors.brand.ink,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    borderRadius: 20,
    backgroundColor: colors.surface.canvas,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 8 : 6,
    paddingBottom: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 16,
    lineHeight: 20,
    color: colors.text.primary,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  sendBtnActive: {
    backgroundColor: colors.brand.primaryDark,
  },
  recordingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    borderRadius: 20,
    backgroundColor: colors.surface.canvas,
    paddingHorizontal: 14,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.live,
  },
  recordingText: {
    flex: 1,
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
});
