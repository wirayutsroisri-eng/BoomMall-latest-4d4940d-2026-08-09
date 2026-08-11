import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';

type DocKey = 'privacy' | 'terms';

const DOCS: Record<
  DocKey,
  { title: string; updated: string; sections: Array<{ h: string; p: string }> }
> = {
  privacy: {
    title: 'นโยบายความเป็นส่วนตัว',
    updated: 'อัปเดตล่าสุด: 11 สิงหาคม 2026',
    sections: [
      {
        h: '1. ข้อมูลที่เราเก็บ',
        p: 'BoomMall อาจเก็บข้อมูลบัญชี (ชื่อที่แสดง, แฮนเดิล), เนื้อหาที่คุณโพสต์หรือส่งในแชต, ข้อมูลอุปกรณ์ที่จำเป็นต่อการทำงานของแอป และรายงานการละเมิดที่คุณส่งมาเพื่อความปลอดภัยของชุมชน',
      },
      {
        h: '2. วัตถุประสงค์การใช้',
        p: 'ใช้เพื่อให้บริการแชต ฟีด มาร์เก็ตเพลส คลังสินค้า และการกลั่นกรองเนื้อหา ไม่ขายข้อมูลส่วนบุคคลให้บุคคลที่สามเพื่อโฆษณาโดยไม่ได้รับความยินยอม',
      },
      {
        h: '3. สิทธิ์อุปกรณ์',
        p: 'กล้อง ไมโครโฟน และคลังภาพถูกขอเฉพาะเมื่อคุณใช้ฟีเจอร์ที่เกี่ยวข้อง (ถ่าย/แนบรูป วอยซ์โน้ต โพสต์) Face ID ใช้เพื่อปลดล็อก Vault และยืนยันตัวตนเมื่อคุณเปิดใช้',
      },
      {
        h: '4. การรายงานและบล็อก',
        p: 'คุณสามารถรายงานและบล็อกผู้ใช้/เนื้อหาที่ไม่เหมาะสม รายงานจะถูกเก็บเพื่อตรวจสอบตามคิว moderation',
      },
      {
        h: '5. การลบบัญชี',
        p: 'คุณสามารถลบบัญชีได้จากเมนูตั้งค่าความปลอดภัยในแอป เมื่อลบแล้วข้อมูลบัญชีบนอุปกรณ์นี้จะถูกลบตามขั้นตอนของแอป',
      },
      {
        h: '6. ติดต่อ',
        p: 'สอบถามเรื่องความเป็นส่วนตัว: privacy@boommall.app',
      },
    ],
  },
  terms: {
    title: 'ข้อกำหนดการใช้บริการ (EULA)',
    updated: 'อัปเดตล่าสุด: 11 สิงหาคม 2026',
    sections: [
      {
        h: '1. การยอมรับข้อกำหนด',
        p: 'การใช้ BoomMall หมายความว่าคุณยอมรับข้อกำหนดนี้และนโยบายความเป็นส่วนตัว หากไม่ยอมรับโปรดหยุดใช้แอป',
      },
      {
        h: '2. บัญชีและความปลอดภัย',
        p: 'คุณรับผิดชอบการรักษาความปลอดภัยของบัญชีและอุปกรณ์ ห้ามใช้บัญชีผู้อื่นโดยไม่ได้รับอนุญาต',
      },
      {
        h: '3. เนื้อหาที่ผู้ใช้สร้าง (UGC)',
        p: 'คุณต้องไม่โพสต์เนื้อหาที่ผิดกฎหมาย หลอกลวง คุกคาม หรือละเมิดลิขสิทธิ์ BoomMall มีระบบรายงาน/บล็อกในแอป และทีม moderation สามารถบล็อกหรือลบโพสต์ที่ไม่พึงประสงค์จากระบบหลังบ้านได้',
      },
      {
        h: '4. การซื้อสินค้ากายภาพ',
        p: 'การสั่งซื้อสินค้ากายภาพจะเรียกเก็บผ่านระบบชำระเงินที่เชื่อมต่อจริงเท่านั้น เวอร์ชันที่ยังไม่พร้อมชำระเงินจะไม่มีการเรียกเก็บหรืออ้างว่าชำระสำเร็จ',
      },
      {
        h: '5. สิทธิ์ในทรัพย์สินทางปัญญา',
        p: 'ห้ามอัปโหลดเพลงหรือสื่อที่คุณไม่มีสิทธิ์ หากมีการร้องเรียน BoomMall อาจลบเนื้อหาตามกระบวนการ takedown',
      },
      {
        h: '6. การจำกัดความรับผิด',
        p: 'บริการให้ตามสภาพที่เป็นอยู่ ในขอบเขตที่กฎหมายอนุญาต BoomMall ไม่รับผิดชอบความเสียหายทางอ้อมจากการใช้งาน',
      },
      {
        h: '7. ติดต่อ',
        p: 'สอบถามข้อกำหนด: legal@boommall.app',
      },
    ],
  },
};

export function LegalDocScreen() {
  const insets = useSafeAreaInsets();
  const { doc: docParam } = useLocalSearchParams<{ doc?: string | string[] }>();
  const raw = Array.isArray(docParam) ? docParam[0] : docParam;
  const key: DocKey = raw === 'terms' ? 'terms' : 'privacy';
  const doc = DOCS[key];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => router.back()} accessibilityLabel="กลับ">
          <Ionicons name="chevron-back" size={26} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {doc.title}
        </Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>{doc.updated}</Text>
        {doc.sections.map((s) => (
          <View key={s.h} style={styles.block}>
            <Text style={styles.h}>{s.h}</Text>
            <Text style={styles.p}>{s.p}</Text>
          </View>
        ))}
        <View style={styles.switchRow}>
          <Pressable
            onPress={() =>
              router.replace({
                pathname: '/legal/[doc]',
                params: { doc: key === 'privacy' ? 'terms' : 'privacy' },
              })
            }
          >
            <Text style={styles.link}>
              ดู{key === 'privacy' ? 'ข้อกำหนดการใช้บริการ' : 'นโยบายความเป็นส่วนตัว'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.text.primary,
  },
  updated: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: 16,
  },
  block: { marginBottom: 18, gap: 6 },
  h: { fontSize: 15, fontWeight: '800', color: colors.text.primary },
  p: { fontSize: 14, lineHeight: 22, color: colors.text.secondary },
  switchRow: { marginTop: 8, marginBottom: 20 },
  link: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand.primaryDark,
  },
});
