import React, { useEffect, useRef } from 'react';
import { AppState, StyleSheet, type AppStateStatus, type StyleProp, type ViewStyle } from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';

type Props = {
  uri: string;
  /** ขนาดจริงของวิดีโอ (width/height) — ไม่ใส่จะเต็มจอ (absoluteFill) */
  style?: StyleProp<ViewStyle>;
  isActive?: boolean;
  isManuallyPaused?: boolean;
  /** วิธี fit วิดีโอในกรอบ — 'contain' = แสดงสัดส่วนดั้งเดิมไม่ crop/ซูม (เหมือนรูปภาพ), 'cover' = เต็มกรอบ (อาจ crop) */
  contentFit?: 'contain' | 'cover';
  /** Called once the player instance is created so the parent can drive play/pause/seek. */
  onPlayerReady?: (player: VideoPlayer) => void;
  /** Called once the player reports the video's real pixel dimensions (no scale). */
  onVideoSize?: (width: number, height: number) => void;
};

/**
 * Full-bleed looping clip on a feed card.
 *
 * Play/pause ownership:
 * - FeedReelCard drives the player directly on tap (manual play/pause).
 * - This layer only manages lifecycle: pause when off-screen, autoplay when the
 *   clip becomes active, and ALWAYS respects `isManuallyPaused` — a user pause
 *   wins over autoplay even while `isActive` stays true.
 */
export function FeedVideoLayer({
  uri,
  style,
  isActive = false,
  isManuallyPaused = false,
  contentFit = 'contain',
  onPlayerReady,
  onVideoSize,
}: Props) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = false;
    instance.currentTime = 0;
    // Emit time updates ~4x/sec so the seek bar stays smooth without jank.
    instance.timeUpdateEventInterval = 0.25;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const wasActiveRef = useRef(false);
  const previousPlayerRef = useRef<VideoPlayer | null>(null);
  const manualPauseRef = useRef(isManuallyPaused);

  // อ่านขนาดพิกเซลจริงจาก videoTrack เมื่อวิดีโอพร้อมเล่น → ให้ฟีดแสดงสัดส่วนจริง
  // `lastSizeRef` guards the callback: if the parent passes a fresh closure on
  // every render, `onVideoSize?.()` would be called with the same dimensions and
  // (with a naive parent) trigger a new render → effect re-run → infinite loop.
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (status !== 'readyToPlay') return;
    const videoTrack = player.videoTrack;
    if (!videoTrack) return;
    const w = videoTrack.size.width;
    const h = videoTrack.size.height;
    if (w <= 0 || h <= 0) return;
    const last = lastSizeRef.current;
    if (last && last.width === w && last.height === h) return;
    lastSizeRef.current = { width: w, height: h };
    onVideoSize?.(w, h);
  }, [onVideoSize, player, status]);

  // Keep the ref in sync with the latest prop without writing it during render.
  useEffect(() => {
    manualPauseRef.current = isManuallyPaused;
  }, [isManuallyPaused]);

  useEffect(() => {
    onPlayerReady?.(player);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);

  useEffect(() => {
    // Off-screen always wins: pause + mute so the next visible reel is silent.
    if (!isActive) {
      wasActiveRef.current = false;
      previousPlayerRef.current = player;
      // ปิดเสียงทันที (Mute) เพื่อไม่ให้เสียงตีกัน (เบาและไม่กิน CPU)
      player.muted = true;
      // ปล่อยให้หน้าจอเลื่อนเข้าล็อกลื่นไหล 100% แล้วจึงค่อยสั่ง Pause ตัวเก่าเงียบๆ หลังจากเลื่อนเสร็จ (ประมาณ 200ms)
      const timer = setTimeout(() => {
        if (player.playing) player.pause();
      }, 200);
      return () => clearTimeout(timer);
    }

    player.muted = false;

    // True only the first time this clip becomes active, or when the user
    // scrolled away and back (wasActiveRef reset to false on the way out).
    const justActivated = !wasActiveRef.current || previousPlayerRef.current !== player;
    wasActiveRef.current = true;
    previousPlayerRef.current = player;

    // A tap-pause must never be overridden by autoplay — even if isActive
    // stays true the whole time. FeedReelCard resets manualPauseRef when this
    // card becomes active again after scrolling to another clip.
    if (manualPauseRef.current) {
      if (player.playing) player.pause();
      return;
    }

    // Otherwise resume playback only when this clip just became active. If it
    // was already active, the parent (FeedReelCard) drives play/pause via tap.
    if (justActivated && !player.playing && AppState.currentState === 'active') {
      console.log('[VIDEO_DEBUG] AUTOPLAY_CALLED', { uri });
      player.play();
    }
  }, [isActive, isManuallyPaused, player, uri]);

  // Handle app state changes (e.g. background/foreground, lock/unlock)
  useEffect(() => {
    const handleAppStateChange = (nextStatus: AppStateStatus) => {
      if (!isActive) return;

      if (nextStatus === 'active') {
        // App resumed: play only if it wasn't manually paused
        if (!manualPauseRef.current && !player.playing) {
          console.log('[VIDEO_DEBUG] RESUME_ON_APP_ACTIVE', { uri });
          player.play();
        }
      } else if (nextStatus === 'inactive' || nextStatus === 'background') {
        // App sent to background: pause to save resources
        if (player.playing) {
          console.log('[VIDEO_DEBUG] PAUSE_ON_APP_BACKGROUND', { uri });
          player.pause();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
    };
  }, [isActive, player, uri]);

  return (
    <VideoView
      player={player}
      style={[style ?? StyleSheet.absoluteFill, styles.base]}
      contentFit={contentFit}
      surfaceType="textureView"
      pointerEvents="none"
      nativeControls={false}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'center',
  },
});
