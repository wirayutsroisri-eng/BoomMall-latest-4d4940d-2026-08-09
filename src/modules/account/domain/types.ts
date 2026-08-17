import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

/** ประวัติฝั่งโปรไฟล์ผู้ใช้เท่านั้น — ไม่รวมร้านค้า/ธุรกรรม */
export const USER_ACTIVITY_CATEGORIES = ['watch', 'search', 'music', 'chat'] as const;

export type ActivityCategory = (typeof USER_ACTIVITY_CATEGORIES)[number];

export type ActivityEntry = {
  id: string;
  category: Exclude<ActivityCategory, 'music'> | 'shop';
  title: string;
  subtitle?: string;
  targetId?: string;
  at: string;
};

export type ActivityCategoryMeta = {
  key: ActivityCategory;
  title: string;
  subtitle: string;
  empty: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

export const ACTIVITY_CATEGORY_META: Record<ActivityCategory, ActivityCategoryMeta> = {
  watch: {
    key: 'watch',
    title: 'ประวัติรับชมคลิป',
    subtitle: 'คลิปที่ดูในฟีด',
    empty: 'ยังไม่มีประวัติรับชม',
    icon: 'play-circle-outline',
  },
  search: {
    key: 'search',
    title: 'ประวัติค้นหาผู้ใช้',
    subtitle: 'คำค้นเพื่อนและร้านในแชต',
    empty: 'ยังไม่มีประวัติค้นหา',
    icon: 'search-outline',
  },
  music: {
    key: 'music',
    title: 'ประวัติเพลง',
    subtitle: 'เพลงและคลิปเสียงที่ฟัง',
    empty: 'ยังไม่มีประวัติเพลง',
    icon: 'musical-notes-outline',
  },
  chat: {
    key: 'chat',
    title: 'ประวัติแชต',
    subtitle: 'ห้องที่เปิดคุย',
    empty: 'ยังไม่มีประวัติแชต',
    icon: 'chatbubble-ellipses-outline',
  },
};

export function isActivityCategory(value: string): value is ActivityCategory {
  return (USER_ACTIVITY_CATEGORIES as readonly string[]).includes(value);
}
