import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSharedValue } from 'react-native-reanimated';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { MY_SHOP_ID } from '@/modules/warehouse/state/warehouse-store';
import type { ProductCard } from '@/modules/chat/domain/types';
import { fetchChatCatalog } from '@/modules/chat/data/chatRealtimeApi';
import { formatTHB, variantImageUri } from '@/modules/shop/domain/product-display';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';

type CatalogRow = {
  key: string;
  productId: string;
  variantId: string;
  title: string;
  sku: string;
  label: string;
  price: number;
  imageUri?: string;
  stock: number;
  shopName?: string;
  shopId?: string;
};

type Props = {
  visible: boolean;
  /** Prefer this shop's catalog when chatting a storefront; otherwise own warehouse. */
  shopId?: string;
  inboxRole?: 'buyer' | 'seller';
  onClose: () => void;
  onSend: (cards: ProductCard[]) => void;
};

function ownsProduct(ownerShopId: string | undefined, shopId: string) {
  return !ownerShopId || ownerShopId === shopId;
}

function cardOf(row: CatalogRow): ProductCard {
  return {
    id: row.productId,
    variantId: row.variantId,
    title: row.title,
    sku: row.sku,
    price: row.price,
    currency: 'THB',
    imageUri: row.imageUri,
    shopName: row.shopName,
    shopId: row.shopId,
    shippingHint: 'ส่งด่วน · คาดส่งภายใน 5 ชม.',
    returnHint: 'คืนได้ใน 7 วัน · คืนเงินเร็ว',
  };
}

export function WarehouseProductPickerSheet({
  visible,
  shopId,
  inboxRole,
  onClose,
  onSend,
}: Props) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [remoteRows, setRemoteRows] = useState<CatalogRow[] | null>(null);

  const masters = useInventoryStore((s) => s.masters);
  const variants = useInventoryStore((s) => s.variants);
  const totalAvailable = useInventoryStore((s) => s.totalAvailable);
  const preferredShop = shopId?.trim() || MY_SHOP_ID;
  const sellerMode = inboxRole !== 'buyer';

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setPicked(new Set());
      setRemoteRows(null);
      scrollY.value = 0;
    }
  }, [visible, scrollY]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void fetchChatCatalog(preferredShop).then((items) => {
      if (cancelled || !items.length) return;
      setRemoteRows(
        items.map((item) => ({
          key: item.variantId,
          productId: item.productId,
          variantId: item.variantId,
          title: item.title,
          sku: item.sku,
          label: item.label,
          price: item.price,
          imageUri: item.imageUri,
          stock: item.stock,
          shopName: item.shopName,
          shopId: item.shopId,
        })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [preferredShop, visible]);

  const localRows = useMemo<CatalogRow[]>(() => {
    const owned = masters.filter((m) => ownsProduct(m.ownerShopId, preferredShop));
    const source = owned.length ? owned : masters.filter((m) => ownsProduct(m.ownerShopId, MY_SHOP_ID));
    return source.flatMap((master) => {
      const options = variants.filter((v) => v.masterSkuId === master.id && v.status !== 'hidden');
      return options.map((variant) => ({
        key: variant.id,
        productId: master.id,
        variantId: variant.id,
        title: master.title,
        sku: variant.sku,
        label: variant.label,
        price: variant.price,
        imageUri: variantImageUri(master, variant),
        stock: totalAvailable(variant.id),
        shopName: master.shopName,
        shopId: master.ownerShopId,
      }));
    });
  }, [masters, preferredShop, totalAvailable, variants]);

  const rows = remoteRows?.length ? remoteRows : localRows;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = `${row.title} ${row.sku} ${row.label}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, rows]);

  const toggle = (key: string) => {
    void Haptics.selectionAsync();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sendSelected = () => {
    const cards = rows.filter((row) => picked.has(row.key)).map(cardOf);
    if (!cards.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSend(cards);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <DragDownDismiss
        onDismiss={onClose}
        showDim
        rootInModal
        scrollY={scrollY}
        rootStyle={styles.flex}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>{sellerMode ? 'เลือกสินค้าจากคลัง' : 'เลือกสินค้าเพื่อถามราคา'}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="ปิด">
            <Ionicons name="close" size={22} color={colors.text.secondary} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          {sellerMode
            ? 'เลือกสินค้าในคลังแล้วส่งการ์ดให้ลูกค้า'
            : 'เลือกสินค้าของร้านนี้แล้วส่งการ์ดเข้าแชทเพื่อสอบถาม'}
        </Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.text.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ค้นหาชื่อ / SKU"
            placeholderTextColor={colors.text.muted}
            style={styles.search}
            returnKeyType="search"
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.key}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            scrollY.value = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={36} color={colors.text.muted} />
              <Text style={styles.emptyTitle}>ยังไม่มีสินค้าในคลัง</Text>
              <Text style={styles.emptyHint}>
                {sellerMode
                  ? 'เพิ่มสินค้าที่หน้าร้านก่อน แล้วกลับมาส่งการ์ดในแชท'
                  : 'ร้านนี้ยังไม่มีสินค้าให้ส่งการ์ด'}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const selected = picked.has(item.key);
            return (
              <Pressable
                style={[styles.row, selected && styles.rowOn]}
                onPress={() => toggle(item.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
              >
                <View style={[styles.check, selected && styles.checkOn]}>
                  {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                {item.imageUri ? (
                  <Image source={{ uri: item.imageUri }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumb} />
                )}
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.sku} numberOfLines={1}>
                    {item.label} · {item.sku}
                  </Text>
                  <Text style={styles.stock}>คงเหลือ {item.stock.toLocaleString('th-TH')} ชิ้น</Text>
                </View>
                <Text style={styles.price}>{formatTHB(item.price)}</Text>
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[styles.sendBtn, !picked.size && styles.sendBtnOff]}
          disabled={!picked.size}
          onPress={sendSelected}
          accessibilityLabel={`ส่งการ์ด ${picked.size} รายการ`}
        >
          <Ionicons name="send" size={16} color={picked.size ? colors.text.inverse : colors.text.muted} />
          <Text style={[styles.sendLabel, !picked.size && styles.sendLabelOff]}>
            {picked.size ? `ส่งการ์ด ${picked.size} รายการ` : 'เลือกสินค้าเพื่อส่งการ์ด'}
          </Text>
        </Pressable>
      </DragDownDismiss>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheet: {
    marginTop: 'auto',
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '86%',
    minHeight: '62%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: '900',
    fontSize: 18,
    color: colors.text.primary,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: colors.text.secondary,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface.canvas,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  search: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
  },
  list: {
    marginTop: 8,
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowOn: {
    backgroundColor: colors.brand.mist,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: '#07C160',
    borderColor: '#07C160',
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.surface.canvas,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontWeight: '800',
    fontSize: 14,
    color: colors.text.primary,
  },
  sku: {
    marginTop: 2,
    fontSize: 12,
    color: colors.text.secondary,
  },
  stock: {
    marginTop: 2,
    fontSize: 11,
    color: colors.text.muted,
  },
  price: {
    fontWeight: '800',
    fontSize: 13,
    color: colors.text.primary,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 16,
    color: colors.text.primary,
  },
  emptyHint: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  sendBtn: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: colors.brand.primaryDark,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnOff: {
    backgroundColor: colors.surface.canvas,
  },
  sendLabel: {
    fontWeight: '800',
    fontSize: 15,
    color: colors.text.inverse,
  },
  sendLabelOff: {
    color: colors.text.muted,
  },
});
