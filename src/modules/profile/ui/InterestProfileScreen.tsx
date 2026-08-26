import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { getInterestSuggestions, getMyInterests, saveMyInterests } from '../data/interestApi';

const SUGGESTIONS = ['รถไฟฟ้า', 'แบตเตอรี่', 'แต่งรถ', 'อสังหาริมทรัพย์', 'ทำอาหาร', 'แฟชั่น', 'ช่างไฟ', 'กล้อง', 'ท่องเที่ยว'];
const CATEGORIES = ['ยานยนต์', 'บ้านและสวน', 'อาหาร', 'แฟชั่น', 'อิเล็กทรอนิกส์', 'งาน', 'บริการ', 'ท่องเที่ยว'];

export function InterestProfileScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>([]); const [query, setQuery] = useState('');
  const [serverSuggestions, setServerSuggestions] = useState<string[]>([]);
  const [occupation, setOccupation] = useState(''); const [occupationVisible, setOccupationVisible] = useState(false);
  const [careerField, setCareerField] = useState(''); const [careerFieldVisible, setCareerFieldVisible] = useState(false);
  const [skills, setSkills] = useState(''); const [skillsVisible, setSkillsVisible] = useState(false);
  const [interestsVisible, setInterestsVisible] = useState(false); const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [categoriesVisible, setCategoriesVisible] = useState(false); const [personalizationEnabled, setPersonalizationEnabled] = useState(true);
  useEffect(() => { void getMyInterests().then((p) => {
    setTags(p.explicitInterests.map((v) => v.tag)); setOccupation(p.occupation ?? ''); setOccupationVisible(p.occupationVisible);
    setCareerField(p.careerField ?? ''); setCareerFieldVisible(p.careerFieldVisible); setSkills(p.skills.join(', ')); setSkillsVisible(p.skillsVisible);
    setInterestsVisible(p.interestsVisible); setPreferredCategories(p.preferredCategories); setCategoriesVisible(p.categoriesVisible);
    setPersonalizationEnabled(p.personalizationEnabled);
  }).catch((e) => Alert.alert('โหลดข้อมูลไม่สำเร็จ', e.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => { const q = query.trim(); if (!q) return; const timer = setTimeout(() => void getInterestSuggestions(q).then(setServerSuggestions).catch(() => undefined), 300); return () => clearTimeout(timer); }, [query]);
  const suggestions = useMemo(() => [...new Set([...serverSuggestions, ...SUGGESTIONS])].filter((v) => !tags.includes(v) && (!query.trim() || v.includes(query.trim()) || serverSuggestions.includes(v))), [query, serverSuggestions, tags]);
  const add = (value: string) => { const tag = value.trim(); if (tag && !tags.some((v) => v.toLocaleLowerCase() === tag.toLocaleLowerCase())) setTags((v) => [...v, tag].slice(0, 50)); setQuery(''); };
  const remove = (tag: string) => Alert.alert('ลบความสนใจนี้?', `“${tag}” จะถูกลบจากโปรไฟล์ความสนใจ`, [{ text: 'ยกเลิก', style: 'cancel' }, { text: 'ลบ', style: 'destructive', onPress: () => setTags((v) => v.filter((x) => x !== tag)) }]);
  const save = async () => { setSaving(true); try { await saveMyInterests({ explicitInterests: tags.map((tag) => ({ tag })), occupation: occupation.trim() || null,
    occupationVisible, careerField: careerField.trim() || null, careerFieldVisible, skills: skills.split(',').map((v) => v.trim()).filter(Boolean), skillsVisible,
    interestsVisible, preferredCategories, categoriesVisible, personalizationEnabled }); router.back(); } catch (e) { Alert.alert('บันทึกไม่สำเร็จ', e instanceof Error ? e.message : 'กรุณาลองใหม่'); } finally { setSaving(false); } };
  return <DragDownDismiss onDismiss={() => router.back()} enabled={!saving} style={styles.root}>
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}><Pressable onPress={() => router.back()}><Ionicons name="close" size={26} color="#171717" /></Pressable><Text style={styles.title}>ความสนใจ</Text><Pressable disabled={loading || saving} onPress={() => void save()}><Text style={[styles.save, (loading || saving) && styles.disabled]}>{saving ? 'กำลังบันทึก' : 'บันทึก'}</Text></Pressable></View>
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>สิ่งที่คุณสนใจ</Text><Text style={styles.note}>ช่วยให้เราแนะนำ Feed สินค้า งาน และบริการที่ตรงกับคุณ</Text>
      <View style={styles.inputRow}><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => add(query)} placeholder="ค้นหาหรือเพิ่ม Tag" style={styles.input} returnKeyType="done" /><Pressable onPress={() => add(query)} style={styles.add}><Ionicons name="add" size={22} color="#fff" /></Pressable></View>
      <View style={styles.chips}>{tags.map((tag) => <Pressable key={tag} onPress={() => remove(tag)} style={[styles.chip, styles.selected]}><Text style={styles.selectedText}>{tag}</Text><Ionicons name="close-circle" size={16} color="#fff" /></Pressable>)}</View>
      <Text style={styles.subheading}>คำแนะนำที่ใกล้เคียง</Text><View style={styles.chips}>{suggestions.map((tag) => <Pressable key={tag} onPress={() => add(tag)} style={styles.chip}><Text>{tag}</Text><Ionicons name="add-circle-outline" size={16} /></Pressable>)}</View>
      <Field label="อาชีพ" value={occupation} onChangeText={setOccupation} visible={occupationVisible} setVisible={setOccupationVisible} />
      <Field label="สายงาน" value={careerField} onChangeText={setCareerField} visible={careerFieldVisible} setVisible={setCareerFieldVisible} />
      <Field label="ทักษะ (คั่นด้วยจุลภาค)" value={skills} onChangeText={setSkills} visible={skillsVisible} setVisible={setSkillsVisible} />
      <Visibility label="แสดงความสนใจในโปรไฟล์" value={interestsVisible} onValueChange={setInterestsVisible} />
      <Text style={styles.subheading}>หมวดที่สนใจ</Text><View style={styles.chips}>{CATEGORIES.map((category) => <Pressable key={category} onPress={() => setPreferredCategories((v) => v.includes(category) ? v.filter((x) => x !== category) : [...v, category])} style={[styles.chip, preferredCategories.includes(category) && styles.selected]}><Text style={preferredCategories.includes(category) && styles.selectedText}>{category}</Text></Pressable>)}</View>
      <Visibility label="แสดงหมวดในโปรไฟล์" value={categoriesVisible} onValueChange={setCategoriesVisible} />
      <View style={styles.privacy}><Visibility label="เปิดคำแนะนำเฉพาะบุคคล" value={personalizationEnabled} onValueChange={setPersonalizationEnabled} /><Text style={styles.note}>ข้อมูลที่ซ่อนจะไม่แสดงต่อผู้อื่น แต่อาจใช้จัดอันดับคำแนะนำเมื่อเปิด Personalization</Text></View>
    </ScrollView>
  </DragDownDismiss>;
}

function Visibility({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) { return <View style={styles.visibility}><Text style={styles.visibilityText}>{label}</Text><Switch value={value} onValueChange={onValueChange} /></View>; }
function Field(p: { label: string; value: string; onChangeText: (v: string) => void; visible: boolean; setVisible: (v: boolean) => void }) { return <View style={styles.field}><Text style={styles.subheading}>{p.label}</Text><TextInput value={p.value} onChangeText={p.onChangeText} style={styles.textField} placeholder={`เพิ่ม${p.label}`} /><Visibility label="แสดงในโปรไฟล์" value={p.visible} onValueChange={p.setVisible} /></View>; }
const styles = StyleSheet.create({ root:{flex:1,backgroundColor:'#F5F5F7'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:14,backgroundColor:'#fff',borderBottomWidth:StyleSheet.hairlineWidth,borderColor:'#ddd'},title:{fontSize:18,fontWeight:'800'},save:{color:'#FE2C55',fontWeight:'800'},disabled:{opacity:.45},heading:{fontSize:22,fontWeight:'900',marginTop:8},subheading:{fontSize:14,fontWeight:'800',marginTop:20,marginBottom:8},note:{fontSize:13,color:'#6B6B70',lineHeight:19,marginTop:5},inputRow:{flexDirection:'row',gap:8,marginTop:16},input:{flex:1,height:46,borderRadius:12,backgroundColor:'#fff',paddingHorizontal:14},add:{width:46,height:46,borderRadius:12,backgroundColor:'#FE2C55',alignItems:'center',justifyContent:'center'},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:12,paddingVertical:8,borderRadius:18,backgroundColor:'#E5E5EA'},selected:{backgroundColor:'#263D34'},selectedText:{color:'#fff',fontWeight:'700'},field:{marginTop:6},textField:{height:46,borderRadius:12,backgroundColor:'#fff',paddingHorizontal:14},visibility:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},visibilityText:{fontSize:15,color:'#303034'},privacy:{marginTop:20,padding:14,borderRadius:14,backgroundColor:'#fff'} });
