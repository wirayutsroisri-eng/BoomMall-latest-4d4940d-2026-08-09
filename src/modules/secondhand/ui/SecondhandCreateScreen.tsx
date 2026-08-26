import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useSecondhandUiStore, type SecondhandDraftMedia } from '../state/secondhand-ui-store';
import { deleteSecondhandDraft, readSecondhandDraft, writeSecondhandDraft, type SavedSecondhandDraft } from '../data/secondhandDraft';

const CONDITIONS = ['ใหม่', 'เหมือนใหม่', 'ดี', 'ใช้งานปกติ', 'มีตำหนิ'];
const CATEGORIES = ['รถ', 'มือถือ', 'อิเล็กทรอนิกส์', 'บ้าน/เฟอร์นิเจอร์', 'แฟชั่น', 'อะไหล่', 'ของสะสม', 'อื่น ๆ'];
const DELIVERY = ['นัดรับ', 'จัดส่ง', 'ได้ทั้งสองแบบ'];

function MediaTile({ media, index, cover, onMove, onCover, onRemove }: { media: SecondhandDraftMedia; index: number; cover: boolean; onMove: (from: number, direction: -1 | 1) => void; onCover: () => void; onRemove: () => void }) {
  const pan = Gesture.Pan().onEnd((event) => { if (Math.abs(event.translationX) > 34) runOnJS(onMove)(index, event.translationX > 0 ? 1 : -1); });
  return <GestureDetector gesture={pan}><View style={[styles.mediaTile, cover && styles.mediaTileCover]}><Image source={{ uri: media.uri }} style={styles.mediaThumb} resizeMode="cover" />{cover ? <Text style={styles.coverBadge}>หน้าปก</Text> : <Pressable style={styles.coverAction} onPress={onCover}><Ionicons name="star-outline" size={16} color="#fff" /></Pressable>}<Pressable style={styles.removeMedia} onPress={onRemove}><Ionicons name="close" size={16} color="#fff" /></Pressable></View></GestureDetector>;
}

export function SecondhandCreateScreen() {
  const insets = useSafeAreaInsets();
  const { draft: openSavedDraft } = useLocalSearchParams<{ draft?: string }>();
  const media = useSecondhandUiStore((state) => state.draftMedia);
  const setMedia = useSecondhandUiStore((state) => state.setDraftMedia);
  const clearDraftMedia = useSecondhandUiStore((state) => state.clearDraft);
  const addPost = useFeedStore((state) => state.addPost);
  const [publishing, setPublishing] = useState(false);
  const [coverIndex, setCoverIndex] = useState(0);
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [category, setCategory] = useState(''); const [condition, setCondition] = useState(''); const [price, setPrice] = useState(''); const [negotiable, setNegotiable] = useState(true); const [delivery, setDelivery] = useState('นัดรับ'); const [province, setProvince] = useState(''); const [district, setDistrict] = useState(''); const [subdistrict, setSubdistrict] = useState('');
  const closeNow = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');

  const addImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 10 - media.length), quality: 1 });
    if (!result.canceled) setMedia([...media, ...result.assets.map((item) => ({ uri: item.uri, width: item.width, height: item.height }))].slice(0, 10));
  };
  const move = useCallback((from: number, direction: -1 | 1) => { const to = from + direction; if (to < 0 || to >= media.length) return; const next = [...media]; [next[from], next[to]] = [next[to]!, next[from]!]; setMedia(next); setCoverIndex((value) => value === from ? to : value === to ? from : value); }, [media, setMedia]);
  const remove = (index: number) => Alert.alert('นำรูปออก?', 'รูปนี้จะถูกนำออกจากร่างประกาศ', [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'นำออก', style: 'destructive', onPress: () => { setMedia(media.filter((_, i) => i !== index)); setCoverIndex(0); } }]);
  const draft = { media, coverIndex, title, description, category, condition, price, negotiable, delivery, province, district, subdistrict };
  const saveDraft = async (notify = true) => {
    await writeSecondhandDraft(draft);
    if (notify) Alert.alert('บันทึกร่างแล้ว', 'ร่างถูกเก็บไว้ในอุปกรณ์นี้');
  };
  const applyDraft = (saved: SavedSecondhandDraft) => {
    setMedia(Array.isArray(saved.media) ? saved.media : []);
    setCoverIndex(typeof saved.coverIndex === 'number' ? saved.coverIndex : 0);
    setTitle(saved.title ?? ''); setDescription(saved.description ?? ''); setCategory(saved.category ?? ''); setCondition(saved.condition ?? ''); setPrice(saved.price ?? ''); setNegotiable(saved.negotiable ?? true); setDelivery(saved.delivery ?? 'นัดรับ'); setProvince(saved.province ?? ''); setDistrict(saved.district ?? ''); setSubdistrict(saved.subdistrict ?? '');
  };
  useEffect(() => {
    if (openSavedDraft !== '1') return;
    let active = true;
    void readSecondhandDraft().then((saved) => {
      if (active && saved) applyDraft(saved);
    });
    return () => { active = false; };
  // Load once when this editor instance is opened from the drafts screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSavedDraft]);
  const viewDraft = async () => {
    const saved = await readSecondhandDraft();
    if (!saved) { Alert.alert('ยังไม่มีฉบับร่าง', 'เมื่อออกจากหน้านี้ คุณสามารถเลือกบันทึกเป็นฉบับร่างได้'); return; }
    Alert.alert('ฉบับร่างที่บันทึกไว้', `${saved.title?.trim() || 'ยังไม่ได้ใส่ชื่อสินค้า'}\n${saved.media?.length ?? 0} รูป · ${saved.price ? `฿${saved.price}` : 'ยังไม่ได้ใส่ราคา'}`, [
      { text: 'ปิด', style: 'cancel' },
      { text: 'เปิดฉบับร่าง', onPress: () => Alert.alert('แทนที่ข้อมูลปัจจุบัน?', 'ข้อมูลที่กำลังกรอกจะถูกแทนด้วยฉบับร่าง', [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'เปิด', onPress: () => applyDraft(saved) }]) },
    ]);
  };
  const requestExit = () => {
    Alert.alert('ออกจากหน้าลงขาย?', 'ต้องการบันทึกประกาศนี้เป็นฉบับร่างก่อนออกหรือไม่', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ออกโดยไม่บันทึก', style: 'destructive', onPress: closeNow },
      { text: 'บันทึกร่างแล้วออก', onPress: () => void saveDraft(false).then(closeNow).catch(() => Alert.alert('บันทึกไม่สำเร็จ', 'กรุณาลองใหม่')) },
    ]);
  };
  const publish = async () => {
    if (!title.trim() || !price.trim() || !category || !condition || media.length === 0) { Alert.alert('ข้อมูลยังไม่ครบ', 'กรุณาเพิ่มรูป ชื่อสินค้า หมวดหมู่ สภาพ และราคา'); return; }
    if (publishing) return;
    setPublishing(true);
    try {
      const cover = media[coverIndex];
      const orderedMedia = cover
        ? [cover, ...media.filter((_, index) => index !== coverIndex)]
        : media;
      const area = [subdistrict, district, province].map((value) => value.trim()).filter(Boolean).join(' · ');
      await addPost({
        clientPostId: `secondhand-${Date.now()}`,
        caption: description.trim() || title.trim(),
        productName: title.trim(),
        price: Number(price),
        channel: 'C2C',
        intent: 'sell',
        imageUris: orderedMedia.map((item) => item.uri),
        imageUri: orderedMedia[0]?.uri,
        imageWidth: orderedMedia[0]?.width,
        imageHeight: orderedMedia[0]?.height,
        locationLabel: area || province.trim() || 'ไม่ระบุพื้นที่',
        tags: ['มือสอง', category, condition, delivery, negotiable ? 'ต่อรองได้' : 'ราคาสุทธิ'],
      });
      await deleteSecondhandDraft();
      clearDraftMedia();
      Alert.alert('เผยแพร่ประกาศแล้ว', 'ประกาศของคุณอยู่ในหน้ามือสองแล้ว', [
        { text: 'ดูประกาศ', onPress: closeNow },
      ]);
    } catch (error) {
      Alert.alert('เผยแพร่ไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่');
    } finally {
      setPublishing(false);
    }
  };

  return <DragDownDismiss onDismiss={requestExit} style={styles.root}><View style={[styles.header, { paddingTop: insets.top }]}><Pressable onPress={requestExit} style={styles.headerBtn} hitSlop={8}><Ionicons name="close" size={26} color="#202824" /></Pressable><Text style={styles.headerTitle}>ลงขาย</Text><View style={styles.headerActions}><Pressable onPress={() => void viewDraft()}><Text style={styles.draftText}>ดูฉบับร่าง</Text></Pressable><Pressable disabled={publishing} style={[styles.publishBtn, publishing && { opacity: 0.55 }]} onPress={() => void publish()}><Text style={styles.publishText}>{publishing ? 'กำลังลงขาย…' : 'เผยแพร่'}</Text></Pressable></View></View>
    <KeyboardAvoidingView style={styles.keyboardArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 90 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
      <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>รูปสินค้า</Text><Text style={styles.helper}>สูงสุด 10 รูป · ลากซ้าย/ขวาเพื่อเรียง</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaRow}>{media.map((item, index) => <MediaTile key={`${item.uri}-${index}`} media={item} index={index} cover={index === coverIndex} onMove={move} onCover={() => setCoverIndex(index)} onRemove={() => remove(index)} />)}<Pressable style={styles.addMedia} onPress={() => void addImages()}><Ionicons name="add" size={28} color="#59635D" /><Text style={styles.addMediaText}>เพิ่มรูป</Text></Pressable></ScrollView></View>
      <Field label="ชื่อสินค้า"><TextInput value={title} onChangeText={setTitle} placeholder="เช่น iPhone 15 Pro 256GB" placeholderTextColor="#A0A8A3" style={styles.input} maxLength={100} /></Field>
      <Field label="รายละเอียด"><TextInput value={description} onChangeText={setDescription} multiline placeholder={'รายละเอียดสินค้า\nสภาพสินค้า / ตำหนิ\nอุปกรณ์ที่มี / เหตุผลที่ขาย'} placeholderTextColor="#A0A8A3" style={[styles.input, styles.textarea]} /><Pressable style={styles.aiButton} onPress={() => Alert.alert('AI ช่วยเขียน', 'ต้องเชื่อม AI และ Image Analysis Backend จริงก่อนใช้งาน จึงยังไม่สร้างข้อความจำลอง')}><Ionicons name="sparkles-outline" size={16} color="#202824" /><Text style={styles.aiText}>AI ช่วยเขียน</Text></Pressable></Field>
      <ChoiceSection label="หมวดหมู่" values={CATEGORIES} value={category} onChange={setCategory} />
      <ChoiceSection label="สภาพสินค้า" values={CONDITIONS} value={condition} onChange={setCondition} />
      <Field label="ราคา"><View style={styles.priceInput}><Text style={styles.baht}>฿</Text><TextInput value={price} onChangeText={(value) => setPrice(value.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor="#A0A8A3" style={styles.priceTextInput} /></View><View style={styles.toggleRow}><Text style={styles.toggleLabel}>ต่อรองราคาได้</Text><Switch value={negotiable} onValueChange={setNegotiable} trackColor={{ false: '#D6DBD8', true: '#202824' }} /></View></Field>
      <ChoiceSection label="วิธีรับสินค้า" values={DELIVERY} value={delivery} onChange={setDelivery} />
      <Field label="ตำแหน่ง"><View style={styles.locationRow}><TextInput value={province} onChangeText={setProvince} placeholder="จังหวัด" placeholderTextColor="#A0A8A3" style={[styles.input, styles.locationInput]} /><TextInput value={district} onChangeText={setDistrict} placeholder="อำเภอ" placeholderTextColor="#A0A8A3" style={[styles.input, styles.locationInput]} /></View><TextInput value={subdistrict} onChangeText={setSubdistrict} placeholder="ตำบล (ไม่ต้องใส่บ้านเลขที่)" placeholderTextColor="#A0A8A3" style={styles.input} /><Text style={styles.privacy}>แสดงเฉพาะพื้นที่โดยประมาณเพื่อความเป็นส่วนตัว</Text></Field>
    </ScrollView>
    </KeyboardAvoidingView>
  </DragDownDismiss>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{label}</Text>{children}</View>; }
function ChoiceSection({ label, values, value, onChange }: { label: string; values: string[]; value: string; onChange: (value: string) => void }) { return <Field label={label}><View style={styles.chips}>{values.map((item) => <Pressable key={item} style={[styles.chip, value === item && styles.chipActive]} onPress={() => onChange(item)}><Text style={[styles.chipText, value === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View></Field>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F3F1' }, keyboardArea: { flex: 1, backgroundColor: '#F1F3F1' }, header: { minHeight: 96, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE2DE' }, headerBtn: { width: 48, height: 44, marginLeft: -5, alignItems: 'center', justifyContent: 'center', zIndex: 3 }, headerTitle: { position: 'absolute', left: 0, right: 0, bottom: 19, color: '#202824', fontSize: 18, fontWeight: '900', textAlign: 'center' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 2 }, draftText: { color: '#59635D', fontSize: 12, fontWeight: '800' }, publishBtn: { height: 38, paddingHorizontal: 13, borderRadius: 13, backgroundColor: '#202824', justifyContent: 'center' }, publishText: { color: '#fff', fontSize: 12, fontWeight: '900' }, content: { padding: 12, gap: 10 }, section: { backgroundColor: '#fff', borderRadius: 18, padding: 14 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionTitle: { color: '#202824', fontSize: 16, fontWeight: '900', marginBottom: 10 }, helper: { color: '#8B948F', fontSize: 10 }, mediaRow: { gap: 9 }, mediaTile: { width: 126, height: 154, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' }, mediaTileCover: { borderColor: '#202824' }, mediaThumb: { width: '100%', height: '100%' }, coverBadge: { position: 'absolute', left: 6, bottom: 6, color: '#fff', fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(0,0,0,0.68)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 }, coverAction: { position: 'absolute', left: 6, bottom: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center' }, removeMedia: { position: 'absolute', right: 6, top: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.66)', alignItems: 'center', justifyContent: 'center' }, addMedia: { width: 126, height: 154, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#BCC5C0', alignItems: 'center', justifyContent: 'center' }, addMediaText: { color: '#69736D', fontSize: 12, fontWeight: '800', marginTop: 5 }, input: { minHeight: 46, borderRadius: 13, backgroundColor: '#F2F4F2', paddingHorizontal: 12, color: '#202824', fontSize: 15 }, textarea: { minHeight: 132, paddingTop: 12, textAlignVertical: 'top' }, aiButton: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 9, paddingHorizontal: 11, height: 34, borderRadius: 11, backgroundColor: '#E8EBE9' }, aiText: { color: '#202824', fontSize: 11, fontWeight: '900' }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#EFF2F0', alignItems: 'center', justifyContent: 'center' }, chipActive: { backgroundColor: '#202824' }, chipText: { color: '#5B655F', fontSize: 12, fontWeight: '800' }, chipTextActive: { color: '#fff' }, priceInput: { height: 54, borderRadius: 14, backgroundColor: '#F2F4F2', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }, baht: { color: '#202824', fontSize: 22, fontWeight: '900' }, priceTextInput: { flex: 1, color: '#202824', fontSize: 20, fontWeight: '900', marginLeft: 8 }, toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }, toggleLabel: { color: '#505A54', fontSize: 13, fontWeight: '700' }, locationRow: { flexDirection: 'row', gap: 8, marginBottom: 8 }, locationInput: { flex: 1 }, privacy: { color: '#8A938E', fontSize: 10, marginTop: 7 },
});
