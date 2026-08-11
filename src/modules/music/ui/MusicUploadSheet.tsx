import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useMusicLibraryStore } from '../state/music-library-store';
import { useMusicPlayerStore } from '../state/music-player-store';
import { detectMusicMediaKind } from '../domain/types';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type PickKind = 'audio' | 'video';

/**
 * Community upload — audio song or music video (พิมพ์ชื่อ + เลือกไฟล์).
 */
export function MusicUploadSheet({ visible, onClose }: Props) {
  const uploadTrack = useMusicLibraryStore((s) => s.uploadTrack);
  const playTrack = useMusicPlayerStore((s) => s.playTrack);
  const allTracks = useMusicLibraryStore((s) => s.allTracks);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | undefined>();
  const [pickKind, setPickKind] = useState<PickKind>('audio');
  const [busy, setBusy] = useState(false);

  const applyPicked = (uri: string, name: string, mime?: string) => {
    setFileUri(uri);
    setFileName(name);
    setMimeType(mime);
    const kind = detectMusicMediaKind(uri, mime);
    setPickKind(kind);
    if (!title.trim()) setTitle(name.replace(/\.[^.]+$/, ''));
  };

  const pickAudio = async () => {
    void Haptics.selectionAsync();
    setPickKind('audio');
    try {
      const picked = await File.pickFileAsync({
        mimeTypes: ['audio/*', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav'],
      });
      if (!picked.canceled && picked.result?.uri) {
        const name = picked.result.name || picked.result.uri.split('/').pop() || 'audio.mp3';
        applyPicked(picked.result.uri, name, 'audio/*');
        return;
      }
    } catch {
      /* document picker fallback */
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'audio/mpeg', 'audio/mp4'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        applyPicked(a.uri, a.name, a.mimeType);
      }
    } catch {
      Alert.alert('เลือกไฟล์ไม่ได้', 'ลองไฟล์ mp3 / m4a');
    }
  };

  const pickVideo = async () => {
    void Haptics.selectionAsync();
    setPickKind('video');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('ต้องการสิทธิ์คลัง', 'เปิดสิทธิ์เพื่อเลือกวิดีโอเพลง');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        const asset = result.assets[0];
        const name = asset.fileName || asset.uri.split('/').pop() || 'music-video.mp4';
        applyPicked(asset.uri, name, asset.mimeType ?? 'video/mp4');
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['video/*', 'video/mp4', 'video/quicktime'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        applyPicked(a.uri, a.name, a.mimeType);
      }
    } catch {
      Alert.alert('เลือกวิดีโอไม่ได้', 'ลองไฟล์ mp4 / mov');
    }
  };

  const onSubmit = async () => {
    if (!fileUri) {
      Alert.alert('ยังไม่มีไฟล์', 'เลือกไฟล์เสียงหรือวิดีโอเพลงก่อน');
      return;
    }
    if (busy) return;
    setBusy(true);
    const track = await uploadTrack({
      title: title.trim() || (pickKind === 'video' ? 'วิดีโอเพลง' : 'เพลงชุมชน'),
      artist: artist.trim() || 'ชุมชน BoomMall',
      fileUri,
      mimeType,
    });
    setBusy(false);
    if (!track) {
      Alert.alert('อัปโหลดไม่สำเร็จ', 'ตรวจไฟล์แล้วลองใหม่');
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void playTrack(track, allTracks());
    setTitle('');
    setArtist('');
    setFileUri(null);
    setFileName(null);
    setMimeType(undefined);
    onClose();
    const kindLabel = track.mediaKind === 'video' ? 'วิดีโอเพลง' : 'เพลง';
    Alert.alert(
      'ลงแล้ว',
      `「${track.title}」(${kindLabel}) — พิมพ์ค้นหาได้ · กดค้างเพื่อใช้เสียงนี้`,
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.flex}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <DragDownDismiss onDismiss={onClose} style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>ลงเพลง / วิดีโอเพลง</Text>
            <Text style={styles.sub}>พิมพ์ชื่อแล้วเลือกไฟล์เสียง หรือวิดีโอเพลงจากเครื่อง</Text>

            <View style={styles.pickRow}>
              <Pressable
                style={[styles.pickBtn, pickKind === 'audio' && styles.pickBtnActive]}
                onPress={() => void pickAudio()}
              >
                <Ionicons
                  name="musical-notes-outline"
                  size={20}
                  color={pickKind === 'audio' ? colors.brand.ink : '#fff'}
                />
                <Text style={[styles.pickBtnText, pickKind === 'audio' && styles.pickBtnTextActive]}>
                  ไฟล์เสียง
                </Text>
              </Pressable>
              <Pressable
                style={[styles.pickBtn, pickKind === 'video' && styles.pickBtnActive]}
                onPress={() => void pickVideo()}
              >
                <Ionicons
                  name="videocam-outline"
                  size={20}
                  color={pickKind === 'video' ? colors.brand.ink : '#fff'}
                />
                <Text style={[styles.pickBtnText, pickKind === 'video' && styles.pickBtnTextActive]}>
                  วิดีโอเพลง
                </Text>
              </Pressable>
            </View>

            {fileName ? (
              <View style={styles.fileBtn}>
                <Ionicons
                  name={pickKind === 'video' ? 'film-outline' : 'cloud-upload-outline'}
                  size={22}
                  color={colors.brand.primary}
                />
                <Text style={styles.fileBtnText} numberOfLines={1}>
                  {fileName}
                </Text>
              </View>
            ) : null}

            <TextInput
              style={styles.input}
              placeholder="พิมพ์ชื่อเพลง"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="พิมพ์ชื่อศิลปิน / ร้าน (ไม่บังคับ)"
              placeholderTextColor="rgba(255,255,255,0.35)"
              value={artist}
              onChangeText={setArtist}
            />

            <Pressable
              style={[styles.submit, busy && { opacity: 0.6 }]}
              onPress={() => void onSubmit()}
              disabled={busy}
            >
              <Text style={styles.submitText}>{busy ? 'กำลังลง…' : 'เผยแพร่เข้าคลัง'}</Text>
            </Pressable>
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
    backgroundColor: '#15241E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingBottom: 36,
    paddingTop: 10,
    gap: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 6,
  },
  title: { color: '#fff', fontWeight: '900', fontSize: 18 },
  sub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 17, marginBottom: 4 },
  pickRow: { flexDirection: 'row', gap: 8 },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pickBtnActive: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  pickBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  pickBtnTextActive: { color: colors.brand.ink },
  fileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,214,143,0.12)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,214,143,0.35)',
  },
  fileBtnText: { color: '#fff', fontWeight: '700', flex: 1, fontSize: 13 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  submit: {
    marginTop: 6,
    backgroundColor: colors.brand.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: colors.brand.ink, fontWeight: '900', fontSize: 15 },
});
