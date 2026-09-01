import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useCreateDraftStore } from '@/modules/create/state/create-draft-store';
import { openCreateCamera } from '@/shared/navigation/safeNavigate';
import type { MusicTrack } from '../domain/types';

/**
 * “ใช้เสียงนี้” — attach audio (and music-video uri when present) to create draft.
 */
export function applyThisSound(track: MusicTrack) {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  const mediaKind = track.mediaKind === 'video' ? 'video' : 'audio';
  useCreateDraftStore.getState().setDraft({
    music: track.title,
    musicArtist: track.artist,
    musicUri: track.localUri || track.audioUrl,
    musicTrackId: track.id,
    musicVideoUri: track.videoUrl || (mediaKind === 'video' ? track.audioUrl : ''),
    musicMediaKind: mediaKind,
  });
  const kindHint =
    mediaKind === 'video' ? 'วิดีโอเพลง — ใช้เสียงประกอบคลิปได้' : 'พร้อมสำหรับสร้างคอนเทนต์';
  Alert.alert('ใช้เสียงนี้', `「${track.title}」\n${kindHint}`, [
    { text: 'อยู่ต่อ', style: 'cancel' },
    {
      text: 'ไปสร้างเลย',
      onPress: () => {
        openCreateCamera();
      },
    },
  ]);
}

export function confirmUseThisSound(track: MusicTrack) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const body =
    track.mediaKind === 'video'
      ? `นำเสียงจากวิดีโอเพลง「${track.title}」ไปสร้างคอนเทนต์`
      : `นำ「${track.title}」ไปเป็นเสียงประกอบตอนสร้างคลิป`;
  Alert.alert('ใช้เสียงนี้?', body, [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ใช้เสียงนี้', onPress: () => applyThisSound(track) },
  ]);
}
