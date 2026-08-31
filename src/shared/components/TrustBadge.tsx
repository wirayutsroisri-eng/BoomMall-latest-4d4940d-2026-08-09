import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/shared/theme/colors';

export type TrustBadgeKind = 'factory' | 'store' | 'creator' | 'verified' | null;

export type TrustInfo = {
  /** 0 ผู้ใช้ทั่วไป, 1 ผู้ขายหน้าใหม่, 2 ร้านค้าประจำ, 3 ยืนยันตัวตน, 4 องค์กร/โรงงาน */
  level: 0 | 1 | 2 | 3 | 4;
  badge: TrustBadgeKind;
  label: string;
};

const BADGE_ICON: Record<Exclude<TrustBadgeKind, null>, keyof typeof Ionicons.glyphMap> = {
  factory: 'business',
  store: 'storefront',
  creator: 'ribbon',
  verified: 'checkmark-circle',
};

const LEVEL_COLOR: Record<number, string> = {
  0: '#9AA49F',
  1: '#CD7F32', // bronze
  2: '#A8B0B6', // silver
  3: '#E2A90A', // gold
  4: '#168BFF', // องค์กร/โรงงาน
};

type Props = {
  trust?: TrustInfo | null;
  size?: number;
  /** แสดง label กำกับ (ใช้ในจุดที่มีพื้นที่เยอะ เช่น หน้าโปรไฟล์) */
  showLabel?: boolean;
};

/**
 * ตราสถานะความน่าเชื่อถือของเจ้าของโปรไฟล์
 * — คำนวณจากข้อมูลจริงฝั่ง server ไม่ต้องกรอกเอง
 */
export function TrustBadge({ trust, size = 15, showLabel = false }: Props) {
  if (!trust || !trust.badge || trust.level === 0) return null;
  const icon = BADGE_ICON[trust.badge];
  const color = LEVEL_COLOR[trust.level] ?? LEVEL_COLOR[0];

  return (
    <View style={[styles.wrap, { borderColor: color, borderRadius: size + 3 }]}>
      <Ionicons name={icon} size={size} color={color} />
      {showLabel && trust.label ? <Text style={styles.label}>{trust.label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1.5,
    paddingHorizontal: 4,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '800',
  },
});
