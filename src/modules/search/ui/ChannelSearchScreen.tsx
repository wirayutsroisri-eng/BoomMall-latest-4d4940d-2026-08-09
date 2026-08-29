import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DragDownDismiss } from '@/shared/components/DragDownDismiss';
import { Avatar } from '@/shared/components/Avatar';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import { useInventoryStore } from '@/modules/commerce/state/inventory-store';
import { useChatStore } from '@/modules/chat/state/chat-store';
import { isBoardPost } from '@/modules/feed/domain/selectFeedByTab';
import { isSecondhandListing, listingImage } from '@/modules/secondhand/domain/secondhand-listing';
import { masterContentImage } from '@/modules/commerce/data/catalog';
import { normalizeSearchContext } from '@/modules/search/domain/search-context';
import { shopKeyOf } from '@/modules/shop/domain/product-display';

type SearchScope = 'feed_global' | 'nearby' | 'jobs' | 'secondhand' | 'shop' | 'feed' | 'clips';

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  detail?: string;
  imageUri?: string;
  avatarUri?: string;
  initial?: string;
  icon: keyof typeof Ionicons.glyphMap;
  kindLabel?: string;
  priceLabel?: string;
  relevance?: number;
  onPress: () => void;
};

const SCOPE_COPY: Record<SearchScope, { title: string; placeholder: string; section: string }> = {
  feed_global: { title: 'Open Search', placeholder: 'ค้นหาทุกอย่างใน BoomMall', section: 'ทุกประเภท' },
  nearby: { title: 'ค้นหาเพื่อน', placeholder: 'ค้นหาชื่อหรือชื่อผู้ใช้', section: 'เพื่อนของคุณ' },
  jobs: { title: 'ค้นหางาน', placeholder: 'ตำแหน่ง บริษัท พื้นที่ หรือคีย์เวิร์ด', section: 'ประกาศงาน' },
  secondhand: { title: 'ค้นหามือสอง', placeholder: 'ชื่อสินค้า รุ่น หมวดหมู่ หรือพื้นที่', section: 'ประกาศมือสอง' },
  shop: { title: 'ค้นหาสินค้า', placeholder: 'ชื่อสินค้า SKU แบรนด์ หรือหมวดหมู่', section: 'สินค้าในร้านค้า' },
  feed: { title: 'ค้นหาในฟีด', placeholder: 'ค้นหาคอนเทนต์ ผู้โพสต์ หรือคีย์เวิร์ด', section: 'โพสต์ในฟีด' },
  clips: { title: 'ค้นหาคลิป', placeholder: 'ชื่อคลิป ผู้สร้าง เพลง หรือคีย์เวิร์ด', section: 'คลิปวิดีโอ' },
};

function normalizeScope(value: string): SearchScope {
  if (normalizeSearchContext(value) === 'feed_global') return 'feed_global';
  return ['nearby', 'jobs', 'secondhand', 'shop', 'feed', 'clips'].includes(value)
    ? value as SearchScope
    : 'feed';
}

function feedThumbnail(item: ReturnType<typeof useFeedStore.getState>['items'][number]) {
  const asset = item.mediaAssets?.find((media) => media.type === 'image')
    ?? item.mediaAssets?.find((media) => media.thumbnailUrl);
  return asset?.thumbnailUrl || asset?.canonicalUrl || item.imageUris?.[0] || item.imageUri;
}

function keywordRelevance(value: string, query: string) {
  if (!query) return 1;
  const haystack = value.toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.every((token) => haystack.includes(token))) return 0;
  return tokens.reduce((score, token) => score + (haystack.startsWith(token) ? 4 : 1), 0)
    + (haystack.includes(query) ? 6 : 0);
}

export function ChannelSearchScreen({ scope: rawScope }: { scope: string }) {
  const insets = useSafeAreaInsets();
  const scope = normalizeScope(rawScope);
  const copy = SCOPE_COPY[scope];
  const [query, setQuery] = useState('');
  const feedItems = useFeedStore((state) => state.items);
  const masters = useInventoryStore((state) => state.masters);
  const variants = useInventoryStore((state) => state.variants);
  const conversations = useChatStore((state) => state.conversations);
  const needle = query.trim().toLowerCase();

  const results = useMemo<SearchResult[]>(() => {
    if (scope === 'feed_global') {
      if (!needle) return [];
      const relevance = (value: string) => keywordRelevance(value, needle);
      const matches = (value: string) => relevance(value) > 0;
      const openFeedResult = (
        item: typeof feedItems[number],
        kindLabel: string,
        icon: keyof typeof Ionicons.glyphMap,
      ): SearchResult => ({
        id: `${kindLabel}:${item.id}`,
        title: item.product.name || item.caption || 'โพสต์',
        subtitle: `${item.author} · ${item.authorHandle}`,
        detail: item.location || undefined,
        imageUri: isSecondhandListing(item) ? listingImage(item) : feedThumbnail(item),
        avatarUri: item.authorAvatarUri,
        initial: item.author.slice(0, 1),
        icon,
        kindLabel,
        relevance: relevance([item.product.name, item.caption, item.author, item.product.tags.join(' '), item.location].join(' ')),
        onPress: () => isSecondhandListing(item)
          ? router.push(`/secondhand/${encodeURIComponent(item.id)}`)
          : router.push({ pathname: '/profile-feed', params: { handle: item.authorHandle.replace(/^@/, ''), startId: item.id } }),
      });
      const products: SearchResult[] = masters
        .filter((master) => master.channel !== 'C2C')
        .filter((master) => matches(`${master.title} ${master.masterSku} ${master.brand} ${master.shopName} ${master.tags.join(' ')}`))
        .map((master) => ({
          id: `product:${master.id}`,
          title: master.title,
          subtitle: `${master.shopName} · ฿${master.basePrice.toLocaleString('th-TH')}`,
          imageUri: master.imageUri || masterContentImage(master.id),
          icon: 'bag-handle-outline',
          kindLabel: 'สินค้า',
          priceLabel: `฿${master.basePrice.toLocaleString('th-TH')}`,
          relevance: relevance(`${master.title} ${master.brand} ${master.shopName} ${master.tags.join(' ')}`),
          onPress: () => {
            Keyboard.dismiss();
            // channel-search is a native modal while PDP is a card. Replacing the
            // modal prevents iOS from mounting the product card behind it.
            router.replace({ pathname: '/shop/product/[id]', params: { id: master.id } });
          },
        }));
      const content = feedItems.filter((item) => matches([
        item.caption, item.product.name, item.product.shopName, item.product.tags.join(' '),
        item.author, item.authorHandle, item.location, item.musicTitle,
      ].join(' '))).map((item) => {
        if (isSecondhandListing(item)) return openFeedResult(item, 'สินค้ามือสอง', 'pricetag-outline');
        if (isBoardPost(item)) return openFeedResult(item, item.boardSide === 'supply' ? 'บริการ' : 'งาน', item.boardSide === 'supply' ? 'construct-outline' : 'briefcase-outline');
        if (item.videoUri || item.mediaAssets?.some((media) => media.type === 'video')) return openFeedResult(item, 'วิดีโอ', 'play-outline');
        return openFeedResult(item, 'โพสต์', 'newspaper-outline');
      });
      const shopsByKey = new Map<string, typeof masters[number]>();
      masters.filter((master) => master.channel !== 'C2C').forEach((master) => {
        const key = shopKeyOf(master);
        if (!shopsByKey.has(key)) shopsByKey.set(key, master);
      });
      const shops: SearchResult[] = [...shopsByKey.entries()]
        .filter(([, master]) => matches(`${master.shopName} ${master.brand} ${master.tags.join(' ')}`))
        .map(([shopKey, master]) => ({
          id: `shop:${shopKey}`,
          title: master.shopName,
          subtitle: 'ร้านค้า',
          imageUri: master.imageUri || masterContentImage(master.id),
          icon: 'storefront-outline',
          kindLabel: 'ร้านค้า',
          relevance: relevance(`${master.shopName} ${master.brand} ${master.tags.join(' ')}`),
          onPress: () => {
            Keyboard.dismiss();
            // Replace the search modal so the storefront becomes the visible card.
            router.replace({ pathname: '/shop/store/[shopKey]', params: { shopKey } });
          },
        }));
      const people = new Map<string, { name: string; handle: string; avatarUri?: string }>();
      feedItems.forEach((item) => people.set(item.authorHandle, { name: item.author, handle: item.authorHandle, avatarUri: item.authorAvatarUri }));
      conversations.filter((row) => (row.kind ?? 'friend') === 'friend').forEach((row) => people.set(row.peerHandle, { name: row.peerName, handle: row.peerHandle, avatarUri: row.avatarUri }));
      const users: SearchResult[] = [...people.values()].filter((person) => matches(`${person.name} ${person.handle}`)).map((person) => ({ id: `user:${person.handle}`, title: person.name, subtitle: person.handle, avatarUri: person.avatarUri, initial: person.name.slice(0, 1), icon: 'person-outline', kindLabel: 'ผู้ใช้', relevance: relevance(`${person.name} ${person.handle}`), onPress: () => router.push(`/creator/${encodeURIComponent(person.handle.replace(/^@/, ''))}`) }));
      const hashtags: SearchResult[] = [...new Set([...masters.flatMap((master) => master.tags), ...feedItems.flatMap((item) => item.product.tags)])]
        .filter(matches).map((tag) => ({ id: `hashtag:${tag}`, title: `#${tag.replace(/^#/, '')}`, subtitle: 'แฮชแท็ก', icon: 'pricetag-outline', kindLabel: 'แฮชแท็ก', relevance: relevance(tag), onPress: () => setQuery(tag.replace(/^#/, '')) }));
      const locations: SearchResult[] = [...new Set(feedItems.map((item) => item.location).filter(Boolean))]
        .filter(matches).map((location) => ({ id: `location:${location}`, title: location, subtitle: 'สถานที่', icon: 'location-outline', kindLabel: 'สถานที่', relevance: relevance(location), onPress: () => setQuery(location) }));
      return [...products, ...content, ...shops, ...users, ...hashtags, ...locations]
        .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
    }

    if (scope === 'nearby') {
      return conversations
        .filter((row) => (row.kind ?? 'friend') === 'friend' && !row.isArchived && !row.isHidden)
        .filter((row) => !needle || `${row.peerName} ${row.peerHandle}`.toLowerCase().includes(needle))
        .map((row) => ({
          id: row.id,
          title: row.peerName,
          subtitle: row.peerHandle,
          detail: `อัปเดต ${row.updatedAt}`,
          avatarUri: row.avatarUri,
          initial: row.peerName.slice(0, 1),
          icon: 'person-outline',
          onPress: () => router.push(`/creator/${encodeURIComponent(row.peerHandle.replace(/^@/, ''))}`),
        }));
    }

    if (scope === 'shop') {
      return masters
        .filter((master) => master.channel !== 'C2C')
        .filter((master) => {
          if (!needle) return true;
          const variantText = variants
            .filter((variant) => variant.masterSkuId === master.id)
            .map((variant) => `${variant.sku} ${variant.label}`)
            .join(' ');
          return `${master.title} ${master.masterSku} ${master.shopName} ${master.tags.join(' ')} ${variantText}`
            .toLowerCase()
            .includes(needle);
        })
        .map((master) => ({
          id: master.id,
          title: master.title,
          subtitle: `${master.shopName} · ฿${master.basePrice.toLocaleString('th-TH')}`,
          detail: master.tags.slice(0, 3).join(' · '),
          imageUri: master.imageUri || masterContentImage(master.id),
          icon: 'bag-handle-outline',
          onPress: () => {
            Keyboard.dismiss();
            router.replace({
              pathname: '/shop/search-results',
              params: {
                q: needle || master.categoryKey || master.brand || master.title,
                label: query.trim() || master.categoryKey || master.brand || master.title,
              },
            });
          },
        }));
    }

    const scopedFeed = feedItems.filter((item) => {
      if (scope === 'jobs') return isBoardPost(item);
      if (scope === 'secondhand') return isSecondhandListing(item);
      if (scope === 'clips') {
        return Boolean(item.videoUri || item.mediaAssets?.some((media) => media.type === 'video'));
      }
      return !isBoardPost(item);
    });

    return scopedFeed
      .filter((item) => !needle || [
        item.caption,
        item.product.name,
        item.product.shopName,
        item.product.tags.join(' '),
        item.author,
        item.authorHandle,
        item.location,
        item.musicTitle,
      ].join(' ').toLowerCase().includes(needle))
      .map((item) => ({
        id: item.id,
        title: item.product.name || item.caption || 'โพสต์',
        subtitle: `${item.author} · ${item.authorHandle}`,
        detail: scope === 'secondhand'
          ? `฿${item.product.basePrice.toLocaleString('th-TH')} · ${item.location || 'ไม่ระบุพื้นที่'}`
          : `${item.likes.toLocaleString('th-TH')} ถูกใจ · ${item.comments.toLocaleString('th-TH')} ความคิดเห็น`,
        imageUri: scope === 'secondhand' ? listingImage(item) : feedThumbnail(item),
        avatarUri: item.authorAvatarUri,
        initial: item.author.slice(0, 1),
        icon: scope === 'clips' ? 'play-outline' : scope === 'jobs' ? 'briefcase-outline' : 'newspaper-outline',
        onPress: () => {
          if (scope === 'secondhand') {
            router.push(`/secondhand/${encodeURIComponent(item.id)}`);
            return;
          }
          router.push({
            pathname: '/profile-feed',
            params: { handle: item.authorHandle.replace(/^@/, ''), startId: item.id },
          });
        },
      }));
  }, [conversations, feedItems, masters, needle, query, scope, variants]);

  const productResults = scope === 'feed_global'
    ? results.filter((result) => result.kindLabel === 'สินค้า')
    : [];
  const listResults = scope === 'feed_global'
    ? results.filter((result) => result.kindLabel !== 'สินค้า')
    : results;

  return (
    <DragDownDismiss onDismiss={() => router.back()} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.back} hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color="#151A17" />
        </Pressable>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={23} color="#161B18" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={copy.placeholder}
            placeholderTextColor="#929995"
            style={styles.input}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable style={styles.searchAction} onPress={() => Keyboard.dismiss()}>
          <Text style={styles.searchActionText}>ค้นหา</Text>
        </Pressable>
      </View>

      <View style={styles.contextRow}>
        <View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.scopeText}>{scope === 'feed_global' ? 'สินค้าและคอนเทนต์ที่เกี่ยวข้องใน BoomMall' : `ผลลัพธ์จาก ${copy.section} เท่านั้น`}</Text>
        </View>
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>{results.length}</Text>
        </View>
      </View>

      <FlatList
        data={listResults}
        keyExtractor={(item) => `${scope}:${item.id}`}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, results.length === 0 && styles.emptyList]}
        ListHeaderComponent={scope === 'feed_global' && productResults.length > 0 ? (
          <View style={styles.commerceSection}>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>สินค้าที่เกี่ยวข้อง</Text>
              <Text style={styles.commerceHint}>เลือกซื้อใน BoomMall</Text>
            </View>
            <FlatList
              horizontal
              data={productResults}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.productRail}
              renderItem={({ item }) => (
                <Pressable style={({ pressed }) => [styles.productCard, pressed && styles.resultPressed]} onPress={item.onPress}>
                  {item.imageUri ? (
                    <Image source={{ uri: item.imageUri }} style={styles.productImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.productImage, styles.productImageEmpty]}>
                      <Ionicons name="bag-handle-outline" size={28} color="#68726C" />
                    </View>
                  )}
                  <Text style={styles.productTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.productPrice}>{item.priceLabel}</Text>
                  <Text style={styles.productShop} numberOfLines={1}>{item.subtitle.split(' · ')[0]}</Text>
                </Pressable>
              )}
            />
            {listResults.length > 0 ? <Text style={styles.sectionHeading}>ผลลัพธ์อื่นที่เกี่ยวข้อง</Text> : null}
          </View>
        ) : null}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [styles.result, pressed && styles.resultPressed]} onPress={item.onPress}>
            {item.imageUri ? (
              <Image source={{ uri: item.imageUri }} style={styles.thumb} resizeMode="cover" />
            ) : item.avatarUri ? (
              <Avatar uri={item.avatarUri} initial={item.initial} size={62} radius={18} borderWidth={0} />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name={item.icon} size={25} color="#68726C" />
              </View>
            )}
            <View style={styles.resultBody}>
              <Text style={styles.resultTitle} numberOfLines={2}>{item.title}</Text>
              {item.kindLabel ? <Text style={styles.kindLabel}>{item.kindLabel}</Text> : null}
              <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
              {item.detail ? <Text style={styles.resultDetail} numberOfLines={1}>{item.detail}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A0A7A3" />
          </Pressable>
        )}
        ListEmptyComponent={results.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={42} color="#A1A8A4" />
            <Text style={styles.emptyTitle}>ไม่พบผลลัพธ์</Text>
            <Text style={styles.emptyText}>{scope === 'feed_global' && !needle ? 'พิมพ์ชื่อสินค้า บริการ ร้านค้า หรือเรื่องที่สนใจ' : 'ลองค้นหาด้วยชื่อ ผู้โพสต์ รุ่นสินค้า หรือคีย์เวิร์ดอื่น'}</Text>
          </View>
        ) : null}
      />
    </DragDownDismiss>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F8F7' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 12, backgroundColor: '#FFFFFF' },
  back: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, height: 46, borderRadius: 14, backgroundColor: '#EFF1F0', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  input: { flex: 1, height: 46, color: '#171D19', fontSize: 15 },
  searchAction: { minWidth: 50, height: 44, alignItems: 'center', justifyContent: 'center' },
  searchActionText: { color: '#168BFF', fontSize: 14, fontWeight: '900' },
  contextRow: { paddingHorizontal: 16, paddingTop: 17, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#171D19', fontSize: 22, fontWeight: '900' },
  scopeText: { color: '#7A847E', fontSize: 11, marginTop: 3 },
  resultCount: { minWidth: 34, height: 28, borderRadius: 14, backgroundColor: '#E6EAE7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  resultCountText: { color: '#46504A', fontSize: 12, fontWeight: '900' },
  list: { paddingHorizontal: 12, paddingBottom: 50 },
  commerceSection: { marginHorizontal: -12, paddingBottom: 10 },
  sectionHeadingRow: { paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeading: { color: '#202824', fontSize: 16, fontWeight: '900', paddingHorizontal: 16, marginBottom: 10 },
  commerceHint: { color: '#168BFF', fontSize: 11, fontWeight: '800', marginBottom: 10, paddingRight: 16 },
  productRail: { paddingHorizontal: 16, paddingBottom: 20, gap: 10 },
  productCard: { width: 154, borderRadius: 16, padding: 8, backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E0E4E1' },
  productImage: { width: '100%', height: 118, borderRadius: 12, backgroundColor: '#E8ECE9' },
  productImageEmpty: { alignItems: 'center', justifyContent: 'center' },
  productTitle: { color: '#202824', fontSize: 13, lineHeight: 17, fontWeight: '800', marginTop: 8, minHeight: 34 },
  productPrice: { color: '#E7354F', fontSize: 16, fontWeight: '900', marginTop: 5 },
  productShop: { color: '#7A847E', fontSize: 10, marginTop: 3 },
  emptyList: { flexGrow: 1 },
  result: { minHeight: 86, marginBottom: 8, padding: 10, borderRadius: 17, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E0E4E1' },
  resultPressed: { opacity: 0.7 },
  thumb: { width: 62, height: 62, borderRadius: 13, backgroundColor: '#E4E8E5' },
  placeholder: { width: 62, height: 62, borderRadius: 18, backgroundColor: '#E8ECE9', alignItems: 'center', justifyContent: 'center' },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitle: { color: '#202824', fontSize: 14, lineHeight: 19, fontWeight: '900' },
  kindLabel: { alignSelf: 'flex-start', color: '#386A55', backgroundColor: '#E5F3EC', fontSize: 10, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, marginTop: 3 },
  resultSubtitle: { color: '#68726C', fontSize: 11, marginTop: 4 },
  resultDetail: { color: '#929A95', fontSize: 10, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 100 },
  emptyTitle: { color: '#303833', fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptyText: { color: '#818A85', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
});
