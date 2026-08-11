import {
  GENRE_META,
  TASTE_GENRES,
  genreLabel,
  matchGenreQuery,
  trackMatchesGenreQuery,
  type TasteGenre,
} from './genre-meta';
import type { MusicGenre, MusicTrack } from './types';

export type TasteStats = {
  playCountById: Record<string, number>;
  /** Most recent first */
  recentPlayIds: string[];
  genrePlayCount: Record<string, number>;
  pinnedIds: string[];
  /** Local + social heat (baseViews folded in by caller via totalViews) */
  viewCountById: Record<string, number>;
};

export type GenreAffinity = {
  genre: TasteGenre;
  score: number;
  label: string;
};

export type RecommendReason =
  | 'frequent'
  | 'hot'
  | 'genre'
  | 'related'
  | 'pinned'
  | 'fresh';

function heatScore(views: number): number {
  if (views <= 0) return 0;
  return Math.log10(1 + views) * 9;
}

export type RankedTrack = {
  track: MusicTrack;
  score: number;
  reason: RecommendReason;
};

function tasteGenreOf(g: MusicGenre): TasteGenre | null {
  return g === 'upload' ? null : g;
}

/** Soften repeats so radio doesn’t loop the same 2 songs. */
function diversityPenalty(trackId: string, recentPlayIds: string[]): number {
  const idx = recentPlayIds.indexOf(trackId);
  if (idx < 0) return 0;
  if (idx < 3) return 40;
  if (idx < 10) return 18;
  return 6;
}

export function buildGenreAffinity(stats: TasteStats): GenreAffinity[] {
  const rows: GenreAffinity[] = TASTE_GENRES.map((genre) => {
    const direct = stats.genrePlayCount[genre] ?? 0;
    let relatedBoost = 0;
    for (const other of GENRE_META[genre].related) {
      relatedBoost += (stats.genrePlayCount[other] ?? 0) * 0.25;
    }
    // Recency: last 12 plays in this genre
    const recentBoost = stats.recentPlayIds.slice(0, 12).reduce((sum, id, i) => {
      // id alone isn’t enough — caller can enrich; keep light bias via playCount proxy
      const weight = (12 - i) / 12;
      return sum + (stats.playCountById[id] ? weight * 0.15 : 0);
    }, 0);
    const score = direct * 3 + relatedBoost + recentBoost;
    return { genre, score, label: genreLabel(genre) };
  });
  return rows.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

export function topGenres(stats: TasteStats, limit = 3): GenreAffinity[] {
  const affinity = buildGenreAffinity(stats);
  if (affinity.length) return affinity.slice(0, limit);
  // Cold start — suggest chill / lofi as gentle defaults
  const cold: GenreAffinity[] = [
    { genre: 'chill', score: 1, label: genreLabel('chill') },
    { genre: 'lofi', score: 1, label: genreLabel('lofi') },
  ];
  return cold.slice(0, limit);
}

/**
 * Rank catalog for “For You”: frequent plays + preferred genres + related + pins.
 */
export function rankForYou(catalog: MusicTrack[], stats: TasteStats): RankedTrack[] {
  const pinSet = new Set(stats.pinnedIds);
  const affinity = new Map(buildGenreAffinity(stats).map((g) => [g.genre, g.score]));
  const topSet = new Set(topGenres(stats, 3).map((g) => g.genre));

  const ranked: RankedTrack[] = catalog.map((track) => {
    const plays = stats.playCountById[track.id] ?? 0;
    const views = stats.viewCountById[track.id] ?? track.baseViews ?? 0;
    const heat = heatScore(views);
    const g = tasteGenreOf(track.genre);
    const genreScore = g ? (affinity.get(g) ?? 0) : 0;
    let relatedScore = 0;
    if (g) {
      for (const rel of GENRE_META[g].related) {
        if (topSet.has(rel)) relatedScore += 4;
      }
      if (topSet.has(g)) relatedScore += 10;
    }
    const pinBonus = pinSet.has(track.id) ? 8 : 0;
    const freshBonus = plays === 0 && g && topSet.has(g) ? 12 : 0;
    const score =
      plays * 4 +
      heat +
      genreScore * 2.2 +
      relatedScore +
      pinBonus +
      freshBonus -
      diversityPenalty(track.id, stats.recentPlayIds);

    let reason: RecommendReason = 'fresh';
    if (plays >= 2) reason = 'frequent';
    else if (heat >= heatScore(50_000)) reason = 'hot';
    else if (pinBonus) reason = 'pinned';
    else if (g && topSet.has(g)) reason = 'genre';
    else if (relatedScore > 0) reason = 'related';

    return { track, score, reason };
  });

  return ranked.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title));
}

export function recommendedTracks(
  catalog: MusicTrack[],
  stats: TasteStats,
  limit = 24,
): MusicTrack[] {
  return rankForYou(catalog, stats)
    .slice(0, limit)
    .map((r) => r.track);
}

/**
 * Build a continuous serve / radio queue:
 * seed → same genre → related genres → frequent → fill by For You score.
 */
export function buildRadioQueue(
  catalog: MusicTrack[],
  stats: TasteStats,
  opts?: { seed?: MusicTrack | null; genre?: MusicGenre | null; limit?: number },
): MusicTrack[] {
  const limit = opts?.limit ?? 40;
  const seed = opts?.seed ?? null;
  const forcedGenre = opts?.genre ?? seed?.genre ?? topGenres(stats, 1)[0]?.genre ?? 'chill';
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const out: MusicTrack[] = [];
  const seen = new Set<string>();

  const push = (t?: MusicTrack | null) => {
    if (!t || seen.has(t.id)) return;
    seen.add(t.id);
    out.push(t);
  };

  if (seed) push(seed);

  const sameGenre = catalog.filter((t) => t.genre === forcedGenre);
  // Prefer less-recent within genre
  sameGenre
    .slice()
    .sort(
      (a, b) =>
        (stats.playCountById[b.id] ?? 0) - (stats.playCountById[a.id] ?? 0) ||
        stats.recentPlayIds.indexOf(a.id) - stats.recentPlayIds.indexOf(b.id),
    )
    .forEach(push);

  const related =
    forcedGenre !== 'upload' ? GENRE_META[forcedGenre as Exclude<MusicGenre, 'upload'>].related : [];
  for (const g of related) {
    catalog.filter((t) => t.genre === g).forEach(push);
  }

  // Frequent plays
  Object.entries(stats.playCountById)
    .sort((a, b) => b[1] - a[1])
    .forEach(([id]) => push(byId.get(id)));

  // Viral / hot by views
  [...catalog]
    .sort(
      (a, b) =>
        (stats.viewCountById[b.id] ?? b.baseViews ?? 0) -
        (stats.viewCountById[a.id] ?? a.baseViews ?? 0),
    )
    .forEach(push);

  // Pins as anchors
  stats.pinnedIds.forEach((id) => push(byId.get(id)));

  // Fill with For You ranking
  for (const row of rankForYou(catalog, stats)) {
    if (out.length >= limit) break;
    push(row.track);
  }

  // Final fill
  for (const t of catalog) {
    if (out.length >= limit) break;
    push(t);
  }

  return out.slice(0, limit);
}

/** Search that understands genre names (ชิลล์ / lofi / โฟกัส…) */
export function searchTracksSmart(tracks: MusicTrack[], query: string): MusicTrack[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  const genreHit = matchGenreQuery(q);
  return tracks.filter((t) => {
    if (genreHit && t.genre === genreHit) return true;
    if (trackMatchesGenreQuery(t.genre, q)) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      (t.album?.toLowerCase().includes(q) ?? false) ||
      t.genre.toLowerCase().includes(q) ||
      (t.mediaKind === 'video' && (q.includes('วิดีโอ') || q.includes('video')))
    );
  });
}

export function reasonLabel(reason: RecommendReason): string {
  switch (reason) {
    case 'frequent':
      return 'เล่นบ่อย';
    case 'hot':
      return 'กำลังฮิต';
    case 'genre':
      return 'แนวที่ชอบ';
    case 'related':
      return 'แนวใกล้เคียง';
    case 'pinned':
      return 'ปักหมุด';
    default:
      return 'แนะนำลองฟัง';
  }
}
