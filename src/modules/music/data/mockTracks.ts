import type { MusicTrack } from '../domain/types';

const HELIX = (n: number) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;
const art = (seed: string) => `https://picsum.photos/seed/${seed}/800/800`;

/**
 * Chill-first long-form catalog for Listen Mode.
 * SoundHelix instrumentals ~5–7 min — safe demo streams.
 * `baseViews` = seed social heat (TikTok-style); local watches add on top.
 */
const RAW_TRACKS: MusicTrack[] = [
  {
    id: 'trk-chill-01',
    title: 'สวนยามเย็นจันทบุรี',
    artist: 'Boom Chill Radio',
    album: 'Chill Evenings',
    genre: 'chill',
    audioUrl: HELIX(1),
    artworkUrl: art('boom-chill-1'),
    durationHintSec: 372,
    feedMusicKeys: ['Battery Bounce — Viral Mix', 'Battery Bounce'],
  },
  {
    id: 'trk-chill-02',
    title: 'ลมทะเลท่าใหม่',
    artist: 'Coast Loft',
    album: 'Chill Evenings',
    genre: 'chill',
    audioUrl: HELIX(8),
    artworkUrl: art('boom-chill-2'),
    durationHintSec: 380,
  },
  {
    id: 'trk-lofi-01',
    title: 'Night Ride Chanthaburi',
    artist: 'Boom EV Radio',
    album: 'Lo-fi Nights',
    genre: 'lofi',
    audioUrl: HELIX(5),
    artworkUrl: art('boom-lofi-1'),
    durationHintSec: 390,
    feedMusicKeys: ['Night Ride Chanthaburi'],
  },
  {
    id: 'trk-lofi-02',
    title: 'Shop Loft Beats',
    artist: 'BoomMall Radio',
    album: 'Lo-fi Nights',
    genre: 'lofi',
    audioUrl: HELIX(6),
    artworkUrl: art('boom-lofi-2'),
    durationHintSec: 400,
    feedMusicKeys: ['Shop Loft Beats', 'Board EV'],
  },
  {
    id: 'trk-acoustic-01',
    title: 'Original Sound — BoomMall',
    artist: 'BoomMall',
    album: 'Creator Studio',
    genre: 'acoustic',
    audioUrl: HELIX(3),
    artworkUrl: art('boom-acoustic-1'),
    durationHintSec: 340,
    feedMusicKeys: ['Original Sound — BoomMall', 'Original Sound'],
  },
  {
    id: 'trk-acoustic-02',
    title: 'สายกีตาร์ริมน้ำ',
    artist: 'บ้านสวน Session',
    album: 'Acoustic Soft',
    genre: 'acoustic',
    audioUrl: HELIX(9),
    artworkUrl: art('boom-acoustic-2'),
    durationHintSec: 355,
  },
  {
    id: 'trk-nature-01',
    title: 'เสียงฝนบนหลังคาอู่',
    artist: 'Nature Boom',
    album: 'Soft Nature',
    genre: 'nature',
    audioUrl: HELIX(10),
    artworkUrl: art('boom-nature-1'),
    durationHintSec: 410,
  },
  {
    id: 'trk-nature-02',
    title: 'นกเช้าเขาคิชฌกูฏ',
    artist: 'Nature Boom',
    album: 'Soft Nature',
    genre: 'nature',
    audioUrl: HELIX(11),
    artworkUrl: art('boom-nature-2'),
    durationHintSec: 365,
  },
  {
    id: 'trk-drive-01',
    title: 'Community Charge — Big',
    artist: 'สถานีโค้ชบิ๊ก',
    album: 'Drive Soft',
    genre: 'drive',
    audioUrl: HELIX(2),
    artworkUrl: art('boom-drive-1'),
    durationHintSec: 358,
    feedMusicKeys: ['Community Charge — Big', 'Community Charge'],
  },
  {
    id: 'trk-drive-02',
    title: 'ทางเลียบคลองเย็นๆ',
    artist: 'EV Cruise',
    album: 'Drive Soft',
    genre: 'drive',
    audioUrl: HELIX(12),
    artworkUrl: art('boom-drive-2'),
    durationHintSec: 370,
  },
  {
    id: 'trk-focus-01',
    title: 'โฟกัสงานเบาๆ',
    artist: 'Deep Work Boom',
    album: 'Focus Flow',
    genre: 'focus',
    audioUrl: HELIX(13),
    artworkUrl: art('boom-focus-1'),
    durationHintSec: 420,
  },
  {
    id: 'trk-focus-02',
    title: 'กาแฟร้อน · โค้ดช้า',
    artist: 'Deep Work Boom',
    album: 'Focus Flow',
    genre: 'focus',
    audioUrl: HELIX(14),
    artworkUrl: art('boom-focus-2'),
    durationHintSec: 395,
  },
  {
    id: 'trk-community-01',
    title: 'Board Supply Garden',
    artist: 'ลุงสม บริการสวน',
    album: 'Community Board',
    genre: 'community',
    audioUrl: HELIX(4),
    artworkUrl: art('boom-community-1'),
    durationHintSec: 365,
    feedMusicKeys: ['Board Supply Garden', 'Community Board — Boom'],
  },
  {
    id: 'trk-community-02',
    title: 'ตลาดเช้าจันท์',
    artist: 'ชุมชน BoomMall',
    album: 'Community Board',
    genre: 'community',
    audioUrl: HELIX(15),
    artworkUrl: art('boom-community-2'),
    durationHintSec: 350,
  },
];

const SEED_VIEWS: Record<string, number> = {
  'trk-chill-01': 182_400,
  'trk-chill-02': 64_200,
  'trk-lofi-01': 128_800,
  'trk-lofi-02': 256_100,
  'trk-acoustic-01': 91_500,
  'trk-acoustic-02': 22_400,
  'trk-nature-01': 48_900,
  'trk-nature-02': 15_600,
  'trk-drive-01': 73_300,
  'trk-drive-02': 19_800,
  'trk-focus-01': 41_200,
  'trk-focus-02': 27_700,
  'trk-community-01': 112_000,
  'trk-community-02': 38_500,
};

export const MOCK_MUSIC_TRACKS: MusicTrack[] = RAW_TRACKS.map((t) => ({
  ...t,
  baseViews: SEED_VIEWS[t.id] ?? 1_200,
}));

export function findTrackByMusicTitle(
  musicTitle?: string | null,
  extras: MusicTrack[] = [],
): MusicTrack {
  const catalog = [...extras, ...MOCK_MUSIC_TRACKS];
  const key = (musicTitle ?? '').trim();
  if (key) {
    const hit = catalog.find(
      (t) =>
        t.title === key ||
        t.feedMusicKeys?.some((k) => k === key || key.includes(k) || k.includes(key)),
    );
    if (hit) return hit;
  }
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return catalog[h % catalog.length] ?? MOCK_MUSIC_TRACKS[0];
}

export function formatTrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export { searchTracksSmart as searchTracks } from '../domain/music-recommend';
