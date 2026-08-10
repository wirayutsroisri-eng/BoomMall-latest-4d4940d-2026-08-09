import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { Avatar } from '@/shared/components/Avatar';
import { colors } from '@/shared/theme/colors';
import { ContentGrid } from './ContentGrid';

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
type VisitorTab = 'orders' | 'store' | 'vault' | 'liked';

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
  { key: 'orders', icon: 'bag-handle-outline' },
  { key: 'store', icon: 'storefront-outline' },
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
 * Uses the exact same layout/scale/styling as the owner's ProfileScreen (squircle avatar,
 * 3-stat row, TikTok-grid tabs). The only structural difference is the action row: prominent
 * [+ติดตาม] and [💬 ส่งข้อความ] buttons instead of Edit/Share.
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
        {handle ? (
          <CreatorProfileContent handle={handle} feedId={feedId ?? undefined} />
        ) : (
          <View />
        )}
      </BottomSheetModal>
    );
  },
);

function CreatorProfileContent({ handle, feedId }: { handle: string; feedId?: string }) {
  const { dismiss } = useBottomSheetModal();
  const close = useCallback(() => dismiss(), [dismiss]);
  const items = useFeedStore((s) => s.items);
  const startConversationWithCreator = useChatStore((s) => s.startConversationWithCreator);
  const [tab, setTab] = useState<VisitorTab>('orders');
  const [following, setFollowing] = useState(false);

  const creatorItems = useMemo(
    () => items.filter((i) => i.authorHandle.replace(/^@/, '') === handle),
    [items, handle],
  );

  /** Prefer the exact clip the user swiped/tapped from; fall back to first creator post */
  const contextItem = useMemo(() => {
    if (feedId) {
      const match = items.find((i) => i.id === feedId);
      if (match) return match;
    }
    return creatorItems[0];
  }, [creatorItems, feedId, items]);

  const first = creatorItems[0];
  const displayName = contextItem?.author ?? first?.author ?? handle;
  const displayHandle = `@${handle}`;
  const shopName = contextItem?.product.shopName ?? first?.product.shopName ?? displayName;
  const tier = contextItem?.product.tier ?? first?.product.tier ?? 'B2C';
  const categoryTags = contextItem?.product.tags ?? first?.product.tags ?? [];
  const categoryText = categoryTags.length > 0 ? categoryTags.join(' · ') : `${tier} · ${shopName}`;
  const accent = contextItem?.gradient?.[0] ?? first?.gradient?.[0] ?? colors.brand.primary;

  const seed = useMemo(() => hashString(handle), [handle]);
  const followingCount = 20 + (seed % 300);
  const followersCount = 800 + (seed % 68000);
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

  const toggleFollow = () => {
    void Haptics.selectionAsync();
    setFollowing((f) => {
      const next = !f;
      // Facebook-style: following a creator here also adds them as a chat contact in the
      // background, so [💬 ส่งข้อความ] is instantly ready without a separate friend-request step.
      if (next) startConversationWithCreator(displayName, displayHandle, accent);
      return next;
    });
  };

  return (
    <BottomSheetScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
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
          <Pressable hitSlop={10} onPress={() => close()} style={styles.coverIconBtn}>
            <Ionicons name="chevron-down" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.pageInfoRow}>
        <View style={styles.avatarWrap}>
          <Avatar
            initial={displayName.slice(0, 1)}
            backgroundColor={accent}
            size={84}
            radius={20}
            borderWidth={3}
            borderColor={colors.surface.canvas}
            textStyle={styles.avatarText}
          />
        </View>
        <View style={styles.pageInfoBody}>
          <Text style={styles.shopName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.statsLine} numberOfLines={1}>
            <Text style={styles.statsLineStrong}>{formatCompact(followersCount)}</Text> ผู้ติดตาม
            {'  •  '}
            <Text style={styles.statsLineStrong}>{formatCompact(followingCount)}</Text> กำลังติดตาม
          </Text>
        </View>
      </View>

      <View style={styles.handleRow}>
        <Text style={styles.handleText} numberOfLines={1}>{displayHandle}</Text>
        <View style={styles.vipPill}>
          <Text style={styles.vipText}>{tier} · ผู้สร้างคอนเทนต์</Text>
        </View>
      </View>
      <Text style={styles.categoryText} numberOfLines={1}>{categoryText}</Text>
      <Text style={styles.bio}>{bioText}</Text>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.followBtnOutline, following && styles.followBtnOutlineActive]}
          onPress={toggleFollow}
        >
          <Ionicons
            name={following ? 'notifications' : 'add'}
            size={16}
            color={colors.text.primary}
          />
          <Text style={styles.followBtnOutlineText}>
            {following ? 'กำลังติดตาม' : 'ติดตาม'}
          </Text>
        </Pressable>
        <Pressable style={styles.messageBtnPrimary} onPress={messageCreator}>
          <Ionicons name="chatbubble-ellipses" size={17} color={colors.brand.ink} />
          <Text style={styles.messageBtnPrimaryText}>ส่งข้อความ / ทักแชต</Text>
        </Pressable>
      </View>

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

      {tab === 'orders' ? (
        <ContentGrid
          mode="showroom"
          items={creatorItems}
          emptyIcon="pricetags-outline"
          emptyText="ยังไม่มีสินค้าในโชวรูม"
          onPressItem={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            close();
          }}
        />
      ) : null}

      {tab === 'store' ? (
        <ContentGrid
          mode="content"
          items={creatorItems}
          emptyText="ยังไม่มีคลิปจากผู้สร้างรายนี้"
          onPressItem={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            close();
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
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
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
  pageInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  avatarWrap: {
    marginTop: -36,
  },
  avatarText: {
    fontSize: 34,
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
  vipPill: {
    backgroundColor: colors.brand.ink,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  vipText: {
    color: colors.brand.primary,
    fontWeight: '900',
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 14,
  },
  followBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface.card,
    borderRadius: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  followBtnOutlineActive: {
    backgroundColor: colors.brand.mist,
    borderColor: colors.brand.primaryDark,
  },
  followBtnOutlineText: {
    fontWeight: '800',
    color: colors.text.primary,
    fontSize: 13,
  },
  messageBtnPrimary: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.brand.primary,
    borderRadius: 10,
    paddingVertical: 9,
  },
  messageBtnPrimaryText: {
    fontWeight: '800',
    color: colors.brand.ink,
    fontSize: 13,
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
