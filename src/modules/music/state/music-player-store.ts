import { create } from 'zustand';
import { MOCK_MUSIC_TRACKS, findTrackByMusicTitle } from '../data/mockTracks';
import type { MusicRepeatMode, MusicTrack } from '../domain/types';
import {
  activateLockScreen,
  ensureMusicAudioSession,
  forceStopMusicPlayer,
  musicAudioPlayer,
  subscribeMusicStatus,
  syncLockScreen,
} from '../audio/music-session';

type MusicPlayerState = {
  queue: MusicTrack[];
  index: number;
  track: MusicTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffering: boolean;
  repeat: MusicRepeatMode;
  shuffle: boolean;
  /** Mini player visible when a session is active and full screen is closed */
  miniVisible: boolean;
  expanded: boolean;
  playTrack: (track: MusicTrack, queue?: MusicTrack[]) => Promise<void>;
  playFromFeedMusic: (musicTitle: string, artist?: string) => Promise<void>;
  /** Smart radio: serve queue from taste / genre / seed */
  playRadio: (opts?: {
    seed?: MusicTrack | null;
    genre?: MusicTrack['genre'] | null;
  }) => Promise<void>;
  toggle: () => void;
  pause: () => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  setRepeat: (mode: MusicRepeatMode) => void;
  setShuffle: (on: boolean) => void;
  /** Reorder play queue; keeps current track selected */
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  setQueueOrder: (queue: MusicTrack[]) => void;
  expand: () => void;
  collapse: () => void;
  /** Stop audio + hide mini player (use when playback freezes). */
  dismiss: () => void;
  /** Alias — hard kill player immediately. */
  forceClose: () => void;
  /** Internal — driven by MusicPlayerHost */
  _applyStatus: (patch: {
    playing?: boolean;
    currentTime?: number;
    duration?: number;
    buffering?: boolean;
    didJustFinish?: boolean;
  }) => void;
};

let statusWired = false;

/** TikTok-style watch session — count a view after threshold, log history */
type WatchSession = {
  trackId: string;
  genre?: MusicTrack['genre'];
  viewed: boolean;
  maxTime: number;
};

let watchSession: WatchSession | null = null;

function beginWatchSession(track: MusicTrack) {
  watchSession = {
    trackId: track.id,
    genre: track.genre,
    viewed: false,
    maxTime: 0,
  };
}

async function tickWatchSession(currentTime: number) {
  if (!watchSession) return;
  watchSession.maxTime = Math.max(watchSession.maxTime, currentTime);
  if (watchSession.viewed || currentTime < 3) return;
  watchSession.viewed = true;
  try {
    const { useMusicLibraryStore } = await import('./music-library-store');
    useMusicLibraryStore.getState().recordView(watchSession.trackId, {
      watchedSec: watchSession.maxTime,
      completed: false,
      genre: watchSession.genre,
      countView: true,
    });
  } catch {
    /* ignore */
  }
}

async function completeWatchSession() {
  if (!watchSession) return;
  const session = watchSession;
  watchSession = null;
  try {
    const { useMusicLibraryStore } = await import('./music-library-store');
    useMusicLibraryStore.getState().recordView(session.trackId, {
      watchedSec: session.maxTime,
      completed: true,
      genre: session.genre,
      // Already counted at 3s — don't double-count heat, still log completion in history
      countView: !session.viewed,
    });
  } catch {
    /* ignore */
  }
}

/** Append smart radio tracks when near end so autoplay never stalls */
async function ensureAutoplayQueue(get: () => MusicPlayerState, set: (p: Partial<MusicPlayerState>) => void) {
  const { queue, index, track } = get();
  if (!track) return queue;
  if (index < queue.length - 2) return queue;
  try {
    const { useMusicLibraryStore } = await import('./music-library-store');
    const extra = useMusicLibraryStore.getState().serveQueue({ seed: track, limit: 24 });
    const seen = new Set(queue.map((t) => t.id));
    const append = extra.filter((t) => !seen.has(t.id));
    if (!append.length) return queue;
    const nextQueue = [...queue, ...append];
    set({ queue: nextQueue });
    return nextQueue;
  } catch {
    return queue;
  }
}

function wireStatusOnce(get: () => MusicPlayerState, set: (p: Partial<MusicPlayerState>) => void) {
  if (statusWired) return;
  statusWired = true;
  subscribeMusicStatus((status) => {
    get()._applyStatus({
      playing: status.playing,
      currentTime: status.currentTime,
      duration: status.duration > 0 ? status.duration : undefined,
      buffering: status.isBuffering,
      didJustFinish: status.didJustFinish,
    });
  });
  // Keep store in sync if host isn't mounted yet
  void set;
}

async function loadAndPlay(track: MusicTrack) {
  await ensureMusicAudioSession();
  musicAudioPlayer.replace(track.audioUrl);
  musicAudioPlayer.play();
  activateLockScreen(track);
  beginWatchSession(track);
}

export const useMusicPlayerStore = create<MusicPlayerState>((set, get) => {
  wireStatusOnce(get, set);

  return {
    queue: MOCK_MUSIC_TRACKS,
    index: 0,
    track: null,
    playing: false,
    currentTime: 0,
    duration: 0,
    buffering: false,
    repeat: 'all',
    shuffle: false,
    miniVisible: false,
    expanded: false,

    playTrack: async (track, queue) => {
      await completeWatchSession();
      const list = queue && queue.length > 0 ? queue : MOCK_MUSIC_TRACKS;
      const index = Math.max(
        0,
        list.findIndex((t) => t.id === track.id),
      );
      set({
        queue: list,
        index: index >= 0 ? index : 0,
        track,
        miniVisible: true,
        currentTime: 0,
        duration: track.durationHintSec,
        buffering: true,
      });
      await loadAndPlay(track);
      set({ playing: true, buffering: false });
      try {
        const { useMusicLibraryStore } = await import('./music-library-store');
        useMusicLibraryStore.getState().recordPlay(track.id, track.genre);
      } catch {
        // ignore stats failures
      }
    },

    playFromFeedMusic: async (musicTitle, artist) => {
      const { useMusicLibraryStore } = await import('./music-library-store');
      const catalog = useMusicLibraryStore.getState().allTracks();
      const base = findTrackByMusicTitle(musicTitle, catalog);
      await get().playTrack(
        {
          ...base,
          title: musicTitle?.trim() || base.title,
          artist: artist?.trim() || base.artist,
        },
        catalog.length > 0 ? catalog : MOCK_MUSIC_TRACKS,
      );
    },

    playRadio: async (opts) => {
      const { useMusicLibraryStore } = await import('./music-library-store');
      const lib = useMusicLibraryStore.getState();
      const queue = lib.serveQueue({
        seed: opts?.seed ?? get().track,
        genre: opts?.genre ?? null,
        limit: 40,
      });
      const start = opts?.seed ?? queue[0];
      if (!start || !queue.length) return;
      await get().playTrack(start, queue);
    },

    toggle: () => {
      const { track, playing } = get();
      if (!track) return;
      if (playing) {
        musicAudioPlayer.pause();
        set({ playing: false, miniVisible: false });
      } else {
        void ensureMusicAudioSession().then(() => {
          musicAudioPlayer.play();
          activateLockScreen(track);
          set({ playing: true, miniVisible: true });
        });
      }
    },

    pause: () => {
      musicAudioPlayer.pause();
      set({ playing: false, miniVisible: false });
    },

    next: async () => {
      await completeWatchSession();
      let { queue, index, shuffle, repeat } = get();
      if (queue.length === 0) return;
      queue = await ensureAutoplayQueue(get, set);
      let nextIndex: number;
      if (shuffle) {
        nextIndex = Math.floor(Math.random() * queue.length);
      } else if (index >= queue.length - 1) {
        if (repeat === 'off') {
          // Still auto-serve next from radio instead of hard stop
          queue = await ensureAutoplayQueue(get, set);
          if (index >= queue.length - 1) {
            musicAudioPlayer.pause();
            set({ playing: false, miniVisible: false });
            return;
          }
        }
        nextIndex = index >= queue.length - 1 ? 0 : index + 1;
      } else {
        nextIndex = index + 1;
      }
      const track = queue[nextIndex];
      if (!track) return;
      set({
        queue,
        index: nextIndex,
        track,
        currentTime: 0,
        duration: track.durationHintSec,
        miniVisible: true,
        playing: true,
      });
      await loadAndPlay(track);
      try {
        const { useMusicLibraryStore } = await import('./music-library-store');
        useMusicLibraryStore.getState().recordPlay(track.id, track.genre);
      } catch {
        /* ignore */
      }
    },

    prev: async () => {
      const { queue, index, currentTime } = get();
      if (queue.length === 0) return;
      if (currentTime > 3) {
        await musicAudioPlayer.seekTo(0);
        set({ currentTime: 0 });
        return;
      }
      await completeWatchSession();
      const prevIndex = index <= 0 ? queue.length - 1 : index - 1;
      const track = queue[prevIndex];
      if (!track) return;
      set({
        index: prevIndex,
        track,
        currentTime: 0,
        duration: track.durationHintSec,
        playing: true,
      });
      await loadAndPlay(track);
      try {
        const { useMusicLibraryStore } = await import('./music-library-store');
        useMusicLibraryStore.getState().recordPlay(track.id, track.genre);
      } catch {
        /* ignore */
      }
    },

    seekTo: async (seconds) => {
      await musicAudioPlayer.seekTo(Math.max(0, seconds));
      set({ currentTime: seconds });
    },

    setRepeat: (mode) => {
      musicAudioPlayer.loop = mode === 'one';
      set({ repeat: mode });
    },

    setShuffle: (on) => set({ shuffle: on }),

    reorderQueue: (fromIndex, toIndex) => {
      const { queue, track } = get();
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= queue.length ||
        toIndex >= queue.length ||
        fromIndex === toIndex
      ) {
        return;
      }
      const next = [...queue];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return;
      next.splice(toIndex, 0, moved);
      const newIndex = track ? Math.max(0, next.findIndex((t) => t.id === track.id)) : 0;
      set({ queue: next, index: newIndex >= 0 ? newIndex : 0 });
    },

    setQueueOrder: (queue) => {
      const { track } = get();
      if (queue.length === 0) {
        set({ queue: [], index: 0 });
        return;
      }
      const newIndex = track ? Math.max(0, queue.findIndex((t) => t.id === track.id)) : 0;
      set({ queue, index: newIndex >= 0 ? newIndex : 0 });
    },

    expand: () => set({ expanded: true, miniVisible: true }),
    collapse: () => set({ expanded: false, miniVisible: true }),

    dismiss: () => {
      void completeWatchSession();
      forceStopMusicPlayer();
      set({
        playing: false,
        buffering: false,
        miniVisible: false,
        expanded: false,
        track: null,
        currentTime: 0,
        duration: 0,
      });
    },

    forceClose: () => {
      get().dismiss();
    },

    _applyStatus: (patch) => {
      const state = get();
      if (patch.didJustFinish) {
        if (state.repeat === 'one') {
          void musicAudioPlayer.seekTo(0).then(() => {
            musicAudioPlayer.play();
            if (state.track) beginWatchSession(state.track);
          });
          return;
        }
        // Song ended → autoplay next (extends queue from recommend/serve)
        void get().next();
        return;
      }
      const next: Partial<MusicPlayerState> = {};
      if (patch.playing != null) next.playing = patch.playing;
      if (patch.currentTime != null) {
        next.currentTime = patch.currentTime;
        void tickWatchSession(patch.currentTime);
      }
      if (patch.duration != null && patch.duration > 0) next.duration = patch.duration;
      if (patch.buffering != null) next.buffering = patch.buffering;
      if (Object.keys(next).length) set(next);
      if (state.track && patch.playing) {
        syncLockScreen(state.track);
      }
    },
  };
});
