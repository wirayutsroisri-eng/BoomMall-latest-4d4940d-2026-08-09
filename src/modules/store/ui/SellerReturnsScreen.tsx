import React, { useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { colors } from '@/shared/theme/colors';

function formatTHB(n: number) {
  return `฿${n.toLocaleString('th-TH')}`;
}

export function SellerReturnsScreen() {
  const insets = useSafeAreaInsets();
  const incomingOrders = useOrdersStore((s) => s.incomingOrders);
  const acceptIncomingReturn = useOrdersStore((s) => s.acceptIncomingReturn);

  const queue = useMemo(
    () => incomingOrders.filter((o) => o.returnRequested && o.status === 'delivered'),
    [incomingOrders],
  );
  const history = useMemo(
    () => incomingOrders.filter((o) => o.status === 'cancelled'),
    [incomingOrders],
  );

  const accept = (id: string, title: string) => {
    const result = acceptIncomingReturn(id);
    if (!result.ok) {
      Alert.alert('รับคืนไม่ได้', result.reason);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('รับคืนแล้ว', `รับคืน “${title}” แล้ว สถานะเป็นยกเลิก/คืนสินค้า`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>คืนสินค้า</Text>
          <Text style={styles.sub}>รับคืนของจากลูกค้าตามคำขอจริง</Text>
        </View>
      </View>

      <FlatList
        data={queue}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <Text style={styles.section}>รอรับคืน {queue.length} รายการ</Text>
        }
        ListEmptyComponent={<Text style={styles.empty}>ยังไม่มีคำขอคืนสินค้า</Text>}
        ListFooterComponent={
          history.length ? (
            <View style={{ marginTop: 18 }}>
              <Text style={styles.section}>รับคืนแล้ว</Text>
              {history.map((o) => (
                <View key={o.id} style={styles.card}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.product}>{o.productTitle}</Text>
                    <Text style={styles.meta}>
                      {o.customerName} · {formatTHB(o.amount)}
                    </Text>
                  </View>
                  <Text style={styles.done}>คืนแล้ว</Text>
                </View>
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.product}>{item.productTitle}</Text>
              <Text style={styles.meta}>
                {item.customerName} · {item.qty} ชิ้น · {item.placedAt}
              </Text>
              <Text style={styles.amount}>{formatTHB(item.amount)}</Text>
            </View>
            <Pressable style={styles.action} onPress={() => accept(item.id, item.productTitle)}>
              <Text style={styles.actionText}>รับคืน</Text>
            </Pressable>
          </View>
        )}
      />
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
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    marginBottom: 10,
  },
  empty: { color: colors.text.muted, fontWeight: '600', marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  product: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  meta: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  amount: { marginTop: 6, fontSize: 15, fontWeight: '800', color: colors.text.primary },
  action: {
    backgroundColor: colors.brand.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  done: { fontSize: 12, fontWeight: '800', color: colors.text.muted },
});
