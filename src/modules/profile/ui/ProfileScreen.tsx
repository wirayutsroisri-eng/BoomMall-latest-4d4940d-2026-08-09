import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { ORDER_STATUS_LABEL, type MyOrder, type OrderStatus } from '@/modules/store/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { ContentGrid } from './ContentGrid';

type ProfileTab = 'videos' | 'orders' | 'saved' | 'liked';
type NavTab = ProfileTab | 'store';

const GRID_PADDING = 16;

function formatCompact(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function orderStatusColor(status: OrderStatus) {
  switch (status) {
    case 'pending':
      return colors.accent.warning;
    case 'paid':
    case 'shipped':
      return colors.accent.info;
    case 'delivered':
      return colors.brand.primaryDark;
    case 'cancelled':
      return colors.text.muted;
    default:
      return colors.text.muted;
  }
}

const TABS: Array<{ key: NavTab; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'videos', icon: 'grid-outline' },
  { key: 'orders', icon: 'bag-handle-outline' },
  { key: 'store', icon: 'storefront-outline' },
  { key: 'saved', icon: 'bookmark-outline' },
  { key: 'liked', icon: 'heart-outline' },
];

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const profile = useLoyaltyStore((s) => s.profile);
  const updateProfile = useLoyaltyStore((s) => s.updateProfile);
  const items = useFeedStore((s) => s.items);
  const myOrders = useOrdersStore((s) => s.myOrders);
  const [tab, setTab] = useState<ProfileTab>('videos');

  const likedItems = useMemo(() => items.filter((i) => i.liked), [items]);
  const savedItems = useMemo(() => items.filter((i) => i.saved), [items]);

  const handleTabPress = (key: NavTab) => {
    void Haptics.selectionAsync();
    if (key === 'store') {
      router.push('/store/dashboard');
      return;
    }
    setTab(key);
  };

  const editCover = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์เข้าถึงคลังภาพ', 'กรุณาอนุญาตให้ BoomMall เข้าถึงรูปภาพในเครื่อง');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateProfile({ coverUri: result.assets[0].uri });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const editAvatar = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('ต้องการสิทธิ์เข้าถึงคลังภาพ', 'กรุณาอนุญาตให้ BoomMall เข้าถึงรูปภาพในเครื่อง');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updateProfile({ avatarUri: result.assets[0].uri });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const editDisplayName = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.prompt(
      'แก้ไขชื่อที่ใช้แสดง',
      undefined,
      (text) => {
        const trimmed = text?.trim();
        if (trimmed) updateProfile({ displayName: trimmed });
      },
      'plain-text',
      profile.displayName,
    );
  };

  const editBio = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.prompt(
      'แก้ไขคำบรรยายโปรไฟล์',
      undefined,
      (text) => updateProfile({ bio: (text ?? '').trim() }),
      'plain-text',
      profile.bio,
    );
  };

  const copyHandle = async () => {
    await Clipboard.setStringAsync(profile.handle);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('คัดลอกแล้ว', `คัดลอก ${profile.handle} ไปยังคลิปบอร์ดแล้ว`);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onLongPress={editCover} delayLongPress={350}>
        <View style={styles.coverBanner}>
          {profile.coverUri ? (
            <Image source={{ uri: profile.coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[colors.brand.forest, colors.brand.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={[styles.coverHeaderIcons, { top: insets.top + 8 }]}>
            <Pressable
              hitSlop={8}
              style={styles.coverIconBtn}
              onPress={() => Alert.alert('เพิ่มเพื่อน', 'ค้นหาและเพิ่มเพื่อน')}
            >
              <Ionicons name="person-add-outline" size={18} color="#fff" />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={styles.coverIconBtn}
              onPress={() => Alert.alert('เมนู', 'ตั้งค่า / ความเป็นส่วนตัว')}
            >
              <Ionicons name="menu-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Pressable>

      <View style={styles.pageInfoRow}>
        <Pressable style={styles.avatarWrap} onLongPress={editAvatar} delayLongPress={350}>
          <Avatar
            uri={profile.avatarUri}
            initial={profile.displayName.slice(0, 1)}
            size={84}
            radius={20}
            borderWidth={3}
            borderColor={colors.surface.canvas}
            textStyle={styles.avatarText}
          />
          {profile.shopVerified ? (
            <View style={styles.verifiedDot}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.pageInfoBody}>
          <Text style={styles.shopName} numberOfLines={1} onLongPress={editDisplayName}>
            {profile.displayName}
          </Text>
          <Text style={styles.statsLine} numberOfLines={1}>
            <Text style={styles.statsLineStrong}>{formatCompact(profile.followersCount)}</Text> ผู้ติดตาม
            {'  •  '}
            <Text style={styles.statsLineStrong}>{formatCompact(profile.followingCount)}</Text> กำลังติดตาม
          </Text>
        </View>
      </View>

      <View style={styles.handleRow}>
        <Text style={styles.handleText} onLongPress={copyHandle}>
          {profile.handle}
        </Text>
        <View style={styles.vipPill}>
          <Text style={styles.vipText}>{profile.loyaltyTier}</Text>
        </View>
      </View>
      <Text style={styles.categoryText}>{profile.technicianBadge}</Text>

      <Text
        style={[styles.bio, !profile.bio && styles.bioPlaceholder]}
        onLongPress={editBio}
      >
        {profile.bio || 'กดค้างเพื่อเพิ่มคำบรรยายโปรไฟล์'}
      </Text>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} style={styles.tabItem} onPress={() => handleTabPress(t.key)}>
              <Ionicons
                name={t.icon}
                size={22}
                color={active ? colors.text.primary : colors.text.muted}
              />
              {active ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'videos' ? (
        <ContentGrid
          mode="content"
          items={items}
          emptyIcon="videocam-outline"
          emptyText="ยังไม่มีคลิปวิดีโอ"
          onPressItem={() => router.push('/(tabs)')}
        />
      ) : null}

      {tab === 'orders' ? <OrdersList orders={myOrders} /> : null}

      {tab === 'saved' ? (
        <ContentGrid
          mode="content"
          items={savedItems}
          emptyIcon="bookmark-outline"
          emptyText="แตะปุ่มบันทึกในคลิปที่อยากดูทีหลัง แล้วคอนเทนต์จะมาโชว์ตรงนี้"
          onPressItem={() => router.push('/(tabs)')}
        />
      ) : null}

      {tab === 'liked' ? (
        <ContentGrid
          mode="content"
          items={likedItems}
          emptyIcon="heart-outline"
          emptyText="กดหัวใจคลิปที่ชอบแล้วจะมาโชว์ตรงนี้"
          onPressItem={() => router.push('/(tabs)')}
        />
      ) : null}
    </ScrollView>
  );
}

function OrdersList({ orders }: { orders: MyOrder[] }) {
  if (orders.length === 0) {
    return (
      <View style={styles.gridEmpty}>
        <Ionicons name="bag-handle-outline" size={40} color={colors.text.muted} />
        <Text style={styles.gridEmptyText}>ยังไม่มีคำสั่งซื้อ</Text>
      </View>
    );
  }
  return (
    <View style={styles.ordersList}>
      {orders.map((order) => (
        <View key={order.id} style={styles.orderCard}>
          <View style={[styles.orderThumb, { backgroundColor: order.thumbnailColor }]} />
          <View style={styles.orderBody}>
            <Text style={styles.orderTitle} numberOfLines={1}>{order.productTitle}</Text>
            <Text style={styles.orderVariant} numberOfLines={1}>{order.variantLabel}</Text>
            <Text style={styles.orderMeta}>
              {order.shopName} · {order.qty} ชิ้น · ฿{order.amount.toLocaleString('th-TH')}
            </Text>
            {order.trackingNo ? (
              <Text style={styles.orderTracking}>เลขพัสดุ {order.trackingNo}</Text>
            ) : null}
          </View>
          <View style={styles.orderStatusCol}>
            <View
              style={[
                styles.orderStatusPill,
                { backgroundColor: `${orderStatusColor(order.status)}22` },
              ]}
            >
              <Text style={[styles.orderStatusText, { color: orderStatusColor(order.status) }]}>
                {ORDER_STATUS_LABEL[order.status]}
              </Text>
            </View>
            <Text style={styles.orderDate}>{order.placedAt}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  coverBanner: {
    width: '100%',
    height: 152,
    backgroundColor: colors.brand.forest,
    overflow: 'hidden',
  },
  coverHeaderIcons: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    gap: 10,
  },
  coverIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  avatarWrap: {
    marginTop: -40,
  },
  avatarText: {
    fontSize: 34,
  },
  verifiedDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface.canvas,
  },
  pageInfoBody: {
    flex: 1,
    marginLeft: 12,
    paddingBottom: 6,
  },
  shopName: {
    fontSize: 19,
    fontWeight: '900',
    color: colors.text.primary,
  },
  statsLine: {
    fontSize: 12.5,
    color: colors.text.secondary,
    marginTop: 4,
  },
  statsLineStrong: {
    fontWeight: '800',
    color: colors.text.primary,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  handleText: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  categoryText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  bio: {
    textAlign: 'left',
    color: colors.text.primary,
    fontSize: 13,
    marginTop: 8,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  bioPlaceholder: {
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  vipPill: {
    backgroundColor: colors.brand.ink,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  vipText: {
    color: colors.accent.vault,
    fontWeight: '900',
    fontSize: 11,
  },
  tabBar: {
    flexDirection: 'row',
    marginTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 32,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.text.primary,
  },
  gridEmpty: {
    alignItems: 'center',
    paddingVertical: 50,
    gap: 10,
  },
  gridEmptyText: {
    color: colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  ordersList: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 4,
    gap: 10,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 12,
  },
  orderThumb: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },
  orderBody: { flex: 1 },
  orderTitle: {
    color: colors.text.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  orderVariant: {
    color: colors.text.secondary,
    fontSize: 11,
    marginTop: 2,
  },
  orderMeta: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: 3,
  },
  orderTracking: {
    color: colors.brand.primaryDark,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  orderStatusCol: {
    alignItems: 'flex-end',
    gap: 6,
  },
  orderStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  orderStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  orderDate: {
    color: colors.text.muted,
    fontSize: 10,
  },
});
