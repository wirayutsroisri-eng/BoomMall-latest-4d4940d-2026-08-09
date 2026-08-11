import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { create } from 'zustand';
import { MOCK_MUSIC_TRACKS } from '../data/mockTracks';
import { genreLabel } from '../domain/genre-meta';
import {
  buildRadioQueue,
  recommendedTracks,
  topGenres,
  type GenreAffinity,
  type TasteStats,
} from '../domain/music-recommend';
import {
  detectMusicMediaKind,
  type MusicGenre,
  type MusicTrack,
  type WatchHistoryEntry,
} from '../domain/types';

const STORAGE_KEY = 'boommall.music.library.v4';
const MUSIC_DIR = 'music-library';
/** TikTok-like: count a view after watching this many seconds */
export const VIEW_THRESHOLD_SEC = 3;
const WATCH_HISTORY_CAP = 120;

type PersistedLibrary = {
  uploads: MusicTrack[];
  loaded: Array<{ id: string; localUri?: string }>;
  pinnedIds: string[];
  hiddenIds: string[];
  recentPlayIds: string[];
  playCountById: Record<string, number>;
  genrePlayCount: Record<string, number>;
  viewCountById: Record<string, number>;
  watchHistory: WatchHistoryEntry[];
};

type MusicLibraryState = {
  ready: boolean;
  uploads: MusicTrack[];
  loadedIds: string[];
  localUriById: Record<string, string>;
  pinnedIds: string[];
  /** Soft-removed catalog tracks (user hid them) */
  hiddenIds: string[];
  /** Most recent first */
  recentPlayIds: string[];
  playCountById: Record<string, number>;
  /** Taste model — plays weighted by genre */
  genrePlayCount: Record<string, number>;
  /** Local view increments (added to track.baseViews for display/heat) */
  viewCountById: Record<string, number>;
  /** TikTok-style watch history (most recent first) */
  watchHistory: WatchHistoryEntry[];
  hydrate: () => Promise<void>;
  allTracks: () => MusicTrack[];
  tasteStats: () => TasteStats;
  topTasteGenres: (limit?: number) => GenreAffinity[];
  forYouTracks: (limit?: number) => MusicTrack[];
  /** Continuous serve queue for radio / autoplay */
  serveQueue: (opts?: {
    seed?: MusicTrack | null;
    genre?: MusicGenre | null;
    limit?: number;
  }) => MusicTrack[];
  /** baseViews + local views */
  totalViews: (trackId: string) => number;
  isLoaded: (trackId: string) => boolean;
  isPinned: (trackId: string) => boolean;
  pinTrack: (trackId: string) => void;
  unpinTrack: (trackId: string) => void;
  togglePin: (trackId: string) => void;
  /** Reorder pinned playlist (fromIndex → toIndex) */
  reorderPinned: (fromIndex: number, toIndex: number) => void;
  /** Call when a track starts playing — updates history + frequent + genre affinity */
  recordPlay: (trackId: string, genre?: MusicGenre) => void;
  /**
   * TikTok-style view: increments heat after threshold / completion,
   * and prepends ประวัติการชม.
   */
  recordView: (
    trackId: string,
    opts?: { watchedSec?: number; completed?: boolean; genre?: MusicGenre; countView?: boolean },
  ) => void;
  loadTrackToLibrary: (
    track: MusicTrack,
  ) => Promise<{ ok: true; localUri: string } | { ok: false; reason: string }>;
  unloadTrack: (trackId: string) => Promise<void>;
  uploadTrack: (input: {
    title: string;
    artist: string;
    genre?: MusicGenre;
    fileUri: string;
    mimeType?: string;
    uploadedBy?: string;
  }) => Promise<MusicTrack | null>;
  removeUpload: (trackId: string) => Promise<void>;
  /** Remove from list: uploads deleted; catalog soft-hidden */
  removeFromList: (track: MusicTrack) => Promise<void>;
  genreLabel: (genre: MusicGenre) => string;
};

function musicDir() {
  const dir = new Directory(Paths.document, MUSIC_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function extOf(uri: string) {
  const m = /\.(\w{2,5})(?:\?|#|$)/.exec(uri);
  return m ? m[1].toLowerCase() : 'mp3';
}

async function persist(state: MusicLibraryState) {
  const payload: PersistedLibrary = {
    uploads: state.uploads,
    loaded: state.loadedIds.map((id) => ({
      id,
      localUri: state.localUriById[id],
    })),
    pinnedIds: state.pinnedIds,
    hiddenIds: state.hiddenIds,
    recentPlayIds: state.recentPlayIds.slice(0, 80),
    playCountById: state.playCountById,
    genrePlayCount: state.genrePlayCount,
    viewCountById: state.viewCountById,
    watchHistory: state.watchHistory.slice(0, WATCH_HISTORY_CAP),
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function resolveGenre(
  trackId: string,
  uploads: MusicTrack[],
  hint?: MusicGenre,
): MusicGenre | undefined {
  if (hint) return hint;
  return (
    uploads.find((t) => t.id === trackId)?.genre ??
    MOCK_MUSIC_TRACKS.find((t) => t.id === trackId)?.genre
  );
}

function commit(set: (p: Partial<MusicLibraryState>) => void, get: () => MusicLibraryState, patch: Partial<MusicLibraryState>) {
  set(patch);
  void persist({ ...get(), ...patch } as MusicLibraryState);
}

export const useMusicLibraryStore = create<MusicLibraryState>((set, get) => ({
  ready: false,
  uploads: [],
  loadedIds: [],
  localUriById: {},
  pinnedIds: [],
  hiddenIds: [],
  recentPlayIds: [],
  playCountById: {},
  genrePlayCount: {},
  viewCountById: {},
  watchHistory: [],

  hydrate: async () => {
    try {
      const raw =
        (await AsyncStorage.getItem(STORAGE_KEY)) ??
        (await AsyncStorage.getItem('boommall.music.library.v3')) ??
        (await AsyncStorage.getItem('boommall.music.library.v2')) ??
        (await AsyncStorage.getItem('boommall.music.library.v1'));
      if (!raw) {
        set({ ready: true });
        return;
      }
      const data = JSON.parse(raw) as PersistedLibrary;
      const localUriById: Record<string, string> = {};
      for (const row of data.loaded ?? []) {
        if (row.localUri) localUriById[row.id] = row.localUri;
      }
      for (const u of data.uploads ?? []) {
        if (u.localUri) localUriById[u.id] = u.localUri;
      }
      // Migrate genrePlayCount from play history if missing
      let genrePlayCount = { ...(data.genrePlayCount ?? {}) };
      if (!data.genrePlayCount || !Object.keys(data.genrePlayCount).length) {
        const counts = data.playCountById ?? {};
        for (const [id, n] of Object.entries(counts)) {
          const g = resolveGenre(id, data.uploads ?? []);
          if (!g || g === 'upload') continue;
          genrePlayCount[g] = (genrePlayCount[g] ?? 0) + n;
        }
      }
      set({
        ready: true,
        uploads: data.uploads ?? [],
        loadedIds: (data.loaded ?? []).map((r) => r.id),
        localUriById,
        pinnedIds: data.pinnedIds ?? [],
        hiddenIds: data.hiddenIds ?? [],
        recentPlayIds: data.recentPlayIds ?? [],
        playCountById: data.playCountById ?? {},
        genrePlayCount,
        viewCountById: data.viewCountById ?? {},
        watchHistory: data.watchHistory ?? [],
      });
      void persist({ ...get() } as MusicLibraryState);
    } catch {
      set({ ready: true });
    }
  },

  allTracks: () => {
    const { uploads, localUriById, hiddenIds } = get();
    const hidden = new Set(hiddenIds);
    const overlay = (t: MusicTrack): MusicTrack =>
      localUriById[t.id]
        ? { ...t, localUri: localUriById[t.id], audioUrl: localUriById[t.id]! }
        : t;
    // Natural catalog order (uploads first) — pin order lives only in pinnedIds / ปักหมุด tab
    return [...uploads.map(overlay), ...MOCK_MUSIC_TRACKS.map(overlay)].filter(
      (t) => !hidden.has(t.id),
    );
  },

  tasteStats: () => {
    const s = get();
    const catalog = get().allTracks();
    const viewCountById: Record<string, number> = { ...s.viewCountById };
    for (const t of catalog) {
      const local = s.viewCountById[t.id] ?? 0;
      viewCountById[t.id] = (t.baseViews ?? 0) + local;
    }
    return {
      playCountById: s.playCountById,
      recentPlayIds: s.recentPlayIds,
      genrePlayCount: s.genrePlayCount,
      pinnedIds: s.pinnedIds,
      viewCountById,
    };
  },

  topTasteGenres: (limit = 3) => topGenres(get().tasteStats(), limit),

  forYouTracks: (limit = 24) => recommendedTracks(get().allTracks(), get().tasteStats(), limit),

  serveQueue: (opts) => buildRadioQueue(get().allTracks(), get().tasteStats(), opts),

  totalViews: (trackId) => {
    const local = get().viewCountById[trackId] ?? 0;
    const base =
      get().uploads.find((t) => t.id === trackId)?.baseViews ??
      MOCK_MUSIC_TRACKS.find((t) => t.id === trackId)?.baseViews ??
      0;
    return base + local;
  },

  genreLabel: (genre) => genreLabel(genre),

  isLoaded: (trackId) => {
    const s = get();
    return s.loadedIds.includes(trackId) || Boolean(s.localUriById[trackId]);
  },

  isPinned: (trackId) => get().pinnedIds.includes(trackId),

  pinTrack: (trackId) => {
    const s = get();
    if (s.pinnedIds.includes(trackId)) return;
    commit(set, get, { pinnedIds: [trackId, ...s.pinnedIds] });
  },

  unpinTrack: (trackId) => {
    commit(set, get, { pinnedIds: get().pinnedIds.filter((id) => id !== trackId) });
  },

  togglePin: (trackId) => {
    if (get().isPinned(trackId)) get().unpinTrack(trackId);
    else get().pinTrack(trackId);
  },

  reorderPinned: (fromIndex, toIndex) => {
    const ids = [...get().pinnedIds];
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= ids.length ||
      toIndex >= ids.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = ids.splice(fromIndex, 1);
    if (!moved) return;
    ids.splice(toIndex, 0, moved);
    commit(set, get, { pinnedIds: ids });
  },

  recordPlay: (trackId, genreHint) => {
    if (!trackId) return;
    const s = get();
    const recentPlayIds = [trackId, ...s.recentPlayIds.filter((id) => id !== trackId)].slice(0, 80);
    const playCountById = {
      ...s.playCountById,
      [trackId]: (s.playCountById[trackId] ?? 0) + 1,
    };
    const genre = resolveGenre(trackId, s.uploads, genreHint);
    const genrePlayCount = { ...s.genrePlayCount };
    if (genre && genre !== 'upload') {
      genrePlayCount[genre] = (genrePlayCount[genre] ?? 0) + 1;
    }
    commit(set, get, { recentPlayIds, playCountById, genrePlayCount });
  },

  recordView: (trackId, opts) => {
    if (!trackId) return;
    const s = get();
    const watchedSec = Math.max(0, Math.floor(opts?.watchedSec ?? 0));
    const completed = Boolean(opts?.completed);
    const shouldCount =
      opts?.countView !== false && (completed || watchedSec >= VIEW_THRESHOLD_SEC);

    const entry: WatchHistoryEntry = {
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      trackId,
      at: new Date().toISOString(),
      watchedSec,
      completed,
    };
    // Collapse rapid duplicates of same track at top
    const rest = s.watchHistory.filter(
      (h, i) => !(i < 3 && h.trackId === trackId && Date.now() - Date.parse(h.at) < 20_000),
    );
    const watchHistory = [entry, ...rest].slice(0, WATCH_HISTORY_CAP);

    const viewCountById = { ...s.viewCountById };
    if (shouldCount) {
      viewCountById[trackId] = (viewCountById[trackId] ?? 0) + 1;
    }

    commit(set, get, { watchHistory, viewCountById });
  },

  loadTrackToLibrary: async (track) => {
    try {
      const dir = musicDir();
      const dest = new File(dir, `${track.id}.${extOf(track.audioUrl)}`);
      const sourceUrl = track.localUri || track.audioUrl;
      if (sourceUrl.startsWith('file://') || sourceUrl.startsWith('/')) {
        const loadedIds = get().loadedIds.includes(track.id)
          ? get().loadedIds
          : [...get().loadedIds, track.id];
        const localUriById = { ...get().localUriById, [track.id]: sourceUrl };
        commit(set, get, { loadedIds, localUriById });
        return { ok: true, localUri: sourceUrl };
      }
      const file = await File.downloadFileAsync(sourceUrl, dest, { idempotent: true });
      const localUri = file.uri;
      const loadedIds = get().loadedIds.includes(track.id)
        ? get().loadedIds
        : [...get().loadedIds, track.id];
      const localUriById = { ...get().localUriById, [track.id]: localUri };
      commit(set, get, { loadedIds, localUriById });
      return { ok: true, localUri };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : 'download_failed' };
    }
  },

  unloadTrack: async (trackId) => {
    const loadedIds = get().loadedIds.filter((id) => id !== trackId);
    const localUriById = { ...get().localUriById };
    delete localUriById[trackId];
    commit(set, get, { loadedIds, localUriById });
  },

  uploadTrack: async (input) => {
    try {
      const dir = musicDir();
      const id = `upload-${Date.now()}`;
      const mediaKind = detectMusicMediaKind(input.fileUri, input.mimeType);
      const dest = new File(dir, `${id}.${extOf(input.fileUri)}`);
      const source = new File(input.fileUri);
      source.copy(dest, { overwrite: true });
      const track: MusicTrack = {
        id,
        title: input.title.trim() || (mediaKind === 'video' ? 'วิดีโอเพลง' : 'เพลงที่อัปโหลด'),
        artist: input.artist.trim() || 'ชุมชน BoomMall',
        album: mediaKind === 'video' ? 'วิดีโอเพลงชุมชน' : 'อัปโหลดชุมชน',
        genre: input.genre ?? 'upload',
        mediaKind,
        audioUrl: dest.uri,
        videoUrl: mediaKind === 'video' ? dest.uri : undefined,
        localUri: dest.uri,
        artworkUrl: `https://picsum.photos/seed/${id}/800/800`,
        durationHintSec: mediaKind === 'video' ? 210 : 240,
        isUpload: true,
        uploadedBy: input.uploadedBy ?? 'คุณ',
      };
      const uploads = [track, ...get().uploads];
      const loadedIds = get().loadedIds.includes(id) ? get().loadedIds : [...get().loadedIds, id];
      const localUriById = { ...get().localUriById, [id]: dest.uri };
      commit(set, get, { uploads, loadedIds, localUriById });
      return track;
    } catch {
      return null;
    }
  },

  removeUpload: async (trackId) => {
    const uploads = get().uploads.filter((t) => t.id !== trackId);
    const loadedIds = get().loadedIds.filter((id) => id !== trackId);
    const pinnedIds = get().pinnedIds.filter((id) => id !== trackId);
    const localUriById = { ...get().localUriById };
    delete localUriById[trackId];
    commit(set, get, { uploads, loadedIds, pinnedIds, localUriById });
  },

  removeFromList: async (track) => {
    if (track.isUpload) {
      await get().removeUpload(track.id);
      return;
    }
    const hiddenIds = get().hiddenIds.includes(track.id)
      ? get().hiddenIds
      : [...get().hiddenIds, track.id];
    const pinnedIds = get().pinnedIds.filter((id) => id !== track.id);
    commit(set, get, { hiddenIds, pinnedIds });
  },
}));
