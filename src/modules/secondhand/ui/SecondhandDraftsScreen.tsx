import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { deleteSecondhandDraft, readSecondhandDraft, type SavedSecondhandDraft } from '../data/secondhandDraft';
import { useSecondhandUiStore } from '../state/secondhand-ui-store';

export function SecondhandDraftsScreen() {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<SavedSecondhandDraft | null>(null);
  const setMedia = useSecondhandUiStore((state) => state.setDraftMedia);
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');
  useFocusEffect(useCallback(() => { void readSecondhandDraft().then(setDraft); }, []));
  const resume = () => { setMedia(draft?.media ?? []); router.replace({ pathname: '/secondhand-create', params: { draft: '1' } }); };
  const remove = () => Alert.alert('ลบฉบับร่าง?', 'ฉบับร่างนี้จะถูกลบออกจากอุปกรณ์และกู้คืนไม่ได้', [
    { text: 'ยกเลิก', style: 'cancel' },
    { text: 'ลบ', style: 'destructive', onPress: () => void deleteSecondhandDraft().then(() => setDraft(null)) },
  ]);
  return <DragDownDismiss onDismiss={close} style={styles.root}>
    <View style={[styles.header, { paddingTop: insets.top }]}><Pressable style={styles.close} onPress={close}><Ionicons name="close" size={26} color="#202824" /></Pressable><Text style={styles.heading}>ฉบับร่างของฉัน</Text><View style={styles.close} /></View>
    {draft ? <View style={styles.card}>{draft.media?.[draft.coverIndex ?? 0]?.uri ? <Image source={{ uri: draft.media[draft.coverIndex ?? 0]!.uri }} style={styles.cover} /> : <View style={[styles.cover, styles.emptyCover]}><Ionicons name="image-outline" size={30} color="#8C9690" /></View>}<View style={styles.body}><Text style={styles.title}>{draft.title?.trim() || 'ยังไม่ได้ใส่ชื่อสินค้า'}</Text><Text style={styles.price}>{draft.price ? `฿${Number(draft.price).toLocaleString('th-TH')}` : 'ยังไม่ได้ใส่ราคา'}</Text><Text style={styles.meta}>{draft.category || 'ยังไม่ได้เลือกหมวดหมู่'} · ยังไม่เผยแพร่</Text><Text style={styles.time}>แก้ไขล่าสุด {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString('th-TH') : 'ก่อนหน้านี้'}</Text><View style={styles.actions}><Pressable style={styles.resume} onPress={resume}><Text style={styles.resumeText}>แก้ไขต่อ</Text></Pressable><Pressable style={styles.delete} onPress={remove}><Text style={styles.deleteText}>ลบฉบับร่าง</Text></Pressable></View></View></View> : <View style={styles.empty}><Ionicons name="document-text-outline" size={44} color="#9AA39E" /><Text style={styles.emptyTitle}>ยังไม่มีฉบับร่าง</Text></View>}
  </DragDownDismiss>;
}
const styles = StyleSheet.create({ root:{flex:1,backgroundColor:'#F1F3F1'},header:{minHeight:96,paddingHorizontal:12,paddingBottom:10,backgroundColor:'#fff',flexDirection:'row',alignItems:'flex-end',justifyContent:'space-between'},close:{width:44,height:44,alignItems:'center',justifyContent:'center'},heading:{fontSize:18,fontWeight:'900',color:'#202824',marginBottom:10},card:{margin:14,borderRadius:18,backgroundColor:'#fff',overflow:'hidden',flexDirection:'row'},cover:{width:116,height:145,backgroundColor:'#E7EBE8'},emptyCover:{alignItems:'center',justifyContent:'center'},body:{flex:1,padding:12},title:{fontSize:15,fontWeight:'900',color:'#202824'},price:{fontSize:17,fontWeight:'900',color:'#E7354F',marginTop:5},meta:{fontSize:11,color:'#66706A',marginTop:5},time:{fontSize:10,color:'#909994',marginTop:5},actions:{flexDirection:'row',gap:7,marginTop:12},resume:{backgroundColor:'#202824',borderRadius:10,paddingHorizontal:12,paddingVertical:8},resumeText:{color:'#fff',fontSize:11,fontWeight:'900'},delete:{borderWidth:1,borderColor:'#E1E5E2',borderRadius:10,paddingHorizontal:10,paddingVertical:8},deleteText:{color:'#D92D45',fontSize:11,fontWeight:'800'},empty:{alignItems:'center',marginTop:140},emptyTitle:{fontSize:16,fontWeight:'800',color:'#69736D',marginTop:9} });
