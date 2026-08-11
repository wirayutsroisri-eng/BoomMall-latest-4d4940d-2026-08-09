import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  useBottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { useFollowStore } from '@/modules/social/state/follow-store';
import { normalizeAuthorHandle } from '@/modules/feed/domain/selectFeedByAuthor';
import { buildCreatorPortfolio } from '@/modules/profile/data/mockCreatorPortfolio';
import type { FeedItem } from '@/modules/feed/domain/types';
import { Avatar } from '@/shared/components/Avatar';
import { BoomCoinAmountView } from '@/modules/wallet/ui/BoomCoinAmountView';
import { ReportBlockSheet } from '@/modules/safety/ui/ReportBlockSheet';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { colors } from '@/shared/theme/colors';
import { ContentGrid } from './ContentGrid';

function openOwnerFeed(handle: string, item: FeedItem) {
  router.push({
    pathname: '/profile-feed',
    params: {
      handle: normalizeAuthorHandle(handle),
      startId: item.id,
    },
  });
}

type Props = {
  /** null while no Visitor Profile is being shown — sheet content simply renders empty. */
  handle: string | null;
  /** Feed item id that opened this Visitor Profile — used to auto-attach a Content Reference Card */
  feedId?: string | null;
  onDismiss?: () => void;
};

/**
 * Same 4 icons as the owner's My Profile tab bar, reinterpreted for a public/visitor
 * context: `orders` shows this shop's products for sale, `store` shows their posted
 * clips/portfolio, `vault` shows public verification info (never private data), and
 * `liked` stays private to the account owner.
 */
type VisitorTab = 'store' | 'orders' | 'vault' | 'liked';

function formatCompact(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Deterministic pseudo social-stats from the handle, so numbers stay stable across renders. */
function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const TABS: Array<{ key: VisitorTab; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'store', icon: 'grid-outline' },
  { key: 'orders', icon: 'bag-handle-outline' },
  { key: 'vault', icon: 'lock-closed-outline' },
  { key: 'liked', icon: 'heart-outline' },
];

/**
 * Visitor Profile — reached by swiping left (edge-swipe) from the Home Feed, or tapping a
 * creator's avatar/username. Rendered as a real @gorhom/bottom-sheet `BottomSheetModal` with
 * two snap points so it behaves exactly like a native thumb-driven sheet:
 *   • 66% (Preview)  — drag up  → expands to 100% (Full Screen)
 *   • 100% (Full)    — drag down → collapses back to 66% Preview
 *   • 66% (Preview)  — drag down again → dismiss entirely, back to Home Feed
 * TikTok visitor-profile action row: [Follow|#FE2C55] [Message|gray] [▼] — shared follow
 * graph with the feed avatar “+” badge.
 */
export const CreatorProfileSheet = forwardRef<BottomSheetModal, Props>(
  function CreatorProfileSheet({ handle, feedId, onDismiss }, ref) {
    const insets = useSafeAreaInsets();
    const snapPoints = useMemo(() => ['66%', '100%'], []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.55} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        index={0}
        topInset={insets.top}
        enablePanDownToClose
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleIndicator}
        onDismiss={onDismiss}
      >
        {handle ? <CreatorProfileSheetBody handle={handle} feedId={feedId ?? undefined} /> : <View />}
      </BottomSheetModal>
    );
  },
);

function CreatorProfileSheetBody({ handle, feedId }: { handle: string; feedId?: string }) {
  const { dismiss } = useBottomSheetModal();
  return (
    <CreatorProfileBody
      handle={handle}
      feedId={feedId}
      onClose={() => dismiss()}
      mode="sheet"
    />
  );
}

/** โปรไฟล์เต็มจอ — ใช้กับปัดซ้าย/ขวาแบบ TikTok จากฟีด */
export function CreatorProfilePage({
  handle,
  feedId,
  onClose,
}: {
  handle: string;
  feedId?: string;
  onClose: () => void;
}) {
  return (
    <View style={styles.pageRoot}>
      <CreatorProfileBody handle={handle} feedId={feedId} onClose={onClose} mode="page" />
    </View>
  );
}

function CreatorProfileBody({
  handle,
  feedId,
  onClose,
  mode,
}: {
  handle: string;
  feedId?: string;
  onClose: () => void;
  mode: 'sheet' | 'page';
}) {
  const close = onClose;
  const items = useFeedStore((s) => s.items);
  const startConversationWithCreator = useChatStore((s) => s.startConversationWithCreator);
  const followKey = handle.replace(/^@/, '').toLowerCase();
  const following = useFollowStore((s) => Boolean(s.following[followKey]));
  const follow = useFollowStore((s) => s.follow);
  const unfollow = useFollowStore((s) => s.unfollow);
  const blockUser = useModerationStore((s) => s.blockUser);
  const [tab, setTab] = useState<VisitorTab>('store');
  const [reportOpen, setReportOpen] = useState(false);

  const ownerKey = normalizeAuthorHandle(handle ?? '');
  const realCreatorItems = useMemo(
    () => items.filter((i) => normalizeAuthorHandle(i.authorHandle) === ownerKey),
    [items, ownerKey],
  );

  /** Prefer the exact clip the user swiped/tapped from; fall back to first creator post */
  const contextItem = useMemo(() => {
    if (feedId) {
      const match = items.find((i) => i.id === feedId);
      if (match) return match;
    }
    return realCreatorItems[0];
  }, [realCreatorItems, feedId, items]);

  const first = realCreatorItems[0];
  const displayName = contextItem?.author ?? first?.author ?? handle;
  const displayHandle = `@${handle}`;
  const shopName = contextItem?.product.shopName ?? first?.product.shopName ?? displayName;
  const tier = contextItem?.product.tier ?? first?.product.tier ?? 'B2C';
  const categoryTags = contextItem?.product.tags ?? first?.product.tags ?? [];
  const categoryText = categoryTags.length > 0 ? categoryTags.join(' · ') : `${tier} · ${shopName}`;
  const accent = contextItem?.gradient?.[0] ?? first?.gradient?.[0] ?? colors.brand.primary;

  /** กริดคลิป/โชว์รูม — โพสต์จริง + คอนเทนต์จำลองเติมให้ครบแบบโปรไฟล์ TikTok */
  const creatorItems = useMemo(
    () => buildCreatorPortfolio(handle, displayName, shopName, realCreatorItems),
    [handle, displayName, shopName, realCreatorItems],
  );

  const seed = useMemo(() => hashString(handle), [handle]);
  const followingCount = 20 + (seed % 300);
  const baseFollowers = 800 + (seed % 68000);
  /** TikTok: เลขผู้ติดตามขยับทันทีเมื่อกด Follow */
  const followersCount = baseFollowers + (following ? 1 : 0);
  /** ได้รับ Coin = ยอดทิปจริงจากคลิปของครีเอเตอร์ (ขึ้นเมื่อมีคนกดเหรียญ) */
  const coinsReceived = useMemo(
    () => realCreatorItems.reduce((sum, item) => sum + (item.tips ?? 0), 0),
    [realCreatorItems],
  );
  const productsCount = useMemo(
    () =>
      Math.max(
        12,
        creatorItems.filter((i) => (i.product?.basePrice ?? 0) > 0).length ||
          Math.floor(coinsReceived / 10_000) ||
          12,
      ),
    [creatorItems, coinsReceived],
  );
  const bioText =
    contextItem?.caption?.trim() ||
    `ร้าน/ช่างจาก ${shopName} พร้อมให้บริการลูกค้าทั่วจันทบุรีผ่าน BoomMall`;

  const messageCreator = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const contentRef = contextItem
      ? {
          id: `cref-${contextItem.id}`,
          feedId: contextItem.id,
          title: contextItem.product.name,
          subtitle: contextItem.caption,
          price: contextItem.product.basePrice,
          currency: 'THB' as const,
          tier: contextItem.product.tier,
          imageUri: contextItem.imageUri,
          gradient: contextItem.gradient,
          authorHandle: displayHandle,
        }
      : undefined;

    const conversationId = startConversationWithCreator(
      displayName,
      displayHandle,
      accent,
      contentRef,
    );

    // Collapse the Visitor Profile sheet, then jump straight into the OpenChat Hub DM.
    // `from=creator` keeps [< Back] wired to reopen this exact profile (+ feed context).
    const feedParam = feedId ?? contextItem?.id;
    close();
    requestAnimationFrame(() => {
      router.push({
        pathname: '/(tabs)/chat/[conversationId]' as const,
        params: {
          conversationId,
          from: 'creator',
          handle,
          ...(feedParam ? { feedId: feedParam } : {}),
        },
      });
    });
  };

  /** TikTok: ติดตามทันที / กำลังติดตาม → ยืนยันก่อนเลิกติดตาม */
  const onFollowPress = () => {
    if (!following) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      follow(handle);
      return;
    }
    Alert.alert(
      `เลิกติดตาม ${displayName}?`,
      'โพสต์ของบัญชีนี้จะไม่โชว์ในแท็บกำลังติดตามอีก',
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'เลิกติดตาม',
          style: 'destructive',
          onPress: () => {
            void Haptics.selectionAsync();
            unfollow(handle);
          },
        },
      ],
    );
  };

  const body = (
    <>
      <View style={styles.coverBanner}>
        <LinearGradient
          colors={contextItem?.gradient ?? first?.gradient ?? [accent, colors.brand.ink]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.coverHeaderIcons}>
          <Pressable hitSlop={10} onPress={() => close()} style={styles.coverIconBtn}>
            <Ionicons name="chevron-back" size={20} color="#fff" />
          </Pressable>
          {mode === 'sheet' ? (
            <Pressable hitSlop={10} onPress={() => close()} style={styles.coverIconBtn}>
              <Ionicons name="chevron-down" size={20} color="#fff" />
            </Pressable>
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>
      </View>

      <View style={styles.identityBlock}>
        <Avatar
          initial={displayName.slice(0, 1)}
          backgroundColor={accent}
          size={88}
          radius={44}
          borderWidth={3}
          borderColor={colors.surface.canvas}
          textStyle={styles.avatarText}
        />
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.handleCentered} numberOfLines={1}>
          {displayHandle}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(followingCount)}</Text>
          <Text style={styles.statLabel}>กำลังติดตาม</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(followersCount)}</Text>
          <Text style={styles.statLabel}>ผู้ติดตาม</Text>
        </View>
        <View style={styles.statCell}>
          <BoomCoinAmountView
            amount={coinsReceived}
            variant="compact"
            label="ได้รับ Coin"
            iconSize={22}
            valueSize={17}
            animate
            onPress={() =>
              Alert.alert(
                'ได้รับ Coin',
                'ยอดสะสมจากผู้สนับสนุนในคลิป — ขึ้นเมื่อมีคนกดเหรียญ (แทนหัวใจ) · ไม่ใช่ยอด Wallet ส่วนตัว',
              )
            }
            valueStyle={styles.statValue}
            labelStyle={styles.statLabel}
          />
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{formatCompact(productsCount)}</Text>
          <Text style={styles.statLabel}>สินค้า</Text>
        </View>
      </View>

      {/* TikTok: Follow (pink) | Message (gray) | ▼ — ความกว้างเท่ากัน + ปุ่มเหลี่ยม */}
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.followBtn, following && styles.followBtnFollowing]}
          onPress={onFollowPress}
        >
          <Text style={[styles.followBtnText, following && styles.followBtnTextFollowing]}>
            {following ? 'กำลังติดตาม' : 'ติดตาม'}
          </Text>
        </Pressable>
        <Pressable style={styles.messageBtn} onPress={messageCreator}>
          <Text style={styles.messageBtnText}>ข้อความ</Text>
        </Pressable>
        <Pressable
          style={styles.moreBtn}
          onPress={() =>
            Alert.alert(displayName, undefined, [
              {
                text: following ? 'เลิกติดตาม' : 'ติดตาม',
                style: following ? 'destructive' : 'default',
                onPress: onFollowPress,
              },
              { text: 'แชร์โปรไฟล์', onPress: () => Alert.alert('แชร์แล้ว', displayHandle) },
              {
                text: 'รายงาน',
                style: 'destructive',
                onPress: () => setReportOpen(true),
              },
              {
                text: 'บล็อก',
                style: 'destructive',
                onPress: () => {
                  blockUser(followKey);
                  Alert.alert('บล็อกแล้ว', `จะไม่แสดงคอนเทนต์จาก ${displayName}`);
                },
              },
              { text: 'ปิด', style: 'cancel' },
            ])
          }
        >
          <Ionicons name="chevron-down" size={16} color={colors.text.primary} />
        </Pressable>
      </View>

      <Text style={styles.categoryText} numberOfLines={1}>
        {categoryText} · {tier}
      </Text>
      <Text style={styles.bio}>{bioText}</Text>

      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable key={t.key} style={styles.tabItem} onPress={() => setTab(t.key)}>
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

      {tab === 'store' ? (
        <ContentGrid
          mode="content"
          items={creatorItems}
          pinnedCount={3}
          emptyText="ยังไม่มีคลิปจากผู้สร้างรายนี้"
          onPressItem={(item) => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openOwnerFeed(ownerKey, item);
          }}
        />
      ) : null}

      {tab === 'orders' ? (
        <ContentGrid
          mode="showroom"
          items={creatorItems}
          emptyIcon="pricetags-outline"
          emptyText="ยังไม่มีสินค้าในโชวรูม"
          onPressItem={(item) => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            openOwnerFeed(ownerKey, item);
          }}
        />
      ) : null}

      {tab === 'vault' ? (
        <View style={styles.publicInfoCard}>
          <View style={styles.publicInfoIcon}>
            <Ionicons name="shield-checkmark" size={22} color={colors.brand.primaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.publicInfoTitle}>{shopName}</Text>
            <Text style={styles.publicInfoDesc}>
              {tier} · บัญชียืนยันตัวตนแล้วบน BoomMall — ข้อมูล Vault ส่วนตัวของร้านนี้ถูกเก็บเป็นความลับ
            </Text>
          </View>
        </View>
      ) : null}

      {tab === 'liked' ? (
        <View style={styles.gridEmpty}>
          <Ionicons name="lock-closed-outline" size={40} color={colors.text.muted} />
          <Text style={styles.gridEmptyText}>รายการถูกใจของผู้ใช้นี้ถูกตั้งเป็นส่วนตัว</Text>
        </View>
      ) : null}
    </>
  );

  if (mode === 'sheet') {
    return (
      <>
        <BottomSheetScrollView
          style={styles.root}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {body}
        </BottomSheetScrollView>
        <ReportBlockSheet
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          kind="user"
          targetId={followKey}
          targetLabel={displayName}
          blockUserId={followKey}
        />
      </>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {body}
      </ScrollView>
      <ReportBlockSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        kind="user"
        targetId={followKey}
        targetLabel={displayName}
        blockUserId={followKey}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pageRoot: {
    flex: 1,
    backgroundColor: colors.surface.canvas,
  },
  sheetBg: {
    backgroundColor: colors.surface.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: 'rgba(120,120,128,0.36)',
    width: 40,
    height: 4,
  },
  root: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  coverBanner: {
    width: '100%',
    height: 132,
    backgroundColor: colors.brand.forest,
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  coverHeaderIcons: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coverIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityBlock: {
    alignItems: 'center',
    marginTop: -44,
    paddingHorizontal: 16,
    gap: 4,
  },
  avatarText: {
    fontSize: 34,
  },
  displayName: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
  },
  handleCentered: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 14,
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
    fontWeight: '600',
    color: colors.text.secondary,
  },
  categoryText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  bio: {
    textAlign: 'left',
    color: colors.text.primary,
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 16,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  followBtn: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.pink,
    borderRadius: 4,
  },
  followBtnFollowing: {
    backgroundColor: '#F1F1F2',
  },
  followBtnText: {
    fontWeight: '700',
    color: '#fff',
    fontSize: 15,
  },
  followBtnTextFollowing: {
    color: colors.text.primary,
    fontSize: 14,
  },
  messageBtn: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F1F2',
    borderRadius: 4,
  },
  messageBtnText: {
    fontWeight: '700',
    color: colors.text.primary,
    fontSize: 15,
  },
  moreBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F1F2',
    borderRadius: 4,
  },
  publicInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: 14,
  },
  publicInfoIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brand.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publicInfoTitle: {
    fontWeight: '900',
    color: colors.text.primary,
    fontSize: 14,
  },
  publicInfoDesc: {
    color: colors.text.secondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 17,
  },
  tabBar: {
    flexDirection: 'row',
    marginTop: 20,
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
});
