import React, { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = { text: string; maxExpandedHeight: number; onExpandedChange?: (expanded: boolean) => void };

export const ExpandableCaption = memo(function ExpandableCaption({
  text,
  maxExpandedHeight,
  onExpandedChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const toggle = useCallback(() => {
    void Haptics.selectionAsync();
    setExpanded((current) => {
      onExpandedChange?.(!current);
      return !current;
    });
  }, [onExpandedChange]);

  if (!text.trim()) return null;

  return (
    <View style={expanded ? [styles.expanded, { maxHeight: maxExpandedHeight }] : undefined}>
      <ScrollView
        scrollEnabled={expanded}
        nestedScrollEnabled
        showsVerticalScrollIndicator={expanded}
        bounces={false}
      >
        <Text
          style={styles.caption}
          numberOfLines={expanded ? undefined : 3}
          onTextLayout={expanded ? undefined : (event) => setTruncated(event.nativeEvent.lines.length >= 3)}
        >
          {text}
        </Text>
      </ScrollView>
      {truncated || expanded ? (
        <Pressable onPress={toggle} hitSlop={8} accessibilityRole="button">
          <Text style={styles.more}>{expanded ? 'ย่อ' : 'เพิ่มเติม'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  expanded: { overflow: 'hidden' },
  caption: { color: '#fff', fontSize: 15, lineHeight: 20, textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 3 },
  more: { alignSelf: 'flex-start', color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '700', marginTop: 2 },
});
