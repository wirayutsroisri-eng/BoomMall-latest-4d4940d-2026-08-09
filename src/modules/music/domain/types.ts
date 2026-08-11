/** Optional tag kept for search keywords only — not a UI category picker. */
export type MusicGenre =
  | 'chill'
  | 'lofi'
  | 'acoustic'
  | 'nature'
  | 'drive'
  | 'focus'
  | 'community'
  | 'upload';

export type MusicMediaKind = 'audio' | 'video';

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  /** Soft tag for search only (not shown as category chips). */
  genre: MusicGenre;
  /** audio = mp3/m4a · video = music video (mp4/mov) — play audio track; keep video for create */
  mediaKind?: MusicMediaKind;
  /** Stream / local path used by expo-audio (works for many mp4 audio tracks too) */
  audioUrl: string;
  /** Present when upload is a music video — used by “ใช้เสียงนี้” for create content */
  videoUrl?: string;
  artworkUrl: string;
  durationHintSec: number;
  feedMusicKeys?: string[];
  isUpload?: boolean;
  localUri?: string;
  uploadedBy?: string;
  /** Seed social views for catalog (TikTok-style heat) — local watches add on top */
  baseViews?: number;
};

/** One watch session in ประวัติการชม (most recent first in store). */
export type WatchHistoryEntry = {
  id: string;
  trackId: string;
  at: string;
  watchedSec: number;
  completed: boolean;
};

export type MusicRepeatMode = 'off' | 'one' | 'all';

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(?:\?|#|$)/i;
const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)(?:\?|#|$)/i;

export function detectMusicMediaKind(uri: string, mimeHint?: string): MusicMediaKind {
  const mime = (mimeHint ?? '').toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (VIDEO_EXT.test(uri)) return 'video';
  if (AUDIO_EXT.test(uri)) return 'audio';
  return 'audio';
}
