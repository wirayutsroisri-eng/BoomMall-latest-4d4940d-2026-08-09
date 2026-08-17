import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

export const SHOP_HISTORY_CATEGORIES = ['sales'] as const;

export type ShopHistoryCategory = (typeof SHOP_HISTORY_CATEGORIES)[number];

export type ShopActivityEntry = {
  id: string;
  category: 'browse' | 'search';
  title: string;
  subtitle?: string;
  targetId?: string;
  at: string;
};

export type ShopHistoryMeta = {
  key: ShopHistoryCategory;
  title: string;
  subtitle: string;
  empty: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  deletable: boolean;
};

export const SHOP_HISTORY_META: Record<ShopHistoryCategory, ShopHistoryMeta> = {
  sales: {
    key: 'sales',
    title: 'จัดส่ง',
    subtitle: 'คิวแพ็กและรายการขายของร้าน',
    empty: 'ยังไม่มีออเดอร์ขาย',
    icon: 'bicycle-outline',
    deletable: false,
  },
};

export function isShopHistoryCategory(value: string): value is ShopHistoryCategory {
  return (SHOP_HISTORY_CATEGORIES as readonly string[]).includes(value);
}
