import React, { useMemo } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { formatTHB, ratingOf, shopAvatarUri, shopKeyOf, promoShareShop } from '@/modules/shop/domain/product-display';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { jumpToChatThread } from '@/shared/navigation/safeNavigate';
import { colors } from '@/shared/theme/colors';

const SCREEN_W = Dimensions.get('window').width;
const COLS = 3;
const H_PAD = 10;
const GAP = 5;
const COL_W = (SCREEN_W - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
const ORANGE = '#EE4D2D';

export function ShopStorefrontScreen() {
  const insets = useSafeAreaInsets();
  const { shopKey } = useLocalSearchParams<{ shopKey: string }>();
  const key = typeof shopKey === 'string' ? shopKey : '';

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);

  const products = useMemo(
    () => masters.filter((m) => shopKeyOf(m) === key),
    [masters, key],
  );

  const shopName = products[0]?.shopName ?? key;
  const verified = products.some((m) => m.channel !== 'C2C');
  const startShopConversation = useChatStore((s) => s.startShopConversation);

  const openShopChat = () => {
    const shopId = products[0]?.ownerShopId?.trim() || key;
    const conversationId = startShopConversation({
      shopId,
      shopName,
      sellerId: shopId,
    });
    jumpToChatThread(conversationId);
  };

  const priceOf = (id: string, base: number) => {
    const vs = variants.filter((v) => v.masterSkuId === id);
    return vs.length ? Math.min(...vs.map((v) => v.price)) : base;
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/shop'))}
          accessibilityLabel="ย้อนกลับ"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {shopName}
        </Text>
        <Pressable
          hitSlop={8}
          accessibilityLabel="แชร์ร้านค้า"
          onPress={() => {
            void Share.share({ title: shopName, message: promoShareShop(shopName) });
          }}
        >
          <Ionicons name="share-outline" size={22} color={colors.text.primary} />
        </Pressable>
      </View>

      <FlatList
        data={products}
        numColumns={COLS}
        key="store-grid-3"
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.row}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={styles.hero}>
            <Image source={{ uri: shopAvatarUri(key) }} style={styles.avatar} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {shopName}
                </Text>
                {verified ? <Ionicons name="checkmark-circle" size={16} color={colors.accent.info} /> : null}
              </View>
              <Text style={styles.meta}>
                ★ {ratingOf(key)} · {products.length} สินค้า
              </Text>
            </View>
            <Pressable style={styles.chatBtn} onPress={openShopChat} accessibilityLabel="แชทร้าน">
              <Ionicons name="chatbubble-ellipses" size={16} color="#fff" />
              <Text style={styles.chatBtnText}>แชท</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>ร้านนี้ยังไม่มีสินค้า</Text>}
        renderItem={({ item }) => {
          const price = priceOf(item.id, item.basePrice);
          return (
            <Pressable
              style={[styles.card, { width: COL_W }]}
              onPress={() => router.push({ pathname: '/shop/product/[id]', params: { id: item.id } })}
            >
              <Image
                source={{ uri: item.imageUri ?? masterContentImage(item.id) }}
                style={[styles.thumb, { width: COL_W, height: COL_W }]}
                resizeMode="cover"
              />
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.price}>{formatTHB(price)}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  topTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text.primary },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: H_PAD,
    paddingVertical: 14,
    marginBottom: 10,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#DDD' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '800', color: colors.text.primary },
  meta: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ORANGE,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chatBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  row: { paddingHorizontal: H_PAD, gap: GAP, marginBottom: 10 },
  card: { backgroundColor: '#fff', overflow: 'hidden', paddingBottom: 8 },
  thumb: { backgroundColor: '#EEE' },
  cardTitle: {
    marginTop: 6,
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
    lineHeight: 16,
    minHeight: 32,
  },
  price: { marginTop: 2, paddingHorizontal: 4, fontSize: 14, fontWeight: '800', color: ORANGE },
  empty: { textAlign: 'center', marginTop: 40, color: colors.text.muted, fontWeight: '700' },
});
