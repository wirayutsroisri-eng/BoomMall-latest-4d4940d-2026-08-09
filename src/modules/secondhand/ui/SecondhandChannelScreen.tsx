import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/shared/components/Avatar';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import type { FeedItem } from '@/modules/feed/domain/types';
import { isSecondhandListing, listingCategory, listingCondition, listingImage } from '../domain/secondhand-listing';
import { useSecondhandUiStore } from '../state/secondhand-ui-store';
import { SecondhandCreateSheet } from './SecondhandCreateSheet';
import { SecondhandListingMenu } from './SecondhandListingMenu';
import { useModerationStore } from '@/modules/safety/state/moderation-store';
import { ContentRefreshOverlay } from '@/shared/components/ContentRefreshOverlay';
import { withMinimumDuration } from '@/shared/utils/minimumDuration';

type Props = { active: boolean; onVerticalScroll?: (offsetY: number) => void };
const PAGE_SIZE = 12;
const TABS = ['แนะนำ', 'มาใหม่', 'ใกล้ฉัน', 'รถ', 'มือถือ', 'อิเล็กทรอนิกส์', 'บ้าน', 'แฟชั่น', 'อื่น ๆ'];
const CATEGORIES = [
  ['car-sport-outline', 'รถ'], ['phone-portrait-outline', 'โทรศัพท์'], ['laptop-outline', 'คอมพิวเตอร์'],
  ['tv-outline', 'เครื่องใช้ไฟฟ้า'], ['home-outline', 'บ้าน'], ['shirt-outline', 'แฟชั่น'],
  ['construct-outline', 'อะไหล่'], ['diamond-outline', 'ของสะสม'], ['grid-outline', 'อื่น ๆ'],
] as const;

function matchesTab(item: FeedItem, tab: string) {
  if (tab === 'แนะนำ') return true;
  if (tab === 'มาใหม่') return true;
  if (tab === 'ใกล้ฉัน') return Boolean(item.gps || item.location);
  const tags = listingCategory(item);
  const aliases: Record<string, string[]> = { รถ: ['รถ', 'มอเตอร์ไซค์'], มือถือ: ['มือถือ', 'โทรศัพท์', 'iphone', 'android'], อิเล็กทรอนิกส์: ['อิเล็กทรอนิกส์', 'คอม', 'โน้ตบุ๊ก'], บ้าน: ['บ้าน', 'เฟอร์นิเจอร์'], แฟชั่น: ['แฟชั่น', 'เสื้อ', 'รองเท้า'], 'อื่น ๆ': [] };
  return !(aliases[tab]?.length) || aliases[tab]!.some((value) => tags.includes(value));
}

export function SecondhandChannelScreen({ active, onVerticalScroll }: Props) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const items = useFeedStore((state) => state.items);
  const refreshFeed = useFeedStore((state) => state.refreshFromServer);
  const startChat = useChatStore((state) => state.startConversationWithCreator);
  const createSheetNonce = useSecondhandUiStore((state) => state.createSheetNonce);
  const handledCreateSheetNonce = useRef(createSheetNonce);
  const [tab, setTab] = useState('แนะนำ');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [menuItem, setMenuItem] = useState<FeedItem | null>(null);
  const hiddenContentIds = useModerationStore((state) => state.hiddenContentIds);
  const blockedUserIds = useModerationStore((state) => state.blockedUserIds);

  useEffect(() => {
    if (!active) {
      handledCreateSheetNonce.current = createSheetNonce;
      return;
    }
    if (createSheetNonce === handledCreateSheetNonce.current) return;
    handledCreateSheetNonce.current = createSheetNonce;
    requestAnimationFrame(() => sheetRef.current?.present());
  }, [active, createSheetNonce]);

  const listings = useMemo(() => items.filter(isSecondhandListing).filter((item) => !hiddenContentIds.includes(item.id)).filter((item) => !blockedUserIds.includes((item.authorId ?? item.authorHandle).replace(/^@/, '').toLowerCase())).filter((item) => !mineOnly || item.isUserPost).filter((item) => matchesTab(item, tab)).sort((a, b) => tab === 'มาใหม่' ? new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime() : 0), [blockedUserIds, hiddenContentIds, items, mineOnly, tab]);

  const openChat = useCallback((item: FeedItem) => {
    const conversationId = startChat(item.author, item.authorHandle, item.gradient[1], { id: `secondhand-${item.id}`, feedId: item.id, title: item.product.name, subtitle: item.caption, price: item.product.basePrice, currency: item.product.currency, tier: 'C2C', imageUri: listingImage(item), gradient: item.gradient, authorHandle: item.authorHandle, peerUserId: item.authorId });
    router.push(`/(tabs)/chat/${encodeURIComponent(conversationId)}`);
  }, [startChat]);

  const renderCard = ({ item }: { item: FeedItem }) => {
    const uri = listingImage(item);
    const ratio = item.imageWidth && item.imageHeight ? item.imageWidth / item.imageHeight : 0.82;
    const mediaHeight = Math.max(150, Math.min(260, 174 / ratio));
    return <Pressable style={styles.card} onPress={() => router.push(`/secondhand/${encodeURIComponent(item.id)}`)}><Pressable style={styles.more} hitSlop={8} onPress={() => setMenuItem(item)}><Ionicons name="ellipsis-horizontal" size={20} color="#202824" /></Pressable>
      <View style={[styles.media, { height: mediaHeight }]}>{uri ? <Image source={{ uri }} style={styles.image} resizeMode="cover" /> : <View style={styles.imageEmpty}><Ionicons name="image-outline" size={30} color="#A5AEA9" /></View>}</View>
      <View style={styles.cardBody}><Text style={styles.cardTitle} numberOfLines={2}>{item.product.name || item.caption}</Text><Text style={styles.price}>฿{item.product.basePrice.toLocaleString('th-TH')}</Text>
        <View style={styles.metaRow}><Text style={styles.condition}>{listingCondition(item)}</Text><Text style={styles.location} numberOfLines={1}>{item.location || 'ไม่ระบุพื้นที่'}</Text></View>
        <View style={styles.sellerRow}><Pressable style={styles.seller} onPress={() => item.isUserPost ? router.push('/(tabs)/profile') : router.push(`/creator/${encodeURIComponent(item.authorHandle.replace(/^@/, ''))}`)}><Avatar uri={item.authorAvatarUri} initial={item.author[0]} size={24} radius={12} borderWidth={0} /><Text style={styles.sellerName} numberOfLines={1}>{item.author}</Text></Pressable><Pressable onPress={() => openChat(item)} hitSlop={8}><Ionicons name="chatbubble-outline" size={19} color="#3B4640" /></Pressable></View>
        <Text style={styles.interest}>{item.likes.toLocaleString('th-TH')} คนสนใจ</Text>
      </View>
    </Pressable>;
  };

  return <View style={styles.root}>
    <FlatList data={listings.slice(0, visibleCount)} numColumns={2} keyExtractor={(item) => item.id} renderItem={renderCard} columnWrapperStyle={styles.columns} contentContainerStyle={styles.content} scrollEnabled={active} showsVerticalScrollIndicator={false} onScroll={(event) => onVerticalScroll?.(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16} onEndReachedThreshold={0.6} onEndReached={() => setVisibleCount((value) => Math.min(listings.length, value + PAGE_SIZE))} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} removeClippedSubviews refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void withMinimumDuration(refreshFeed()).finally(() => setRefreshing(false)); }} tintColor="#202824" />}
      ListHeaderComponent={<View><View style={[styles.sticky, { paddingTop: insets.top + 58 }]}><View style={styles.headingRow}><Text style={styles.heading}>มือสอง</Text><View style={styles.headerLinks}><Pressable onPress={() => router.push('/secondhand-drafts')}><Text style={styles.headerLink}>ฉบับร่าง</Text></Pressable><Pressable onPress={() => setMineOnly((value) => !value)}><Text style={[styles.headerLink,mineOnly&&styles.headerLinkActive]}>ประกาศของฉัน</Text></Pressable></View></View></View><FlatList horizontal data={TABS} keyExtractor={(value) => value} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} renderItem={({ item }) => <Pressable style={[styles.tab, item === tab && styles.tabActive]} onPress={() => { setTab(item); setVisibleCount(PAGE_SIZE); }}><Text style={[styles.tabText, item === tab && styles.tabTextActive]}>{item}</Text></Pressable>} /><FlatList horizontal data={CATEGORIES} keyExtractor={(item) => item[1]} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories} renderItem={({ item }) => <Pressable style={styles.category} onPress={() => setTab(item[1] === 'โทรศัพท์' ? 'มือถือ' : item[1] === 'เครื่องใช้ไฟฟ้า' || item[1] === 'คอมพิวเตอร์' ? 'อิเล็กทรอนิกส์' : item[1] === 'อื่น ๆ' ? 'อื่น ๆ' : item[1])}><View style={styles.categoryIcon}><Ionicons name={item[0]} size={23} color="#202824" /></View><Text style={styles.categoryText}>{item[1]}</Text></Pressable>} /></View>}
      ListEmptyComponent={refreshing ? <View style={styles.skeletonGrid}>{[0, 1, 2, 3].map((value) => <View key={value} style={styles.skeletonCard}><View style={styles.skeletonImage} /><View style={styles.skeletonLine} /><View style={styles.skeletonPrice} /></View>)}</View> : <View style={styles.empty}><Ionicons name="bag-handle-outline" size={42} color="#A5AEA9" /><Text style={styles.emptyTitle}>ยังไม่มีสินค้ามือสอง</Text><Text style={styles.emptyText}>ประกาศ C2C ที่เผยแพร่จริงจะแสดงที่นี่</Text></View>} />
    <SecondhandCreateSheet ref={sheetRef} />
    {menuItem ? <SecondhandListingMenu item={menuItem} visible onClose={() => setMenuItem(null)} /> : null}
    <ContentRefreshOverlay visible={refreshing} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1F3F1' }, sticky: { backgroundColor: '#F7F8F7', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE2DE' }, headingRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:9}, heading: { color: '#161C18', fontSize: 27, fontWeight: '900' },headerLinks:{flexDirection:'row',gap:12},headerLink:{fontSize:11,fontWeight:'800',color:'#68726C'},headerLinkActive:{color:'#E7354F'}, searchRow: { flexDirection: 'row', gap: 9 }, search: { flex: 1, height: 44, borderRadius: 15, backgroundColor: '#E8EBE9', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }, searchInput: { flex: 1, color: '#202824', fontSize: 15 }, imageSearch: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#E8EBE9', alignItems: 'center', justifyContent: 'center' }, content: { paddingBottom: 120 }, tabs: { paddingHorizontal: 12, paddingVertical: 10, gap: 7 }, tab: { height: 34, paddingHorizontal: 15, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, tabActive: { backgroundColor: '#202824' }, tabText: { color: '#606A64', fontSize: 13, fontWeight: '800' }, tabTextActive: { color: '#fff' }, categories: { paddingHorizontal: 12, paddingBottom: 13, gap: 13 }, category: { width: 66, alignItems: 'center', gap: 5 }, categoryIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, categoryText: { color: '#4E5852', fontSize: 10, fontWeight: '700', textAlign: 'center' }, columns: { paddingHorizontal: 8, gap: 8 }, card: { flex: 1, maxWidth: '50%', marginBottom: 9, borderRadius: 17, overflow: 'hidden', backgroundColor: '#fff' },more:{position:'absolute',right:7,top:7,zIndex:4,width:30,height:30,borderRadius:15,backgroundColor:'rgba(255,255,255,.9)',alignItems:'center',justifyContent:'center'}, media: { backgroundColor: '#E5E9E6' }, image: { width: '100%', height: '100%' }, imageEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' }, cardBody: { padding: 10 }, cardTitle: { color: '#202824', fontSize: 14, lineHeight: 18, fontWeight: '800' }, price: { color: '#E7354F', fontSize: 17, fontWeight: '900', marginTop: 5 }, metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }, condition: { color: '#4F5B54', fontSize: 10, backgroundColor: '#EEF1EF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7 }, location: { flex: 1, color: '#818A85', fontSize: 10 }, sellerRow: { marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, seller: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, sellerName: { flex: 1, color: '#59635D', fontSize: 11, fontWeight: '700' }, interest: { color: '#99A19D', fontSize: 9, marginTop: 5 }, empty: { alignItems: 'center', paddingTop: 80 }, emptyTitle: { color: '#303833', fontSize: 17, fontWeight: '900', marginTop: 10 }, emptyText: { color: '#8A938E', fontSize: 12, marginTop: 4 }, skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, gap: 8 }, skeletonCard: { width: '48%', height: 255, borderRadius: 17, backgroundColor: '#fff', paddingBottom: 10, overflow: 'hidden' }, skeletonImage: { height: 185, backgroundColor: '#E2E6E3' }, skeletonLine: { width: '78%', height: 12, borderRadius: 6, backgroundColor: '#E2E6E3', margin: 10 }, skeletonPrice: { width: '45%', height: 15, borderRadius: 7, backgroundColor: '#E2E6E3', marginHorizontal: 10 },
});
