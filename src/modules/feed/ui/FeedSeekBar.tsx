import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type Props = {
  /** 0..1 progress of the current clip. */
  progress: number;
  /** Current playback time in seconds. */
  currentTime: number;
  /** Total duration in seconds. */
  duration: number;
  /** Called while the user is scrubbing (real-time preview). */
  onScrub?: (ratio: number) => void;
  /** Called once when the user releases the thumb (commit seek). */
  onSeek?: (ratio: number) => void;
  /** Called when the user starts interacting with the bar. */
  onScrubStart?: () => void;
  /** Called when the user stops interacting with the bar. */
  onScrubEnd?: () => void;
  bottomOffset?: number;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/**
 * TikTok-style seek bar with a draggable thumb and expandable track.
 * - Shows a faintly visible (35% opacity), elegant thin progress line at the bottom when playing normally.
 * - Touch hit area is kept large and tall (32px) so it's extremely easy to interact with.
 * - On touch/scrub, the progress line expands and brightens to 100% opacity, the circular thumb, and current time label smoothly fade in.
 * - On release, the track fades back to faintly visible, and thumb/labels hide.
 */
export function FeedSeekBar({
  progress,
  currentTime,
  duration,
  onScrub,
  onSeek,
  onScrubStart,
  onScrubEnd,
  bottomOffset = 0,
}: Props) {
  const widthRef = useRef(1);
  const thumbX = useSharedValue(0);
  const active = useSharedValue(0);
  const [isInteracting, setIsInteracting] = useState(false);

  const ratioToX = (ratio: number) => ratio * widthRef.current;
  const xToRatio = (x: number) => {
    const w = widthRef.current;
    if (w <= 0) return 0;
    return Math.min(1, Math.max(0, x / w));
  };

  // Keep the thumb in sync with the live progress when not scrubbing.
  useEffect(() => {
    if (!isInteracting) {
      thumbX.set(withTiming(ratioToX(progress), { duration: 80 }));
    }
  }, [isInteracting, progress, thumbX]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: thumbX.value },
      { scale: withTiming(active.value === 1 ? 1 : 0, { duration: 150 }) },
    ],
    opacity: withTiming(active.value === 1 ? 1 : 0, { duration: 150 }),
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: thumbX.value,
  }));

  const trackStyle = useAnimatedStyle(() => ({
    height: withTiming(active.value === 1 ? 5 : 2, { duration: 150 }),
    opacity: withTiming(active.value === 1 ? 1 : 0.35, { duration: 150 }), // Faintly visible (35% opacity) normally, 100% when active
  }));

  const timeRowStyle = useAnimatedStyle(() => ({
    opacity: withTiming(active.value, { duration: 150 }),
    transform: [
      { translateY: withTiming(active.value === 1 ? 0 : 4, { duration: 150 }) },
    ],
  }));

  const scrubTo = useCallback(
    (x: number) => {
      const ratio = xToRatio(x);
      thumbX.set(ratioToX(ratio));
      onScrub?.(ratio);
    },
    [onScrub, thumbX],
  );

  const commitSeek = useCallback(
    (x: number) => {
      const ratio = xToRatio(x);
      thumbX.set(ratioToX(ratio));
      onSeek?.(ratio);
    },
    [onSeek, thumbX],
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(() => {
      active.value = 1;
      runOnJS(setIsInteracting)(true);
      if (onScrubStart) runOnJS(onScrubStart)();
    })
    .onUpdate((e) => {
      runOnJS(scrubTo)(e.x);
    })
    .onEnd((e) => {
      runOnJS(commitSeek)(e.x);
      active.value = 0;
      runOnJS(setIsInteracting)(false);
      if (onScrubEnd) runOnJS(onScrubEnd)();
    })
    .onFinalize(() => {
      active.value = 0;
      runOnJS(setIsInteracting)(false);
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      runOnJS(commitSeek)(e.x);
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const showLabels = duration > 0;

  return (
    <View style={[styles.container, { bottom: 7 + bottomOffset }]} pointerEvents="auto">
      {showLabels && isInteracting ? (
        <Animated.View style={[styles.timeRow, timeRowStyle]} pointerEvents="none">
          <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        </Animated.View>
      ) : null}

      <GestureDetector gesture={gesture}>
        <View
          style={styles.trackHitArea}
          onLayout={(e) => {
            widthRef.current = Math.max(1, e.nativeEvent.layout.width);
          }}
        >
          <Animated.View style={[styles.track, trackStyle]}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </Animated.View>
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 7, // Kept at bottom: 7 to float perfectly above bottom bar
    zIndex: 99,
  },
  trackHitArea: {
    height: 32, // Large hit area of 32px for very easy touch/control interaction
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.3)', // Increased track background opacity so it is visible to users when idle
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  thumb: {
    position: 'absolute',
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'center', // Center the single current time indicator
    marginBottom: 8, // Place ABOVE the progress bar track with spacing
  },
  timeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
});
