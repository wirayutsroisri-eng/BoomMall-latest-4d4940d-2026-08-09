import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import type { IncomingOrder } from '@/modules/store/domain/types';
import { mergeSameAddressOrders } from '@/modules/store/domain/address-merge';
import { sortFulfillmentQueue } from '@/modules/store/domain/fulfillment-priority';
import { shareFulfillmentLabel, writeShareFile } from '@/modules/store/domain/share-label';
import { downloadPickListPdf, downloadShippingLabelsPdf, updateCommerceOrderShipping } from '@/modules/commerce/data/commerceApi';
import { pullCommerceCatalog } from '@/modules/commerce/data/commerceSync';
import { pullMerchantIncomingOrders } from '@/modules/store/data/pull-merchant-orders';
import { consolidatePickList } from '@/modules/store/domain/pick-list';
import { commitPackedOrdersLocally } from '@/modules/store/domain/fulfillment-stock';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { colors } from '@/shared/theme/colors';
import { openSellerOrderChat } from '@/modules/store/domain/order-chat';
import { packingManifestOf, toSellerMergeable } from '@/modules/store/domain/packing-manifest';
import { linesOfOrder } from '@/modules/store/domain/pack-lines';
import { FulfillmentOrderCard } from '@/modules/store/ui/fulfillment/FulfillmentOrderCard';
import {
  ShippingLabelSheet,
  type LabelPreviewModel,
} from '@/modules/store/ui/fulfillment/ShippingLabelPreview';

type ShipFilter = 'todo' | 'shipping' | 'done' | 'all';

const SHOP = {
  name: 'Boom EV Shop Chanthaburi',
  address: 'จันทบุรี · Boom Mall Seller',
};

function labelModelFor(orders: IncomingOrder[]): LabelPreviewModel {
  const pack = packingManifestOf(orders);
  const order = pack.orders[0] ?? orders[0]!;
  return {
    trackingNumber: order.trackingNo ?? `BM${order.id.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase()}`,
    carrier: 'Kerry',
    shopName: SHOP.name,
    shopAddress: SHOP.address,
    recipientName: order.customerName,
    recipientPhone: order.recipientPhone ?? '',
    recipientAddress: order.shippingAddress ?? '',
    paymentKind: pack.paymentKind,
    codAmountThb: pack.codAmountThb,
    orderIds: pack.orderIds,
    lines: pack.lines.map((line) => ({
      title: line.title,
      option: line.option,
      sku: line.sku,
      qty: line.qty,
      unitPrice: line.unitPrice ?? 0,
      imageUri: line.imageUri,
      productId: line.productId,
    })),
    summaryLabel: pack.summary.label,
    productImageUri: order.imageUri ?? pack.lines[0]?.imageUri,
    printedAt: new Date().toLocaleString('th-TH'),
  };
}

export function SellerShippingScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tablet = width >= 768;
  const incomingOrders = useOrdersStore((s) => s.incomingOrders);
  const advanceIncomingOrder = useOrdersStore((s) => s.advanceIncomingOrder);
  const [filter, setFilter] = useState<ShipFilter>('todo');
  const [now, setNow] = useState(Date.now());
  const [preview, setPreview] = useState<LabelPreviewModel | null>(null);
  const [busy, setBusy] = useState<'share' | 'print' | 'pick' | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const labelRef = useRef<View>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void pullMerchantIncomingOrders();
    const t = setInterval(() => void pullMerchantIncomingOrders(), 20_000);
    return () => clearInterval(t);
  }, []);

  const paid = useMemo(
    () => incomingOrders.filter((o) => o.status === 'paid' && !o.returnRequested),
    [incomingOrders],
  );
  const mergeGroups = useMemo(() => mergeSameAddressOrders(paid.map((o) => toSellerMergeable(o))), [paid]);
  const todoGroups = useMemo(() => {
    const byId = new Map(paid.map((o) => [o.id, o]));
    const groups = mergeGroups
      .map((g) => {
        const orders = sortFulfillmentQueue(
          g.orderIds.map((id) => byId.get(id)).filter((o): o is IncomingOrder => Boolean(o)),
          now,
        );
        const pack = packingManifestOf(orders);
        return {
          key: g.addressKey,
          orders: pack.orders,
          lines: pack.lines,
          amount: pack.amount,
        };
      })
      .filter((g) => g.orders.length);
    const primaries = groups.map((g) => g.orders[0]!);
    const ranked = sortFulfillmentQueue(primaries, now);
    const rank = new Map(ranked.map((o, i) => [o.id, i]));
    return groups.sort((a, b) => (rank.get(a.orders[0]!.id) ?? 99) - (rank.get(b.orders[0]!.id) ?? 99));
  }, [mergeGroups, paid, now]);
  const shipped = useMemo(
    () => incomingOrders.filter((o) => o.status === 'shipped' && !o.returnRequested),
    [incomingOrders],
  );
  const delivered = useMemo(
    () => incomingOrders.filter((o) => o.status === 'delivered' && !o.returnRequested),
    [incomingOrders],
  );
  const rows = useMemo(() => {
    const packs = todoGroups.map((g) => ({ kind: 'pack' as const, ...g }));
    const inTransit = shipped.map((order) => ({ kind: 'shipping' as const, order }));
    const done = delivered.map((order) => ({ kind: 'done' as const, order }));
    if (filter === 'todo') return packs;
    if (filter === 'shipping') return inTransit;
    if (filter === 'done') return done;
    return [...packs, ...inTransit, ...done];
  }, [filter, todoGroups, shipped, delivered]);

  const markPacked = (orders: IncomingOrder[]) => {
    for (const order of orders) {
      if (order.status === 'paid') advanceIncomingOrder(order.id);
    }
    commitPackedOrdersLocally(orders);
    setPreview(null);
    exitSelect();
    setFilter('shipping');
    void Promise.all(
      orders.map((order) =>
        updateCommerceOrderShipping(order.id, {
          shippingStatus: 'PACKED',
          trackingNumber: order.trackingNo,
        }).catch(() => undefined),
      ),
    ).then(() => {
      void pullCommerceCatalog();
      void pullMerchantIncomingOrders();
    });
  };

  const markDelivered = (order: IncomingOrder) => {
    if (order.status !== 'shipped') return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    advanceIncomingOrder(order.id);
    void updateCommerceOrderShipping(order.id, {
      shippingStatus: 'DELIVERED',
      trackingNumber: order.trackingNo,
    })
      .catch(() => undefined)
      .then(() => pullMerchantIncomingOrders());
  };

  const printPickList = async () => {
    const packs = selecting && selectedKeys.length
      ? todoGroups.filter((group) => selectedKeys.includes(group.key))
      : todoGroups;
    const orders = packs.flatMap((pack) => pack.orders);
    if (!orders.length) return;
    const wave = consolidatePickList(orders);
    setBusy('pick');
    try {
      const file = await downloadPickListPdf({
        orderIds: orders.map((order) => order.id),
        lines: wave.lines,
      });
      const uri = await writeShareFile(file.bytes, file.filename);
      await shareFulfillmentLabel({
        uri,
        message: `ใบหยิบของ Boom Mall · ${wave.skuCount} SKU · ${wave.pieceCount} ชิ้น`,
        title: 'สรุปรายการหยิบของรวม',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert(
        'สร้างใบหยิบของไม่สำเร็จ',
        e instanceof Error ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์เพื่อพิมพ์ใบรวมหยิบของ',
      );
    } finally {
      setBusy(null);
    }
  };

  const openPreview = (orders?: IncomingOrder[]) => {
    if (!orders?.length) return;
    void Haptics.selectionAsync();
    setPreview(labelModelFor(orders));
  };

  const captureLabel = async () => {
    await new Promise((r) => setTimeout(r, 220));
    const { captureRef } = await import('react-native-view-shot');
    return captureRef(labelRef, { format: 'png', quality: 0.95, result: 'tmpfile' as const });
  };

  const shareLabel = async (orders: IncomingOrder[]) => {
    const model = labelModelFor(orders);
    setPreview(model);
    setBusy('share');
    try {
      const uri = await captureLabel();
      const message = [
        'ใบปะหน้า Boom Mall 4×6',
        `เลขพัสดุ ${model.trackingNumber}`,
        `ผู้รับ ${model.recipientName} ${model.recipientPhone}`,
        model.recipientAddress,
        `ออเดอร์ ${model.orderIds.join(', ')}`,
      ].join('\n');
      await shareFulfillmentLabel({ uri, message, title: 'แชร์ใบปะหน้า' });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('แชร์ไม่สำเร็จ', e instanceof Error ? e.message : 'ลองใหม่อีกครั้ง');
    } finally {
      setBusy(null);
    }
  };

  const selectableKeys = useMemo(
    () => todoGroups.map((g) => g.key),
    [todoGroups],
  );
  const selectedPacks = useMemo(
    () => todoGroups.filter((g) => selectedKeys.includes(g.key)),
    [todoGroups, selectedKeys],
  );
  const allSelected = selectableKeys.length > 0 && selectableKeys.every((key) => selectedKeys.includes(key));

  const exitSelect = () => {
    setSelecting(false);
    setSelectedKeys([]);
  };

  const enterSelect = (key?: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelecting(true);
    setSelectedKeys(key ? [key] : []);
  };

  const toggleSelect = (key: string) => {
    void Haptics.selectionAsync();
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const toggleSelectAll = () => {
    void Haptics.selectionAsync();
    setSelectedKeys(allSelected ? [] : selectableKeys);
  };

  const printBulk = async () => {
    if (!selectedPacks.length) return;
    const orderIds = selectedPacks.flatMap((pack) => pack.orders.map((order) => order.id));
    setBusy('print');
    try {
      const file = await downloadShippingLabelsPdf({
        orderIds,
        carrier: 'Kerry',
        persist: true,
      });
      const uri = await writeShareFile(file.bytes, file.filename);
      await shareFulfillmentLabel({
        uri,
        message: `พิมพ์ใบปะหน้า Boom Mall ${selectedPacks.length} ใบ`,
        title: `พิมพ์ ${selectedPacks.length} ใบปะหน้า`,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markPacked(selectedPacks.flatMap((pack) => pack.orders));
    } catch (e) {
      Alert.alert(
        'พิมพ์ไม่สำเร็จ',
        e instanceof Error ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์เพื่อสร้าง PDF หลายใบในไฟล์เดียว',
      );
    } finally {
      setBusy(null);
    }
  };

  const shareBulk = async () => {
    if (!selectedPacks.length) return;
    const orderIds = selectedPacks.flatMap((pack) => pack.orders.map((order) => order.id));
    setBusy('share');
    try {
      const file = await downloadShippingLabelsPdf({
        orderIds,
        carrier: 'Kerry',
        persist: false,
      });
      const uri = await writeShareFile(file.bytes, file.filename);
      await shareFulfillmentLabel({
        uri,
        message: `ใบปะหน้า Boom Mall ${selectedPacks.length} ใบ`,
        title: `แชร์ ${selectedPacks.length} ใบปะหน้า`,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('แชร์ไม่สำเร็จ', e instanceof Error ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์เพื่อส่งหลายใบในไฟล์เดียว');
    } finally {
      setBusy(null);
    }
  };

  const printNow = async (orders: IncomingOrder[]) => {
    const model = labelModelFor(orders);
    setBusy('print');
    try {
      const file = await downloadShippingLabelsPdf({
        orderIds: model.orderIds,
        carrier: 'Kerry',
        persist: true,
        packingLines: model.lines,
      });
      const uri = await writeShareFile(file.bytes, file.filename);
      await shareFulfillmentLabel({
        uri,
        message: `พิมพ์ใบปะหน้า Boom Mall ${file.filename}`,
        title: 'พิมพ์ใบปะหน้าทันที',
      });
      markPacked(orders);
    } catch (e) {
      Alert.alert(
        'พิมพ์ไม่สำเร็จ',
        e instanceof Error ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์เพื่อสร้าง PDF 100×150 มม.',
      );
    } finally {
      setBusy(null);
    }
  };

  const labelWidth = Math.min(width - 40, tablet ? 360 : 320);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          hitSlop={10}
          onPress={() => (selecting ? exitSelect() : router.back())}
        >
          <Ionicons name={selecting ? 'close' : 'chevron-back'} size={24} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{selecting ? `เลือกแล้ว ${selectedKeys.length} ใบ` : 'จัดส่ง'}</Text>
          <Text style={styles.sub}>
            {selecting
              ? 'แตะการ์ดเพื่อเลือก · กดค้างก็เข้าโหมดนี้ได้'
              : `${todoGroups.length} รอแพ็ก · ${shipped.length} กำลังจัดส่ง · ${delivered.length} สำเร็จ`}
          </Text>
        </View>
        {todoGroups.length ? (
          <Pressable
            onPress={() => (selecting ? toggleSelectAll() : enterSelect())}
            hitSlop={8}
          >
            <Text style={styles.selectBtn}>
              {selecting ? (allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด') : 'เลือก'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.segment}>
        {([
          ['todo', `รอแพ็ก ${todoGroups.length}`],
          ['shipping', `กำลังจัดส่ง ${shipped.length}`],
          ['done', `สำเร็จ ${delivered.length}`],
          ['all', 'ทั้งหมด'],
        ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.segBtn, filter === key && styles.segBtnOn]}
            onPress={() => {
              setFilter(key);
              if (selecting) exitSelect();
            }}
          >
            <Text style={[styles.segText, filter === key && styles.segTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {filter === 'todo' && todoGroups.length ? (
        <Pressable
          style={styles.pickListBtn}
          onPress={() => void printPickList()}
          disabled={busy === 'pick'}
        >
          {busy === 'pick' ? (
            <ActivityIndicator color={colors.brand.primaryDark} />
          ) : (
            <>
              <Ionicons name="list-outline" size={18} color={colors.brand.primaryDark} />
              <Text style={styles.pickListText}>
                {selecting && selectedKeys.length
                  ? `สรุปรายการหยิบของรวม · ${selectedKeys.length} ใบ`
                  : 'สรุปรายการหยิบของรวม (Pick List)'}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => (item.kind === 'pack' ? item.key : `${item.kind}-${item.order.id}`)}
        numColumns={tablet && filter === 'todo' ? 2 : 1}
        key={tablet && filter === 'todo' ? 'tab' : 'phone'}
        columnWrapperStyle={tablet && filter === 'todo' ? { gap: 12, paddingHorizontal: 16 } : undefined}
        contentContainerStyle={{
          paddingHorizontal: tablet && filter === 'todo' ? 0 : 16,
          paddingBottom: insets.bottom + (selecting ? 96 : 24),
        }}
        ListEmptyComponent={<Text style={styles.empty}>ไม่มีออเดอร์ในคิวนี้</Text>}
        renderItem={({ item }) =>
          item.kind === 'shipping' || item.kind === 'done' ? (
            <FulfillmentOrderCard
              stage={item.kind === 'done' ? 'done' : 'shipping'}
              order={item.order}
              now={now}
              lines={linesOfOrder(item.order)}
              amount={item.order.amount}
              onOpen={() => openPreview([item.order])}
              onShare={() => void shareLabel([item.order])}
              onPrint={() => void printNow([item.order])}
              onChatBuyer={() => openSellerOrderChat(item.order)}
              onMarkDelivered={item.kind === 'shipping' ? () => markDelivered(item.order) : undefined}
            />
          ) : (
            <View style={tablet && filter === 'todo' ? { flex: 1 } : undefined}>
              <FulfillmentOrderCard
                order={item.orders[0]!}
                now={now}
                lines={item.lines}
                orderCount={item.orders.length}
                amount={item.amount}
                selecting={selecting}
                selected={selectedKeys.includes(item.key)}
                onOpen={() => openPreview(item.orders)}
                onShare={() => void shareLabel(item.orders)}
                onPrint={() => void printNow(item.orders)}
                onChatBuyer={() => openSellerOrderChat(item.orders[0]!)}
                onLongPress={() => (selecting ? toggleSelect(item.key) : enterSelect(item.key))}
                onToggleSelect={() => toggleSelect(item.key)}
              />
            </View>
          )
        }
      />

      {selecting ? (
        <View style={[styles.bulkBar, { paddingBottom: insets.bottom + 10 }]}>
          <Pressable
            style={[styles.bulkBtn, !selectedKeys.length && styles.bulkOff]}
            disabled={!selectedKeys.length || busy === 'share'}
            onPress={() => void shareBulk()}
          >
            {busy === 'share' ? (
              <ActivityIndicator color={colors.brand.primaryDark} />
            ) : (
              <Text style={styles.bulkBtnText}>แชร์ {selectedKeys.length} ใบ</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.bulkBtnDark, !selectedKeys.length && styles.bulkOff]}
            disabled={!selectedKeys.length || busy === 'print'}
            onPress={() => void printBulk()}
          >
            {busy === 'print' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bulkBtnDarkText}>พิมพ์ {selectedKeys.length} ใบปะหน้า</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      {preview ? (
      <Modal visible transparent animationType="none" onRequestClose={() => setPreview(null)}>
        <DragDownDismiss
          onDismiss={() => setPreview(null)}
          showDim
          rootInModal
          rootStyle={styles.dismissRoot}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>ใบปะหน้า Boom Mall 4×6</Text>
            <Text style={styles.sheetSub}>ลากลงเพื่อปิด · กดแชร์แล้วเลือกแอปที่ต้องการ</Text>
            <View style={styles.labelWrap} collapsable={false}>
              <ShippingLabelSheet ref={labelRef} model={preview} width={labelWidth} />
            </View>
            {preview.orderIds.some((id) => incomingOrders.find((o) => o.id === id)?.status === 'paid') ? (
              <Pressable
                style={styles.packCta}
                onPress={() => {
                  const orders = preview.orderIds
                    .map((id) => incomingOrders.find((o) => o.id === id))
                    .filter((o): o is IncomingOrder => Boolean(o));
                  markPacked(orders);
                }}
              >
                <Text style={styles.packCtaText}>แพ็กแล้ว · ไปกำลังจัดส่ง</Text>
              </Pressable>
            ) : null}
            <View style={styles.sheetActions}>
              <Pressable
                style={styles.iconBtn}
                onPress={() => {
                  const orders = (preview?.orderIds ?? [])
                    .map((id) => incomingOrders.find((o) => o.id === id))
                    .filter((o): o is IncomingOrder => Boolean(o));
                  if (orders.length) void shareLabel(orders);
                }}
                disabled={busy === 'share'}
                accessibilityLabel="แชร์"
              >
                {busy === 'share' ? (
                  <ActivityIndicator color={colors.brand.primaryDark} />
                ) : (
                  <Ionicons name="share-outline" size={20} color={colors.brand.primaryDark} />
                )}
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => {
                  const order = incomingOrders.find((o) => preview?.orderIds.includes(o.id));
                  if (order) openSellerOrderChat(order);
                }}
                accessibilityLabel="แชท"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.brand.primaryDark} />
              </Pressable>
              <Pressable
                style={styles.iconBtnDark}
                onPress={() => {
                  const orders = (preview?.orderIds ?? [])
                    .map((id) => incomingOrders.find((o) => o.id === id))
                    .filter((o): o is IncomingOrder => Boolean(o));
                  if (orders.length) void printNow(orders);
                }}
                disabled={busy === 'print'}
                accessibilityLabel="พิมพ์"
              >
                {busy === 'print' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="print-outline" size={20} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        </DragDownDismiss>
      </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F2F2F7' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text.primary },
  sub: { marginTop: 1, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  selectBtn: { fontSize: 14, fontWeight: '800', color: colors.brand.primaryDark },
  bulkBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D7E4DC',
  },
  bulkBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#E8F7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkBtnDark: {
    flex: 1.2,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0B1F17',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkOff: { opacity: 0.4 },
  bulkBtnText: { fontSize: 15, fontWeight: '800', color: colors.brand.primaryDark },
  bulkBtnDarkText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#E5E5EA',
    borderRadius: 10,
    padding: 2,
  },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segBtnOn: { backgroundColor: '#fff' },
  segText: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  segTextOn: { color: colors.text.primary },
  empty: { textAlign: 'center', marginTop: 40, color: colors.text.muted, fontWeight: '600' },
  pickListBtn: {
    marginHorizontal: 16,
    marginBottom: 12,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#E8F7F0',
    borderWidth: 1,
    borderColor: '#0B1F17',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  pickListText: { fontSize: 14, fontWeight: '800', color: colors.brand.primaryDark },
  packCta: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#00A86B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  packCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dismissRoot: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text.primary },
  sheetSub: { marginTop: 4, marginBottom: 12, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  labelWrap: { alignItems: 'center' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E8F7F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0B1F17',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
