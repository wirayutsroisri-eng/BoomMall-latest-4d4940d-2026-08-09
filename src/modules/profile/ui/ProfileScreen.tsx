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
import { useBoomWalletStore } from '@/modules/wallet/state/boom-wallet-store';
import { BoomWalletProfileButton } from '@/modules/wallet/ui/BoomWalletProfileButton';
import { BoomCoinRewardPopup } from '@/modules/wallet/ui/BoomCoinRewardPopup';
import { BoomCoinAmountView } from '@/modules/wallet/ui/BoomCoinAmountView';
import { normalizeAuthorHandle } from '@/modules/feed/domain/selectFeedByAuthor';
import { buildOwnerFeedItems } from '@/modules/profile/data/buildOwnerFeedItems';
import type { FeedItem } from '@/modules/feed/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { ENABLE_BOOM_WALLET_UI, ENABLE_FEED_COIN_REACTION } from '@/shared/compliance/appStoreGates';
import { ContentGrid } from './ContentGrid';
import { MyOrdersHub } from './MyOrdersHub';

function openOwnerFeed(handle: string, item: FeedItem) {
  router.push({
    pathname: '/profile-feed',
    params: {
      handle: normalizeAuthorHandle(handle),
      startId: item.id,
    },
  });
}

type ProfileTab = 'videos' | 'orders' | 'saved' | 'liked';
type NavTab = ProfileTab | 'store';

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
  const lifetimeCoins = useBoomWalletStore((s) => s.lifetimeCoinsReceived);
  const available = useBoomWalletStore((s) => s.available);
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
  /** ได้รับ Coin = ยอดทิปสะสมบนคลิปของเรา (ขึ้นเมื่อมีคนกดเหรียญ) */
  const coinsReceived = useMemo(
    () => myContent.reduce((sum, item) => sum + (item.tips ?? 0), 0),
    [myContent],
  );
  const likedItems = useMemo(() => items.filter((i) => i.liked), [items]);
  const savedItems = useMemo(() => items.filter((i) => i.saved), [items]);
  const productsCount = useMemo(
    () => myContent.filter((i) => (i.product?.basePrice ?? 0) > 0).length || 84,
    [myContent],
  );

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

  const onLifetimePress = () => {
    void Haptics.selectionAsync();
    if (!ENABLE_BOOM_WALLET_UI) {
      Alert.alert(
        'ได้รับเหรียญ',
        `สะสมบนคลิป ${coinsReceived.toLocaleString('en-US')} ครั้ง\n\nเป็นตัวนับบนฟีดเท่านั้น — ไม่มีมูลค่าเงิน`,
      );
      return;
    }
    Alert.alert(
      'ได้รับ Coin',
      `สะสมบนคลิป ${coinsReceived.toLocaleString('en-US')} Coin\nLedger lifetime ${lifetimeCoins.toLocaleString('en-US')}\n\nขึ้นเมื่อมีคนกดเหรียญสนับสนุน (แทนหัวใจ)\nไม่ใช่ยอดใน Wallet — ยอดใช้จ่ายจริงอยู่ที่ปุ่ม Wallet`,
      [
        { text: 'ปิด', style: 'cancel' },
        { text: 'เปิด Wallet', onPress: () => router.push('/wallet') },
      ],
    );
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
              onPress={() => router.push('/wallet/security')}
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

      {/* 4-column stats: Following | Followers | Coins | Products */}
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(profile.followingCount)}</Text>
          <Text style={styles.statLabel}>กำลังติดตาม</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(profile.followersCount)}</Text>
          <Text style={styles.statLabel}>ผู้ติดตาม</Text>
        </View>
        {ENABLE_BOOM_WALLET_UI || ENABLE_FEED_COIN_REACTION ? (
          <View style={styles.statCell}>
            <BoomCoinAmountView
              amount={coinsReceived}
              variant="compact"
              label="ได้รับ Coin"
              iconSize={22}
              valueSize={17}
              animate
              onPress={onLifetimePress}
              valueStyle={styles.statValue}
              labelStyle={styles.statLabel}
            />
          </View>
        ) : (
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{formatCompact(profile.followingCount + profile.followersCount)}</Text>
            <Text style={styles.statLabel}>ชุมชน</Text>
          </View>
        )}
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(productsCount)}</Text>
          <Text style={styles.statLabel}>สินค้า</Text>
        </View>
      </View>

      {/* Owner actions — Edit (+ Wallet when enabled) */}
      <View style={styles.actionRow}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => Alert.alert('แก้ไขโปรไฟล์', 'กดค้างที่ชื่อ / รูป / คำบรรยาย เพื่อแก้ไข')}
        >
          <Text style={styles.secondaryBtnText}>แก้ไขโปรไฟล์</Text>
        </Pressable>
        {ENABLE_BOOM_WALLET_UI ? (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              void Haptics.selectionAsync();
              router.push('/wallet');
            }}
          >
            <BoomCoinAmountView
              amount={available}
              variant="balance"
              iconSize={18}
              valueSize={14}
              animate
              style={styles.walletBtnInner}
              valueStyle={styles.secondaryBtnText}
            />
          </Pressable>
        ) : null}
        <Pressable
          style={styles.moreBtn}
          onPress={() =>
            Alert.alert(profile.displayName, undefined, [
              { text: 'แชร์โปรไฟล์', onPress: () => Alert.alert('แชร์แล้ว', profile.handle) },
              {
                text: 'ความปลอดภัย / Moderation',
                onPress: () => router.push('/settings/moderation'),
              },
              { text: 'ตั้งค่าบัญชี', onPress: () => router.push('/wallet/security') },
              {
                text: 'นโยบายความเป็นส่วนตัว',
                onPress: () => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } }),
              },
              {
                text: 'ข้อกำหนดการใช้บริการ',
                onPress: () => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } }),
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

      {ENABLE_BOOM_WALLET_UI ? (
        <>
          <BoomWalletProfileButton />
          <BoomCoinRewardPopup />
        </>
      ) : null}

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
          items={myContent}
          pinnedCount={3}
          emptyIcon="videocam-outline"
          emptyText="ยังไม่มีคลิปวิดีโอ — โพสต์จาก Creator Studio จะโชว์ตรงนี้"
          onPressItem={(item) => openOwnerFeed(myHandle, item)}
        />
      ) : null}

      {tab === 'orders' ? <MyOrdersHub /> : null}

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
});
