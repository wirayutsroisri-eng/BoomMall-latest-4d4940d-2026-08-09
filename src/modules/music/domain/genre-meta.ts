import type { MusicGenre } from './types';

export type TasteGenre = Exclude<MusicGenre, 'upload'>;

export type GenreMeta = {
  key: TasteGenre;
  labelTh: string;
  labelEn: string;
  /** Related genres for “if you like X, try Y” */
  related: TasteGenre[];
  /** Search aliases (TH/EN) */
  aliases: string[];
};

/** Catalog genres only — `upload` is user content, not a taste cluster. */
export const GENRE_META: Record<TasteGenre, GenreMeta> = {
  chill: {
    key: 'chill',
    labelTh: 'ชิลล์',
    labelEn: 'Chill',
    related: ['lofi', 'nature', 'focus'],
    aliases: ['chill', 'ชิล', 'ชิลล์', 'ชิลๆ', 'เย็น', 'ผ่อนคลาย'],
  },
  lofi: {
    key: 'lofi',
    labelTh: 'โลฟาย',
    labelEn: 'Lo-fi',
    related: ['chill', 'focus', 'drive'],
    aliases: ['lofi', 'lo-fi', 'lo fi', 'โลฟาย', 'โลไฟ', 'บีท'],
  },
  acoustic: {
    key: 'acoustic',
    labelTh: 'อะคูสติก',
    labelEn: 'Acoustic',
    related: ['community', 'chill', 'nature'],
    aliases: ['acoustic', 'อะคูสติก', 'กีตาร์', 'guitar', 'สด'],
  },
  nature: {
    key: 'nature',
    labelTh: 'ธรรมชาติ',
    labelEn: 'Nature',
    related: ['chill', 'focus', 'acoustic'],
    aliases: ['nature', 'ธรรมชาติ', 'ฝน', 'นก', 'ambient', 'แอมเบียนต์'],
  },
  drive: {
    key: 'drive',
    labelTh: 'ขับรถ',
    labelEn: 'Drive',
    related: ['lofi', 'community', 'chill'],
    aliases: ['drive', 'ขับรถ', 'ครุยส์', 'cruise', 'ทาง'],
  },
  focus: {
    key: 'focus',
    labelTh: 'โฟกัส',
    labelEn: 'Focus',
    related: ['lofi', 'chill', 'nature'],
    aliases: ['focus', 'โฟกัส', 'ทำงาน', 'อ่านหนังสือ', 'deep work', 'สมาธิ'],
  },
  community: {
    key: 'community',
    labelTh: 'ชุมชน',
    labelEn: 'Community',
    related: ['acoustic', 'drive', 'chill'],
    aliases: ['community', 'ชุมชน', 'ตลาด', 'บอร์ด', 'board'],
  },
};

export const TASTE_GENRES = Object.keys(GENRE_META) as TasteGenre[];

export function genreLabel(genre: MusicGenre): string {
  if (genre === 'upload') return 'อัปโหลด';
  return GENRE_META[genre]?.labelTh ?? genre;
}

export function matchGenreQuery(query: string): TasteGenre | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  for (const key of TASTE_GENRES) {
    const meta = GENRE_META[key];
    if (meta.key === q || meta.labelTh.toLowerCase() === q || meta.labelEn.toLowerCase() === q) {
      return key;
    }
    if (meta.aliases.some((a) => a.toLowerCase() === q || q.includes(a.toLowerCase()))) {
      return key;
    }
  }
  return null;
}

export function trackMatchesGenreQuery(trackGenre: MusicGenre, query: string): boolean {
  const hit = matchGenreQuery(query);
  if (hit) return trackGenre === hit;
  const q = query.trim().toLowerCase();
  if (!q || trackGenre === 'upload') return false;
  const meta = GENRE_META[trackGenre];
  return meta.aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()));
}
