import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { ChatBubble } from './ChatBubble';
import { AttachmentSheet, type AttachmentAction } from './AttachmentSheet';
import { QUOTATION_TEMPLATES } from '@/modules/chat/data/mockQuotationTemplates';
import { colors } from '@/shared/theme/colors';

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
};

export function ConversationScreen({ conversationId, backContext, noteId }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [noteDismissed, setNoteDismissed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const conversation = useChatStore((s) => s.getConversation(conversationId));
  const messages = useChatStore((s) => s.messagesById[conversationId] ?? []);
  const notes = useChatStore((s) => s.notes);
  const activeNote = noteId ? notes.find((n) => n.id === noteId) : undefined;
  const showNoteBanner = Boolean(activeNote) && !noteDismissed;
  const sendText = useChatStore((s) => s.sendText);
  const payQuotation = useChatStore((s) => s.payQuotation);
  const convertProductToPayment = useChatStore((s) => s.convertProductToPayment);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const sendProductCard = useChatStore((s) => s.sendProductCard);
  const sendImage = useChatStore((s) => s.sendImage);
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

  const pickAndSendImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์เข้าถึงคลังภาพ', 'กรุณาอนุญาตให้ BoomMall เข้าถึงรูปภาพในเครื่อง');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendImage(conversationId, result.assets[0].uri);
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
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      sendImage(conversationId, result.assets[0].uri);
    }
  };

  const sendTestQuotation = () => {
    const template =
      QUOTATION_TEMPLATES[Math.floor(Math.random() * QUOTATION_TEMPLATES.length)];
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendQuotation(conversationId, {
      id: `q-test-${Date.now()}`,
      title: template.title,
      description: template.description,
      amount: template.amount,
      currency: 'THB',
      status: 'pending',
      expiresAt: 'วันนี้ 23:59',
    });
  };

  const goBack = () => {
    if (backContext?.from === 'creator' && backContext.handle) {
      const handle = backContext.handle;
      const feedId = backContext.feedId;
      router.navigate('/(tabs)');
      requestAnimationFrame(() => {
        useFeedStore.getState().openCreatorProfile(handle, feedId);
      });
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/chat');
  };

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
        void pickAndSendImage();
        break;
      case 'file':
        Alert.alert('ส่งไฟล์', 'รองรับเอกสาร PDF / ZIP ในรอบถัดไป');
        break;
      case 'reply':
        focusInput();
        break;
      case 'location':
        Alert.alert('ตำแหน่งที่ตั้ง', 'แชร์พิกัดตำแหน่งจะเปิดใช้งานเร็ว ๆ นี้');
        break;
      case 'coupon':
        sendTestQuotation();
        break;
      case 'order':
        sendProductCard(conversationId, {
          id: `pc-${Date.now()}`,
          title: 'Gas Shock 340mm',
          sku: 'BEV-SHOCK-340',
          price: 1990,
          currency: 'THB',
        });
        break;
      case 'call':
        startCall(conversation.peerName, 'voice');
        break;
    }
  };

  const canSend = Boolean(text.trim());

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
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
        <Pressable
          style={styles.callBtn}
          onPress={() => startCall(conversation.peerName, 'voice')}
        >
          <Ionicons name="call" size={18} color={colors.brand.ink} />
        </Pressable>
        <Pressable
          style={styles.videoBtn}
          onPress={() => startCall(conversation.peerName, 'video')}
        >
          <Ionicons name="videocam" size={18} color={colors.text.inverse} />
        </Pressable>
      </View>

      <View style={styles.listWrap}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            if (sheetOpen) closeSheet();
          }}
          renderItem={({ item }) => (
            <ChatBubble
              message={item}
              onPay={(qid) => payQuotation(conversationId, qid)}
              onConvertProduct={(pid) => convertProductToPayment(conversationId, pid)}
            />
          )}
        />
        {sheetOpen ? (
          <Pressable style={styles.sheetDismiss} onPress={closeSheet} accessibilityLabel="ปิดแผงส่งสื่อ" />
        ) : null}
      </View>

      {conversation.peerTyping ? (
        <Text style={styles.typing}>กำลังพิมพ์...</Text>
      ) : null}

      {showNoteBanner && activeNote ? (
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
            <Pressable onPress={cancelRecording} hitSlop={8}>
              <Ionicons name="trash" size={18} color={colors.accent.live} />
            </Pressable>
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={showNoteBanner ? 'พิมพ์ตอบกลับโมเมนต์นี้...' : 'พิมพ์ข้อความที่นี่...'}
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
            sendText(conversationId, text.trim());
            setText('');
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

      <AttachmentSheet visible={sheetOpen} onClose={closeSheet} onSelect={handleAttachment} />
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
  listWrap: { flex: 1 },
  list: {
    padding: 14,
    paddingBottom: 24,
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: colors.surface.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
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
