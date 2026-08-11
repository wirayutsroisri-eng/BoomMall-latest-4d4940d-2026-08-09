import { createAudioPlayer, setAudioModeAsync, type AudioStatus } from 'expo-audio';
import type { MusicTrack } from '../domain/types';

/** Singleton player — survives screen unmount for background / lock-screen playback. */
export const musicAudioPlayer = createAudioPlayer(null, {
  updateInterval: 250,
  keepAudioSessionActive: true,
});

/** Re-apply every play — chat recording may have switched the session to mic mode. */
export async function ensureMusicAudioSession(): Promise<void> {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: false,
  });
}

/** Call before chat voice recording so mic session can take over. */
export async function pauseMusicForRecording(): Promise<void> {
  if (musicAudioPlayer.playing) {
    musicAudioPlayer.pause();
  }
}

/** Hard stop — unsticks frozen playback and clears lock-screen controls. */
export function forceStopMusicPlayer(): void {
  try {
    musicAudioPlayer.pause();
  } catch {
    /* noop */
  }
  try {
    musicAudioPlayer.clearLockScreenControls();
  } catch {
    /* noop */
  }
  try {
    void musicAudioPlayer.seekTo(0);
  } catch {
    /* noop */
  }
  try {
    musicAudioPlayer.replace(null);
  } catch {
    /* noop */
  }
}

export function activateLockScreen(track: MusicTrack): void {
  musicAudioPlayer.setActiveForLockScreen(
    true,
    {
      title: track.title,
      artist: track.artist,
      albumTitle: track.album,
      artworkUrl: track.artworkUrl,
    },
    {
      showSeekForward: true,
      showSeekBackward: true,
    },
  );
}

export function syncLockScreen(track: MusicTrack): void {
  musicAudioPlayer.updateLockScreenMetadata({
    title: track.title,
    artist: track.artist,
    albumTitle: track.album,
    artworkUrl: track.artworkUrl,
  });
}

export type MusicPlayerStatusListener = (status: AudioStatus) => void;

export function subscribeMusicStatus(listener: MusicPlayerStatusListener) {
  return musicAudioPlayer.addListener('playbackStatusUpdate', listener);
}
