import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '@/modules/chat/state/call-store';
import { colors } from '@/shared/theme/colors';

export function CallActionBar() {
  const muted = useCallStore((s) => s.muted);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const type = useCallStore((s) => s.type);
  const toggleMute = useCallStore((s) => s.toggleMute);
  const toggleCamera = useCallStore((s) => s.toggleCamera);
  const endCall = useCallStore((s) => s.endCall);

  return (
    <View style={styles.bar}>
      <Pressable style={styles.btn} onPress={toggleMute}>
        <Ionicons name={muted ? 'mic-off' : 'mic'} size={22} color={colors.text.inverse} />
      </Pressable>
      {type === 'video' ? (
        <Pressable style={styles.btn} onPress={toggleCamera}>
          <Ionicons
            name={cameraOff ? 'videocam-off' : 'videocam'}
            size={22}
            color={colors.text.inverse}
          />
        </Pressable>
      ) : null}
      <Pressable style={[styles.btn, styles.end]} onPress={endCall}>
        <Ionicons name="call" size={22} color={colors.text.inverse} />
        <Text style={styles.endText}>วางสาย</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 28,
  },
  btn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  end: {
    width: 120,
    backgroundColor: colors.accent.live,
    flexDirection: 'row',
    gap: 6,
  },
  endText: {
    color: colors.text.inverse,
    fontWeight: '800',
  },
});
