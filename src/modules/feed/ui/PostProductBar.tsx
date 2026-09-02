import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { FeedPostProduct } from '@/modules/feed/domain/types';
import { trackFeedSignal } from '@/modules/feed/data/feedEventQueue';

/**
 * ปักตะกร้า — สินค้าจริงที่ผูกกับโพสต์
 *
 * ราคา/สต็อกมาจากคลังสดทุกครั้งที่โหลดฟีด แตะแล้วไปหน้าสินค้าของร้านนั้น
 * ถ้าสินค้าถูกลบหรือซ่อนหลังปัก แถบจะบอกตรงๆ ว่าไม่พร้อมขาย ไม่พาไปหน้าเปล่า
 */
export function PostProductBar({
  products,
  itemId,
  rootId,
  tone = 'light',
}: {
  products: FeedPostProduct[] | undefined;
  itemId: string;
  rootId?: string;
  /** 'dark' สำหรับการ์ดคลิปพื้นดำ, 'light' สำหรับฟีดพื้นขาว */
  tone?: 'light' | 'dark';
}) {
  if (!products?.length) return null;
  const dark = tone === 'dark';

  return (
    <View style={styles.wrap}>
      {products.slice(0, 3).map((product) => {
        const unavailable = !product.active;
        const soldOut = product.active && !product.inStock;
        return (
          <Pressable
            key={product.productId}
            style={[styles.row, dark ? styles.rowDark : styles.rowLight, unavailable && styles.rowMuted]}
            disabled={unavailable}
            onPress={() => {
              trackFeedSignal({ itemId, rootId, type: 'engage', action: 'product' });
              router.push({
                pathname: '/shop/product/[id]',
                params: { id: product.productId, from: 'feed', postId: itemId },
              });
            }}
            accessibilityRole="button"
            accessibilityLabel={unavailable ? 'สินค้านี้ไม่พร้อมขาย' : `ดูสินค้า ${product.title}`}
          >
            <View style={[styles.badge, dark && styles.badgeDark]}>
              <Ionicons name="bag-handle" size={14} color={dark ? '#0A1611' : '#FFFFFF'} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, dark && styles.titleDark]} numberOfLines={1}>
                {unavailable ? 'สินค้านี้ไม่พร้อมขาย' : product.title}
              </Text>
              {!unavailable ? (
                <Text style={[styles.sub, dark && styles.subDark]} numberOfLines={1}>
                  ฿{product.priceThb.toLocaleString('th-TH')}
                  {soldOut ? ' · สินค้าหมด' : ''}
                  {product.shopName ? ` · ${product.shopName}` : ''}
                </Text>
              ) : null}
            </View>
            {!unavailable ? (
              <Ionicons name="chevron-forward" size={18} color={dark ? 'rgba(255,255,255,0.7)' : '#7C8F86'} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  rowLight: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(10,22,17,0.10)' },
  rowDark: { backgroundColor: 'rgba(0,0,0,0.55)' },
  rowMuted: { opacity: 0.6 },
  badge: {
    width: 26, height: 26, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#00A86B',
  },
  badgeDark: { backgroundColor: '#00D68F' },
  text: { flex: 1, gap: 1 },
  title: { fontSize: 13.5, fontWeight: '700', color: '#0A1611' },
  titleDark: { color: '#FFFFFF' },
  sub: { fontSize: 12, color: '#4A5C54' },
  subDark: { color: 'rgba(255,255,255,0.78)' },
});
