import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss, dismissibleModalOptions } from '@/shared/components/DragDownDismiss';
import { useFeedStore } from '@/modules/feed/state/feed-store';

export default function FeedFocusScreen() {
  const focus = useFeedStore((s) => s.feedFocus);
  const busy = useFeedStore((s) => s.focusBusy);
  const change = useFeedStore((s) => s.changeFeedFocus);
  const [query, setQuery] = useState(focus?.query ?? '');
  const insets = useSafeAreaInsets();
  const apply = async (value: string | null) => {
    if (useFeedStore.getState().focusBusy) return;
    try {
      await change(value);
      useFeedStore.getState().setTab('foryou');
      router.back();
    } catch (error) {
      Alert.alert('เลือกดู', error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง');
    }
  };
  return <>
    <Stack.Screen options={{ ...dismissibleModalOptions, presentation: 'modal', headerShown: false }} />
    <DragDownDismiss onDismiss={() => router.back()} style={styles.page}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.content, { paddingTop: insets.top + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.row}>
          <Text style={styles.title}>ตอนนี้อยากดูอะไร?</Text>
          <Pressable onPress={() => router.back()} accessibilityLabel="ปิด" style={styles.close}><Text>✕</Text></Pressable>
        </View>
        <Text style={styles.hint}>ค้นหาสิ่งที่อยากดูชั่วคราว กลับสู่ Feed ปกติเมื่อปิดแอปหรือกดรีเซ็ต</Text>
        <TextInput autoFocus value={query} onChangeText={setQuery} maxLength={100} style={styles.input}
          placeholder="เช่น ข่าว" accessibilityLabel="ตอนนี้อยากดูอะไร?" returnKeyType="done"
          onSubmitEditing={() => { if (query.trim() && !busy) void apply(query.trim()); }} />
        <View style={styles.examples}>
          {['ข่าว', 'AI', 'รถไฟฟ้า', 'หุ้น', 'กีฬา', 'กำลังติดตาม'].map((value) =>
            <Pressable key={value} onPress={() => setQuery(value)} style={styles.chip}><Text>{value}</Text></Pressable>)}
        </View>
        <Pressable disabled={!query.trim() || busy} onPress={() => void apply(query.trim())}
          style={[styles.button, (!query.trim() || busy) && { opacity: 0.5 }]}>
          <Text style={styles.buttonText}>{busy ? 'กำลังโหลด…' : 'เลือกดู'}</Text>
        </Pressable>
        {focus && <Pressable disabled={busy} onPress={() => void apply(null)} style={styles.close}><Text>รีเซ็ต</Text></Pressable>}
      </KeyboardAvoidingView>
    </DragDownDismiss>
  </>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' }, content: { flex: 1, padding: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '700' }, hint: { color: '#666', marginVertical: 16 },
  close: { padding: 16, alignItems: 'center' }, input: { borderWidth: 1, borderColor: '#aaa', borderRadius: 12, padding: 16, fontSize: 18 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 20 },
  chip: { padding: 12, borderRadius: 20, backgroundColor: '#edf5ef' },
  button: { backgroundColor: '#126344', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
