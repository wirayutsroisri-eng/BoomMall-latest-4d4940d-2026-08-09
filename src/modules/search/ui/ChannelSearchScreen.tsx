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

type SearchScope = 'nearby' | 'jobs' | 'secondhand' | 'shop' | 'feed' | 'clips';

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  detail?: string;
  imageUri?: string;
  avatarUri?: string;
  initial?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

const SCOPE_COPY: Record<SearchScope, { title: string; placeholder: string; section: string }> = {
  nearby: { title: 'ค้นหาเพื่อน', placeholder: 'ค้นหาชื่อหรือชื่อผู้ใช้', section: 'เพื่อนของคุณ' },
  jobs: { title: 'ค้นหางาน', placeholder: 'ตำแหน่ง บริษัท พื้นที่ หรือคีย์เวิร์ด', section: 'ประกาศงาน' },
  secondhand: { title: 'ค้นหามือสอง', placeholder: 'ชื่อสินค้า รุ่น หมวดหมู่ หรือพื้นที่', section: 'ประกาศมือสอง' },
  shop: { title: 'ค้นหาสินค้า', placeholder: 'ชื่อสินค้า SKU แบรนด์ หรือหมวดหมู่', section: 'สินค้าในร้านค้า' },
  feed: { title: 'ค้นหาในฟีด', placeholder: 'ค้นหาคอนเทนต์ ผู้โพสต์ หรือคีย์เวิร์ด', section: 'โพสต์ในฟีด' },
  clips: { title: 'ค้นหาคลิป', placeholder: 'ชื่อคลิป ผู้สร้าง เพลง หรือคีย์เวิร์ด', section: 'คลิปวิดีโอ' },
};

function normalizeScope(value: string): SearchScope {
  return ['nearby', 'jobs', 'secondhand', 'shop', 'feed', 'clips'].includes(value)
    ? value as SearchScope
    : 'feed';
}

function feedThumbnail(item: ReturnType<typeof useFeedStore.getState>['items'][number]) {
  const asset = item.mediaAssets?.find((media) => media.type === 'image')
    ?? item.mediaAssets?.find((media) => media.thumbnailUrl);
  return asset?.thumbnailUrl || asset?.canonicalUrl || item.imageUris?.[0] || item.imageUri;
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
          <Text style={styles.scopeText}>ผลลัพธ์จาก {copy.section} เท่านั้น</Text>
        </View>
        <View style={styles.resultCount}>
          <Text style={styles.resultCountText}>{results.length}</Text>
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => `${scope}:${item.id}`}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, results.length === 0 && styles.emptyList]}
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
              <Text style={styles.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
              {item.detail ? <Text style={styles.resultDetail} numberOfLines={1}>{item.detail}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#A0A7A3" />
          </Pressable>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={42} color="#A1A8A4" />
            <Text style={styles.emptyTitle}>ไม่พบผลลัพธ์</Text>
            <Text style={styles.emptyText}>ลองค้นหาด้วยชื่อ ผู้โพสต์ รุ่นสินค้า หรือคีย์เวิร์ดอื่น</Text>
          </View>
        )}
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
  emptyList: { flexGrow: 1 },
  result: { minHeight: 86, marginBottom: 8, padding: 10, borderRadius: 17, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E0E4E1' },
  resultPressed: { opacity: 0.7 },
  thumb: { width: 62, height: 62, borderRadius: 13, backgroundColor: '#E4E8E5' },
  placeholder: { width: 62, height: 62, borderRadius: 18, backgroundColor: '#E8ECE9', alignItems: 'center', justifyContent: 'center' },
  resultBody: { flex: 1, minWidth: 0 },
  resultTitle: { color: '#202824', fontSize: 14, lineHeight: 19, fontWeight: '900' },
  resultSubtitle: { color: '#68726C', fontSize: 11, marginTop: 4 },
  resultDetail: { color: '#929A95', fontSize: 10, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 100 },
  emptyTitle: { color: '#303833', fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptyText: { color: '#818A85', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 5 },
});
