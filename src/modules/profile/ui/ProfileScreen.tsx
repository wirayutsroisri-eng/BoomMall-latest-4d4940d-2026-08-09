import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useAvatarPhotoStore, type ProfilePhotoKind } from '@/modules/profile/state/avatar-photo-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { normalizeAuthorHandle } from '@/modules/feed/domain/selectFeedByAuthor';
import { isLiveUgcFeedItem } from '@/modules/feed/domain/isLiveUgcFeedItem';
import { buildOwnerFeedItems } from '@/modules/profile/data/buildOwnerFeedItems';
import type { FeedItem } from '@/modules/feed/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
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

/** Hold until count 1-2-3, then peek while the finger is still down. */
const PHOTO_HOLD_MS = 1200;

function holdToPeekPhoto(onPeek: () => void) {
  return Gesture.LongPress()
    .minDuration(PHOTO_HOLD_MS)
    .maxDistance(18)
    .onStart(() => {
      runOnJS(onPeek)();
    });
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const profile = useLoyaltyStore((s) => s.profile);
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
  const likedItems = useMemo(
    () => items.filter((i) => i.liked && isLiveUgcFeedItem(i)),
    [items],
  );
  const savedItems = useMemo(
    () => items.filter((i) => i.saved && isLiveUgcFeedItem(i)),
    [items],
  );
  const followingMap = useFollowStore((s) => s.following);
  const followingCount = Object.keys(followingMap).length;
  const likesCount = useMemo(
    () => myContent.reduce((sum, item) => sum + (item.likes || 0), 0),
    [myContent],
  );
  const [copiedId, setCopiedId] = useState(false);

  const incomingOrders = useOrdersStore((s) => s.incomingOrders);
  const pendingShipCount = useMemo(
    () => countAwaitingShipment(incomingOrders),
    [incomingOrders],
  );

  const handleTabPress = (key: ProfileTab) => {
    void Haptics.selectionAsync();
    setTab(key);
  };

  const openPhotoPreview = useCallback((kind: ProfilePhotoKind) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useAvatarPhotoStore.getState().openPreview(kind);
  }, []);

  const coverGesture = useMemo(
    () => holdToPeekPhoto(() => openPhotoPreview('cover')),
    [openPhotoPreview],
  );

  const avatarGesture = useMemo(
    () => holdToPeekPhoto(() => openPhotoPreview('avatar')),
    [openPhotoPreview],
  );

  const openEditProfile = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/profile/edit');
  };

  const openEditBio = () => {
    void Haptics.selectionAsync();
    router.push({ pathname: '/profile/edit-field', params: { field: 'bio' } });
  };

  const copyHandle = async () => {
    await Clipboard.setStringAsync(profile.handle);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1600);
  };

  const profileId = profile.handle.replace(/^@/, '');

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: 120 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View>
        <GestureDetector gesture={coverGesture}>
          <View
            style={styles.coverBanner}
            collapsable={false}
            accessibilityRole="image"
            accessibilityLabel="รูปปก"
            accessibilityHint="กดค้างเพื่อนับ 1 2 3 ดูรูป แล้วค่อยเลือกเปลี่ยนรูปภาพ"
          >
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
          </View>
        </GestureDetector>
        <View style={[styles.coverHeaderIcons, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            hitSlop={8}
            style={styles.coverIconBtn}
            onPress={() => router.push('/search')}
            accessibilityLabel="ค้นหา"
          >
            <Ionicons name="search" size={18} color="#fff" />
          </Pressable>
          <Pressable
            hitSlop={8}
            style={styles.coverIconBtn}
            onPress={() =>
              Alert.alert(profile.displayName, undefined, [
                { text: 'แชร์โปรไฟล์', onPress: () => Alert.alert('แชร์แล้ว', profile.handle) },
                {
                  text: 'ความปลอดภัย / Moderation',
                  onPress: () => router.push('/settings/moderation'),
                },
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
            accessibilityLabel="เพิ่มเติม"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
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

      {/* Avatar ซ้าย + สถิติขวา — ไม่มีช่องชุมชน */}
      <View style={styles.identityRow}>
        <GestureDetector gesture={avatarGesture}>
          <View
            style={styles.avatarHit}
            collapsable={false}
            accessibilityRole="image"
            accessibilityLabel="รูปโปรไฟล์"
            accessibilityHint="กดค้างเพื่อนับ 1 2 3 ดูรูป แล้วค่อยเลือกเปลี่ยนรูปภาพ"
          >
            <Avatar
              uri={profile.avatarUri}
              initial={profile.displayName.slice(0, 1)}
              size={108}
              radius={54}
              borderWidth={3}
              borderColor="#fff"
              textStyle={styles.avatarText}
            />
            {profile.shopVerified ? (
              <View style={styles.verifiedDot}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            ) : null}
          </View>
        </GestureDetector>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{formatCompact(profile.followersCount)}</Text>
            <Text style={styles.statLabel}>ผู้ติดตาม</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{formatCompact(followingCount)}</Text>
            <Text style={styles.statLabel}>กำลังติดตาม</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{formatCompact(likesCount)}</Text>
            <Text style={styles.statLabel}>ถูกใจ</Text>
          </View>
        </View>
      </View>

      <View style={styles.infoBlock}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {profile.displayName}
          </Text>
          <Pressable
            style={styles.pencilBtn}
            onPress={openEditProfile}
            hitSlop={8}
            accessibilityLabel="แก้ไขโปรไฟล์"
          >
            <Ionicons name="pencil" size={13} color={colors.text.secondary} />
          </Pressable>
        </View>
        <View style={styles.idRow}>
          <Text style={styles.idText} numberOfLines={1}>
            @{profileId}
          </Text>
          <Pressable
            onPress={() => void copyHandle()}
            hitSlop={10}
            accessibilityLabel="คัดลอกไอดี"
          >
            <Ionicons
              name={copiedId ? 'checkmark' : 'copy-outline'}
              size={13}
              color={copiedId ? colors.brand.primaryDark : colors.text.muted}
            />
          </Pressable>
        </View>
        {profile.bio.trim() ? (
          <Pressable onPress={openEditBio} accessibilityLabel="แก้ไขประวัติ">
            <Text style={styles.bioText} numberOfLines={3}>
              {profile.bio}
            </Text>
          </Pressable>
        ) : (
          <Pressable onPress={openEditBio} style={styles.addBioBtn} accessibilityLabel="เพิ่มประวัติ">
            <Text style={styles.addBioText}>+ เพิ่มประวัติ</Text>
          </Pressable>
        )}
        {profile.technicianBadge ? (
          <Text style={styles.categoryText}>{profile.technicianBadge}</Text>
        ) : null}
      </View>

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
          pinnedCount={0}
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
    backgroundColor: '#fff',
  },
  coverBanner: {
    width: '100%',
    height: 176,
    backgroundColor: colors.brand.forest,
    overflow: 'hidden',
  },
  coverHeaderIcons: {
    position: 'absolute',
    right: 12,
    zIndex: 2,
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: -52,
    paddingHorizontal: 16,
    gap: 18,
    zIndex: 8,
    elevation: 8,
  },
  avatarHit: {
    width: 108,
    height: 108,
  },
  avatarText: {
    fontSize: 42,
  },
  verifiedDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.brand.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 10,
    paddingLeft: 2,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: '400',
  },
  infoBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  pencilBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EDEDED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  idText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '400',
    color: colors.text.muted,
  },
  bioText: {
    marginTop: 8,
    color: colors.text.primary,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  addBioBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  addBioText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  categoryText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '400',
    marginTop: 6,
  },
  tabBar: {
    flexDirection: 'row',
    marginTop: 14,
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
