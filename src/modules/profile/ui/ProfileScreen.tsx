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
import { normalizeAuthorHandle } from '@/modules/feed/domain/selectFeedByAuthor';
import { buildOwnerFeedItems } from '@/modules/profile/data/buildOwnerFeedItems';
import type { FeedItem } from '@/modules/feed/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { promptText } from '@/shared/components/AppPrompt';
import { ContentGrid } from './ContentGrid';
import { MyOrdersHub } from './MyOrdersHub';
import { SellerHomePanel } from '@/modules/store/ui/SellerHomePanel';
import { useOrdersStore } from '@/modules/store/state/orders-store';
import { countAwaitingShipment } from '@/modules/store/domain/seller-ops';
import { confirmDeleteAccount } from '@/modules/account/services/deleteAccountFlow';
import { openLegalDocument } from '@/shared/legal/openLegal';

function openOwnerFeed(handle: string, item: FeedItem) {
  router.push({
    pathname: '/profile-feed',
    params: {
      handle: normalizeAuthorHandle(handle),
      startId: item.id,
    },
  });
}

type ProfileTab = 'videos' | 'orders' | 'saved' | 'liked' | 'store';

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const TABS: Array<{ key: ProfileTab; icon: keyof typeof Ionicons.glyphMap }> = [
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
  const [tab, setTab] = useState<ProfileTab>('videos');

  const myHandle = normalizeAuthorHandle(profile.handle);
  const myContent = useMemo(
    () =>
      buildOwnerFeedItems(myHandle, items, {
        isSelf: true,
        displayName: profile.displayName,
      }),
    [items, myHandle, profile.displayName],
  );
  const likedItems = useMemo(() => items.filter((i) => i.liked), [items]);
  const savedItems = useMemo(() => items.filter((i) => i.saved), [items]);
  const productsCount = useMemo(
    () => myContent.filter((i) => (i.product?.basePrice ?? 0) > 0).length || 84,
    [myContent],
  );

  const incomingOrders = useOrdersStore((s) => s.incomingOrders);
  const pendingShipCount = useMemo(
    () => countAwaitingShipment(incomingOrders),
    [incomingOrders],
  );

  const handleTabPress = (key: ProfileTab) => {
    void Haptics.selectionAsync();
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
    void promptText({
      title: 'แก้ไขชื่อที่ใช้แสดง',
      defaultValue: profile.displayName,
    }).then((text) => {
      const trimmed = text?.trim();
      if (trimmed) updateProfile({ displayName: trimmed });
    });
  };

  const editBio = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void promptText({
      title: 'แก้ไขคำบรรยายโปรไฟล์',
      defaultValue: profile.bio,
    }).then((text) => updateProfile({ bio: (text ?? '').trim() }));
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
              onPress={() => router.push('/settings')}
              accessibilityLabel="ตั้งค่าบัญชี"
            >
              <Ionicons name="settings-outline" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>
      </Pressable>

      {/* Centered identity — same pattern as reference / Creator profile */}
      <View style={styles.identityBlock}>
        <Pressable onLongPress={editAvatar} delayLongPress={350}>
          <Avatar
            uri={profile.avatarUri}
            initial={profile.displayName.slice(0, 1)}
            size={88}
            radius={44}
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
        <Text style={styles.displayName} numberOfLines={1} onLongPress={editDisplayName}>
          {profile.displayName}
        </Text>
        <Text style={styles.handleCentered} numberOfLines={1} onLongPress={copyHandle}>
          {profile.handle}
        </Text>
      </View>

      {/* 4-column stats: Following | Followers | Community | Products */}
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(profile.followingCount)}</Text>
          <Text style={styles.statLabel}>กำลังติดตาม</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(profile.followersCount)}</Text>
          <Text style={styles.statLabel}>ผู้ติดตาม</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(profile.followingCount + profile.followersCount)}</Text>
          <Text style={styles.statLabel}>ชุมชน</Text>
        </View>
        <Pressable style={styles.statCell} onPress={() => handleTabPress('store')}>
          <Text style={styles.statValue}>{formatCompact(productsCount)}</Text>
          <Text style={styles.statLabel}>สินค้า</Text>
        </Pressable>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => Alert.alert('แก้ไขโปรไฟล์', 'กดค้างที่ชื่อ / รูป / คำบรรยาย เพื่อแก้ไข')}
        >
          <Text style={styles.secondaryBtnText}>แก้ไขโปรไฟล์</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.push('/settings')}>
          <Text style={styles.secondaryBtnText}>ตั้งค่า</Text>
        </Pressable>
        <Pressable
          style={styles.moreBtn}
          onPress={() =>
            Alert.alert(profile.displayName, undefined, [
              { text: 'แชร์โปรไฟล์', onPress: () => Alert.alert('แชร์แล้ว', profile.handle) },
              {
                text: 'ความปลอดภัย / Moderation',
                onPress: () => router.push('/settings/moderation'),
              },
              { text: 'ตั้งค่าบัญชี', onPress: () => router.push('/settings') },
              { text: 'ศูนย์กิจกรรมผู้ใช้', onPress: () => router.push('/settings/activity') },
              {
                text: 'นโยบายความเป็นส่วนตัว',
                onPress: () => void openLegalDocument('privacy'),
              },
              {
                text: 'ข้อกำหนดการใช้บริการ',
                onPress: () => void openLegalDocument('terms'),
              },
              {
                text: 'ลบบัญชีและข้อมูลทั้งหมด',
                style: 'destructive',
                onPress: confirmDeleteAccount,
              },
              { text: 'ปิด', style: 'cancel' },
            ])
          }
        >
          <Ionicons name="chevron-down" size={16} color={colors.text.primary} />
        </Pressable>
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
              <View>
                <Ionicons
                  name={t.icon}
                  size={22}
                  color={active ? colors.text.primary : colors.text.muted}
                />
                {t.key === 'store' && pendingShipCount > 0 ? (
                  <View style={styles.tabBadge}>
                    <Text style={styles.tabBadgeText}>{pendingShipCount}</Text>
                  </View>
                ) : null}
              </View>
              {active ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'videos' ? (
        <ContentGrid
          mode="content"
          items={myContent}
          pinnedCount={3}
          emptyIcon="videocam-outline"
          emptyText="ยังไม่มีคลิปวิดีโอ — โพสต์จาก Creator Studio จะโชว์ตรงนี้"
          onPressItem={(item) => openOwnerFeed(myHandle, item)}
        />
      ) : null}

      {tab === 'orders' ? <MyOrdersHub /> : null}

      {tab === 'store' ? <SellerHomePanel /> : null}

      {tab === 'saved' ? (
        <ContentGrid
          mode="content"
          items={savedItems}
          emptyIcon="bookmark-outline"
          emptyText="แตะปุ่มบันทึกในคลิปที่อยากดูทีหลัง แล้วคอนเทนต์จะมาโชว์ตรงนี้"
          onPressItem={(item) =>
            openOwnerFeed(normalizeAuthorHandle(item.authorHandle), item)
          }
        />
      ) : null}

      {tab === 'liked' ? (
        <ContentGrid
          mode="content"
          items={likedItems}
          emptyIcon="heart-outline"
          emptyText="กดหัวใจคลิปที่ชอบแล้วจะมาโชว์ตรงนี้"
          onPressItem={(item) =>
            openOwnerFeed(normalizeAuthorHandle(item.authorHandle), item)
          }
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  coverBanner: {
    width: '100%',
    height: 140,
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
  identityBlock: {
    alignItems: 'center',
    marginTop: -44,
    paddingHorizontal: 16,
  },
  avatarText: {
    fontSize: 36,
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
  displayName: {
    marginTop: 10,
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  handleCentered: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingHorizontal: 8,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  secondaryBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(10,22,17,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontWeight: '800',
    fontSize: 14,
    color: colors.text.primary,
  },
  walletBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moreBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(10,22,17,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  bio: {
    textAlign: 'center',
    color: colors.text.primary,
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  bioPlaceholder: {
    color: colors.text.muted,
    fontStyle: 'italic',
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
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent.live,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
});
