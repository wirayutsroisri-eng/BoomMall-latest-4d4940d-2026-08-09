import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import type { FeedItem } from '@/modules/feed/domain/types';
import { reportSecondhandListing, updateSecondhandStatus, type ListingStatus } from '../data/secondhandApi';

const REASONS = ['หลอกลวง / น่าสงสัย','สินค้าผิดกฎหมายหรือไม่เหมาะสม','เนื้อหาลามกหรือไม่เหมาะสม','สแปม / ลงซ้ำ','ราคาหรือข้อมูลทำให้เข้าใจผิด','รูปภาพไม่ตรงกับสินค้า','สินค้าปลอมหรือละเมิดสิทธิ์','คุกคาม / พฤติกรรมไม่เหมาะสม','อื่น ๆ'];
type Props = { item: FeedItem; visible: boolean; onClose: () => void };

export function SecondhandListingMenu({ item, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const hideContent = useModerationStore((state) => state.hideContent);
  const restoreContent = useModerationStore((state) => state.restoreContent);
  const blockUser = useModerationStore((state) => state.blockUser);
  const hydrate = useFeedStore((state) => state.hydrateFromServer);
  const deletePost = useFeedStore((state) => state.deletePost);
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!visible) { setReporting(false); setReason(''); setDescription(''); } }, [visible]);
  const close = () => { if (!busy) onClose(); };
  const share = async () => { await Share.share({ message: `${item.product.name}\n฿${item.product.basePrice.toLocaleString('th-TH')}\nBoomMall` }); onClose(); };
  const status = async (next: ListingStatus) => { setBusy(true); try { await updateSecondhandStatus(item.id, next); await hydrate(); onClose(); } catch (error) { Alert.alert('อัปเดตไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่'); } finally { setBusy(false); } };
  const submitReport = async () => { if (!reason) return; if (reason === 'อื่น ๆ' && !description.trim()) { Alert.alert('กรุณาอธิบายเพิ่มเติม'); return; } setBusy(true); try { await reportSecondhandListing({ listingId:item.id,sellerUserId:item.authorId ?? item.authorHandle,targetLabel:item.product.name,reason,description:description.trim() || undefined }); onClose(); Alert.alert('ขอบคุณสำหรับรายงาน', 'เราจะตรวจสอบประกาศนี้'); } catch (error) { Alert.alert('ส่งรายงานไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองใหม่'); } finally { setBusy(false); } };
  const hide = () => { hideContent(item.id); onClose(); Alert.alert('ซ่อนประกาศแล้ว', undefined, [{ text:'ตกลง' }, { text:'เลิกทำ', onPress:() => restoreContent(item.id) }]); };
  const block = () => Alert.alert('บล็อกผู้ขาย?', 'หลังจากบล็อก คุณจะไม่เห็นประกาศจากผู้ใช้นี้ และผู้ใช้นี้จะไม่สามารถติดต่อคุณตามกฎของระบบ', [{text:'ยกเลิก',style:'cancel'},{text:'บล็อก',style:'destructive',onPress:()=>{blockUser((item.authorId ?? item.authorHandle).replace(/^@/,''));onClose();}}]);
  const remove = () => Alert.alert('ลบประกาศ?', 'ประกาศนี้จะถูกลบออกจากระบบ การดำเนินการนี้ย้อนกลับไม่ได้', [{text:'ยกเลิก',style:'cancel'},{text:'ลบ',style:'destructive',onPress:()=>void deletePost(item.id).then((ok)=>{if(ok)onClose();else Alert.alert('ลบไม่สำเร็จ');})}]);
  const options = item.isUserPost
    ? [['create-outline','แก้ไขประกาศ',()=>Alert.alert('แก้ไขประกาศ','จะเชื่อมกับฟอร์มแก้ไขเมื่อ Secondhand Publish API เปิดใช้งาน')],['time-outline','ทำเครื่องหมายว่าจองแล้ว',()=>void status('RESERVED')],['checkmark-circle-outline','ทำเครื่องหมายว่าขายแล้ว',()=>void status('SOLD')],['eye-off-outline','ซ่อนประกาศ',()=>void status('HIDDEN')],['share-outline','แชร์',()=>void share()],['trash-outline','ลบประกาศ',remove]] as const
    : [['flag-outline','รายงานประกาศ',()=>setReporting(true)],['eye-off-outline','ซ่อนโพสต์นี้',hide],['ban-outline','บล็อกผู้ขาย',block],['share-outline','แชร์',()=>void share()]] as const;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}><DragDownDismiss onDismiss={close} showDim rootInModal rootStyle={styles.root}><View style={[styles.sheet,{paddingBottom:Math.max(insets.bottom,16)}]}><View style={styles.handle}/><Text style={styles.title}>{reporting?'รายงานประกาศ':'จัดการประกาศ'}</Text>{reporting ? <><Text style={styles.sub}>เลือกเหตุผลที่ตรงที่สุด รายงานจะส่งให้ Admin ตรวจสอบและไม่ลบประกาศอัตโนมัติ</Text>{REASONS.map((value)=><Pressable key={value} style={styles.row} onPress={()=>setReason(value)}><Ionicons name={reason===value?'radio-button-on':'radio-button-off'} size={20} color={reason===value?'#E7354F':'#7D8781'}/><Text style={styles.label}>{value}</Text></Pressable>)}{reason==='อื่น ๆ'?<TextInput value={description} onChangeText={setDescription} multiline placeholder="อธิบายเพิ่มเติม" style={styles.input}/>:null}<Pressable disabled={!reason||busy} style={[styles.submit,(!reason||busy)&&styles.disabled]} onPress={()=>void submitReport()}><Text style={styles.submitText}>{busy?'กำลังส่ง…':'ส่งรายงาน'}</Text></Pressable></> : options.map(([icon,label,action])=><Pressable key={label} style={styles.menuRow} onPress={action} disabled={busy}><Ionicons name={icon} size={21} color={label.includes('ลบ')?'#D92D45':'#202824'}/><Text style={[styles.menuLabel,label.includes('ลบ')&&styles.danger]}>{label}</Text></Pressable>)}</View></DragDownDismiss></Modal>;
}
const styles=StyleSheet.create({root:{flex:1,justifyContent:'flex-end'},sheet:{maxHeight:'88%',backgroundColor:'#fff',borderTopLeftRadius:22,borderTopRightRadius:22,padding:16},handle:{width:38,height:4,borderRadius:2,backgroundColor:'#CDD2CF',alignSelf:'center',marginBottom:12},title:{fontSize:19,fontWeight:'900',color:'#202824',textAlign:'center',marginBottom:10},sub:{fontSize:12,lineHeight:18,color:'#6C756F',marginBottom:5},menuRow:{height:54,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#E7EAE8'},menuLabel:{fontSize:15,fontWeight:'700',color:'#202824'},danger:{color:'#D92D45'},row:{minHeight:42,flexDirection:'row',alignItems:'center',gap:9},label:{fontSize:13,fontWeight:'600',color:'#303833',flex:1},input:{minHeight:70,borderRadius:12,backgroundColor:'#F1F3F1',padding:10,textAlignVertical:'top',marginTop:6},submit:{height:48,borderRadius:14,backgroundColor:'#202824',alignItems:'center',justifyContent:'center',marginTop:12},disabled:{opacity:.4},submitText:{color:'#fff',fontWeight:'900'},dangerText:{color:'#D92D45'}});
