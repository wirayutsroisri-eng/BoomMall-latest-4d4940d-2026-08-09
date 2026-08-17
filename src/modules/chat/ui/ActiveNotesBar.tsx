import React, { useEffect, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { currentChatUserId } from '@/modules/chat/data/chatRealtimeApi';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { usePresenceStore } from '@/modules/chat/state/presence-store';
import {
  filterVisibleMomentNotes,
  isPresenceOnline,
} from '@/modules/chat/data/presenceService';
import type { ActiveNote } from '@/modules/chat/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { chatInboxPalette } from './chatDayNight';

const SLOT_WIDTH = 88;
const AVATAR_SIZE = 80;
const SLOT_GAP = 10;
const AVATAR_RADIUS = 20;
const ONLINE_GREEN = '#31D158';
const RING_PAD = 3;

/** "ลูกค้า VIP — คุณมิ้นท์" → "คุณมิ้นท์" — keep only a short display name under the avatar. */
function shortName(name: string) {
  const parts = name.split('—');
  return (parts[parts.length - 1] ?? name).trim();
}

/**
 * Moments bar — ขอบเขียว = ออนไลน์ (อยู่ในแชต / เล่นฟีด)
 * คนออฟไลน์ไม่โชว์ในแถบนี้
 */
export function ActiveNotesBar() {
  const palette = chatInboxPalette();
  const notes = useChatStore((s) => s.notes);
  const myNote = useChatStore((s) => s.myNote);
  const setMyNote = useChatStore((s) => s.setMyNote);
  const startPresenceEngine = usePresenceStore((s) => s.startPresenceEngine);
  const stopPresenceEngine = usePresenceStore((s) => s.stopPresenceEngine);
  const myPresence = usePresenceStore((s) => s.presenceByUserId[currentChatUserId()]);
  const iAmOnline = isPresenceOnline(myPresence);

  useEffect(() => {
    startPresenceEngine();
    return () => stopPresenceEngine();
  }, [startPresenceEngine, stopPresenceEngine]);

  /** ออนไลน์จาก presence engine + โมเมนต์ยังไม่หมดอายุ */
  const onlineNotes = useMemo(() => filterVisibleMomentNotes(notes), [notes]);

  const pickMomentPhoto = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์เข้าถึงคลังภาพ', 'กรุณาอนุญาตให้ BoomMall เข้าถึงรูปภาพเพื่อโพสต์โมเมนต์');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setMyNote('โมเมนต์ใหม่', '📷', result.assets[0].uri);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const openNoteChat = (note: ActiveNote) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/(tabs)/chat/[conversationId]' as const,
      params: {
        conversationId: note.conversationId,
        noteId: note.id,
      },
    });
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.slot} onPress={pickMomentPhoto} accessibilityLabel="เพิ่มรูปโมเมนต์">
        {myNote?.imageUri ? (
          <View style={[styles.avatarRing, iAmOnline && styles.avatarRingOnline]}>
            <Avatar
              uri={myNote.imageUri}
              initial={myNote.emoji}
              backgroundColor={colors.brand.mist}
              size={AVATAR_SIZE}
              radius={AVATAR_RADIUS}
              borderWidth={0}
            />
            <View style={[styles.editBadge, { borderColor: palette.noteBadgeBorder }]}>
              <Ionicons name="add" size={12} color={colors.text.inverse} />
            </View>
          </View>
        ) : (
          <View style={styles.addSlot}>
            <Ionicons name="add" size={36} color={palette.noteAdd} />
          </View>
        )}
        <Text style={[styles.slotLabel, { color: palette.noteLabel }]} numberOfLines={1}>
          {myNote?.imageUri ? 'โมเมนต์คุณ' : 'เพิ่มรูป'}
        </Text>
      </Pressable>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scroll}
      >
        {onlineNotes.map((note) => (
          <Pressable
            key={note.id}
            style={styles.slot}
            onPress={() => openNoteChat(note)}
            accessibilityLabel={`${shortName(note.authorName)} ออนไลน์`}
          >
            <View style={[styles.avatarRing, styles.avatarRingOnline]}>
              <Avatar
                uri={note.imageUri}
                initial={note.authorName.slice(0, 1)}
                backgroundColor={note.avatarColor}
                size={AVATAR_SIZE}
                radius={AVATAR_RADIUS}
                borderWidth={0}
              />
            </View>
            <Text style={[styles.slotLabel, { color: palette.noteLabel }]} numberOfLines={1}>
              {shortName(note.authorName)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  scroll: {
    flex: 1,
    marginLeft: SLOT_GAP,
  },
  scrollContent: {
    gap: SLOT_GAP,
    paddingRight: 8,
  },
  slot: {
    width: SLOT_WIDTH,
    alignItems: 'center',
    gap: 5,
  },
  /** วงนอก — เขียวเฉพาะตอนออนไลน์ */
  avatarRing: {
    width: AVATAR_SIZE + RING_PAD * 2,
    height: AVATAR_SIZE + RING_PAD * 2,
    borderRadius: AVATAR_RADIUS + RING_PAD,
    padding: RING_PAD,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  avatarRingOnline: {
    borderWidth: 2.5,
    borderColor: ONLINE_GREEN,
  },
  addSlot: {
    width: AVATAR_SIZE + RING_PAD * 2,
    height: AVATAR_SIZE + RING_PAD * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
});
