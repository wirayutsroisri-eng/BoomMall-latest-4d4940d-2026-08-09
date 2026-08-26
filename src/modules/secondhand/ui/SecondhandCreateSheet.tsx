import React, { forwardRef, useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSecondhandUiStore } from '../state/secondhand-ui-store';
import { readSecondhandDraft } from '../data/secondhandDraft';

export const SecondhandCreateSheet = forwardRef<BottomSheetModal>(function SecondhandCreateSheet(_, ref) {
  const insets = useSafeAreaInsets();
  const setDraftMedia = useSecondhandUiStore((state) => state.setDraftMedia);
  const clearDraft = useSecondhandUiStore((state) => state.clearDraft);
  const snapPoints = useMemo(() => ['46%'], []);
  const backdrop = useCallback((props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.34} />, []);
  const dismiss = () => { if (typeof ref !== 'function') ref?.current?.dismiss(); };
  const openForm = () => { dismiss(); requestAnimationFrame(() => router.push('/secondhand-create')); };
  const confirmNew = async (start: () => void | Promise<void>) => {
    const draft = await readSecondhandDraft();
    if (!draft) { await start(); return; }
    Alert.alert('คุณมีฉบับร่างที่ยังไม่เสร็จ', 'ต้องการทำฉบับร่างเดิมต่อ หรือสร้างประกาศใหม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ทำต่อ', onPress: () => { dismiss(); requestAnimationFrame(() => router.push('/secondhand-drafts')); } },
      { text: 'สร้างประกาศใหม่', onPress: () => void start() },
    ]);
  };

  const camera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('ต้องการสิทธิ์กล้อง', 'กรุณาอนุญาตกล้องเพื่อถ่ายรูปสินค้า'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const image = result.assets[0];
      setDraftMedia([{ uri: image.uri, width: image.width, height: image.height }]);
      openForm();
    }
  };

  const library = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert('ต้องการสิทธิ์รูปภาพ', 'กรุณาอนุญาตคลังรูปเพื่อเลือกรูปสินค้า'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 });
    if (!result.canceled) {
      setDraftMedia(result.assets.map((image) => ({ uri: image.uri, width: image.width, height: image.height })));
      openForm();
    }
  };

  return <BottomSheetModal ref={ref} snapPoints={snapPoints} enablePanDownToClose backdropComponent={backdrop} backgroundStyle={styles.sheet} handleIndicatorStyle={styles.handle}>
    <BottomSheetView style={[styles.body, { paddingBottom: Math.max(insets.bottom, 18) }]}>
      <Text style={styles.title}>ขายของมือสองง่าย ๆ</Text>
      <Text style={styles.subtitle}>ถ่ายรูปแล้วลงขายได้เลย</Text>
      <Pressable style={styles.primary} onPress={() => void confirmNew(camera)}><Ionicons name="camera" size={24} color="#fff" /><Text style={styles.primaryText}>ถ่ายรูปขาย</Text></Pressable>
      <View style={styles.options}>
        <Pressable style={styles.option} onPress={() => void confirmNew(library)}><Ionicons name="images-outline" size={22} color="#202824" /><Text style={styles.optionText}>เลือกรูปจากเครื่อง</Text></Pressable>
        <Pressable style={styles.option} onPress={() => void confirmNew(() => { clearDraft(); openForm(); })}><Ionicons name="create-outline" size={22} color="#202824" /><Text style={styles.optionText}>ลงประกาศเอง</Text></Pressable>
      </View>
    </BottomSheetView>
  </BottomSheetModal>;
});

const styles = StyleSheet.create({
  sheet: { backgroundColor: '#F7F8F7', borderRadius: 24 }, handle: { backgroundColor: '#B5BCB8', width: 38 }, body: { paddingHorizontal: 20, paddingTop: 4 }, title: { color: '#151A17', fontSize: 23, fontWeight: '900', textAlign: 'center' }, subtitle: { color: '#747D78', fontSize: 14, textAlign: 'center', marginTop: 5 }, primary: { height: 58, borderRadius: 18, backgroundColor: '#202824', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 22 }, primaryText: { color: '#fff', fontSize: 17, fontWeight: '900' }, options: { flexDirection: 'row', gap: 10, marginTop: 12 }, option: { flex: 1, minHeight: 76, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E0E4E1' }, optionText: { color: '#303833', fontSize: 13, fontWeight: '800' },
});
