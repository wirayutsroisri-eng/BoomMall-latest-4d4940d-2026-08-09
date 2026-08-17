import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { HeroOverlay } from '@/modules/shop/domain/product-display';

type Props = {
  overlay: HeroOverlay | null;
};

function TickBar({ label, vertical }: { label: string; vertical?: boolean }) {
  return (
    <View style={[styles.tickBar, vertical && styles.tickBarVertical]}>
      <View style={[styles.cap, vertical && styles.capVertical]} />
      <View style={[styles.line, vertical && styles.lineVertical]} />
      <View style={styles.labelWrap}>
        <Text style={styles.label}>{label}</Text>
      </View>
      <View style={[styles.line, vertical && styles.lineVertical]} />
      <View style={[styles.cap, vertical && styles.capVertical]} />
    </View>
  );
}

export function DimensionOverlay({ overlay }: Props) {
  if (!overlay) return null;
  const triple = overlay.width && overlay.depth && overlay.height;

  if (!triple) {
    return (
      <View pointerEvents="none" style={styles.captionWrap}>
        <Text style={styles.caption}>{overlay.caption}</Text>
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={styles.frame}>
      <View style={styles.top}>
        <TickBar label={overlay.width!} />
      </View>
      <View style={styles.right}>
        <TickBar label={overlay.height!} vertical />
      </View>
      <View style={styles.bottom}>
        <TickBar label={overlay.depth!} />
      </View>
    </View>
  );
}

const LINE = 'rgba(255,255,255,0.92)';

const styles = StyleSheet.create({
  frame: {
    ...StyleSheet.absoluteFill,
  },
  top: {
    position: 'absolute',
    top: '9%',
    left: '12%',
    right: '18%',
  },
  bottom: {
    position: 'absolute',
    bottom: '18%',
    left: '12%',
    right: '18%',
  },
  right: {
    position: 'absolute',
    top: '16%',
    bottom: '16%',
    right: '8%',
    width: 28,
    alignItems: 'center',
  },
  tickBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickBarVertical: {
    flex: 1,
    flexDirection: 'column',
  },
  cap: {
    width: 1,
    height: 10,
    backgroundColor: LINE,
  },
  capVertical: {
    width: 10,
    height: 1,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: LINE,
  },
  lineVertical: {
    width: StyleSheet.hairlineWidth * 2,
    height: undefined,
    flex: 1,
  },
  labelWrap: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginHorizontal: 4,
    marginVertical: 4,
  },
  label: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  captionWrap: {
    position: 'absolute',
    left: 12,
    bottom: 86,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '72%',
  },
  caption: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
