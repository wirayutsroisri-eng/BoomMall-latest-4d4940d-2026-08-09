import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useChatStore } from '@/modules/chat/state/chat-store';
import type { ActiveNote } from '@/modules/chat/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';

const SLOT_WIDTH = 64;
const AVATAR_SIZE = 58;
const SLOT_GAP = 8;
const ONLINE_GREEN = '#31D158';

/** "ลูกค้า VIP — คุณมิ้นท์" → "คุณมิ้นท์" — keep only a short display name under the avatar. */
function shortName(name: string) {
  const parts = name.split('—');
  return (parts[parts.length - 1] ?? name).trim();
}

/**
 * LINE/WeChat-style Moments bar — photo squircles + name.
 * Only ONLINE friends appear here. The [+] slot picks a photo for your moment.
 */
export function ActiveNotesBar() {
  const notes = useChatStore((s) => s.notes);
  const myNote = useChatStore((s) => s.myNote);
  const setMyNote = useChatStore((s) => s.setMyNote);
  const onlineNotes = notes.filter((n) => n.isOnline);

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
          <View style={styles.avatarWrap}>
            <Avatar
              uri={myNote.imageUri}
              initial={myNote.emoji}
              backgroundColor={colors.brand.mist}
              size={AVATAR_SIZE}
              radius={16}
              borderColor={colors.brand.primary}
              borderWidth={2}
            />
            <View style={styles.emojiBadge}>
              <Text style={styles.emojiText}>{myNote.emoji}</Text>
            </View>
            <View style={styles.editBadge}>
              <Ionicons name="add" size={10} color={colors.text.inverse} />
            </View>
          </View>
        ) : (
          <View style={[styles.avatarWrap, styles.addCircle]}>
            <Ionicons name="add" size={26} color={colors.brand.primaryDark} />
          </View>
        )}
        <Text style={styles.slotLabel} numberOfLines={1}>
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
          <Pressable key={note.id} style={styles.slot} onPress={() => openNoteChat(note)}>
            <View style={styles.avatarWrap}>
              <Avatar
                uri={note.imageUri}
                initial={note.authorName.slice(0, 1)}
                backgroundColor={note.avatarColor}
                size={AVATAR_SIZE}
                radius={16}
                borderColor={ONLINE_GREEN}
                borderWidth={2}
              />
              <View style={styles.emojiBadge}>
                <Text style={styles.emojiText}>{note.emoji}</Text>
              </View>
              <View style={styles.onlineDot} />
            </View>
            <Text style={styles.slotLabel} numberOfLines={1}>
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
    marginBottom: 6,
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
    gap: 3,
  },
  avatarWrap: {
    position: 'relative',
  },
  emojiBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface.canvas,
    paddingHorizontal: 2,
    zIndex: 2,
  },
  emojiText: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  addCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 16,
    backgroundColor: colors.brand.mist,
    borderWidth: 2,
    borderColor: colors.brand.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.surface.canvas,
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: ONLINE_GREEN,
    borderWidth: 2,
    borderColor: colors.surface.canvas,
  },
  slotLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
