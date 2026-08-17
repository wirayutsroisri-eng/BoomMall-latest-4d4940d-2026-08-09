import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { CHANTHABURI } from '@/modules/matching/domain/geo';
import { runPostMatching } from '@/modules/matching/domain/run-post-matching';
import { fetchFeedPosts, publishSocialPost, syncFeedComment } from '@/modules/feed/data/feedEngageApi';
import { mergeFeedItems, socialPostToFeedItem } from '@/modules/feed/data/mapSocialPost';
import { sanitizeMusicTitle, stripFakeMusicCaption } from '@/modules/feed/domain/feedMusic';
import { isLiveUgcFeedItem, keepPersistedFeedItems } from '@/modules/feed/domain/isLiveUgcFeedItem';
import { uploadFeedMedia } from '@/modules/feed/data/uploadFeedMedia';
import {
  DEFAULT_SEARCH_RADIUS,
  type SearchRadiusOption,
} from '@/modules/matching/domain/search-radius';
import type { BoardSide, CommerceTier, FeedComment, FeedItem, FeedTab } from '../domain/types';

type NewPostInput = {
  caption: string;
  price: number;
  channel: CommerceTier;
  imageUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageUris?: string[];
  videoUri?: string;
  overlayText?: string;
  overlayTextColor?: string;
  overlayTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
  /** ชื่อสินค้าบนการ์ดซื้อ (ถ้าไม่ใส่ใช้แคปชัน) */
  productName?: string;
  /** ผูก Master จากคลังเมื่อโพสต์พร้อมขาย */
  masterProductId?: string;
  stock?: number;
  gps?: { lat: number; lng: number };
  searchRadius?: SearchRadiusOption;
  /** Community Board marketplace side */
  boardSide?: BoardSide;
  /** Force lane=board even without keyword extract hit */
  forceBoard?: boolean;
  /**
   * Explicit publish intent — prevents content/sell captions from leaking onto the board
   * via keyword heuristics. Board forms pass 'board'; content passes 'content'.
   */
  intent?: 'content' | 'board' | 'sell';
  /** Sound from Listen Mode “ใช้เสียงนี้” */
  musicTitle?: string;
};

type FeedState = {
  tab: FeedTab;
  items: FeedItem[];
  activeProductId: string | null;
  activeCommentsFeedId: string | null;
  activeTipFeedId: string | null;
  commentsByFeedId: Record<string, FeedComment[]>;
  /** Visitor Profile bottom sheet — driven from global state so it can be re-opened
   *  from anywhere (Feed swipe/avatar tap, or [< Back] from a chat room). */
  activeCreatorHandle: string | null;
  activeCreatorFeedId: string | null;
  /** Bumped on every openCreatorProfile call so HomeFeedScreen can `.present()` the
   *  sheet again even when re-opening the *same* creator (e.g. coming back from chat). */
  creatorProfileNonce: number;
  setTab: (tab: FeedTab) => void;
  toggleLike: (id: string) => void;
  bumpShare: (id: string) => void;
  toggleSave: (id: string) => void;
  tipClip: (id: string, amount: number) => void;
  addPost: (input: NewPostInput) => string;
  renameOwnPosts: (displayName: string) => void;
  openProductSheet: (productId: string) => void;
  closeProductSheet: () => void;
  openComments: (feedId: string) => void;
  closeComments: () => void;
  openTip: (feedId: string) => void;
  closeTip: () => void;
  addComment: (feedId: string, text: string, author?: string, authorInitial?: string, parentId?: string) => void;
  toggleCommentLike: (feedId: string, commentId: string) => void;
  openCreatorProfile: (handle: string, feedId?: string) => void;
  closeCreatorProfile: () => void;
  hydrateFromServer: () => Promise<void>;
};

let commentSeq = 1000;

export const useFeedStore = create<FeedState>()(
  persist(
    (set, get) => ({
  tab: 'foryou',
  items: [],
  activeProductId: null,
  activeCommentsFeedId: null,
  activeTipFeedId: null,
  commentsByFeedId: {},
  activeCreatorHandle: null,
  activeCreatorFeedId: null,
  creatorProfileNonce: 0,
  setTab: (tab) => set({ tab }),
  toggleLike: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              liked: !item.liked,
              likes: item.liked ? item.likes - 1 : item.likes + 1,
            }
          : item,
      ),
    })),
  bumpShare: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, shares: item.shares + 1 } : item,
      ),
    })),
  toggleSave: (id) =>
    set((state) => {
      const item = state.items.find((i) => i.id === id);
      if (!item) return state;
      const nextSaved = !item.saved;
      if (nextSaved) {
        useVaultStore.getState().addItem({
          kind: item.imageUri ? 'photo' : 'note',
          title: `เซฟจากคลิป — ${item.caption.slice(0, 40)}`,
          subtitle: `${item.author} · ${item.product.tier}`,
          refId: item.id,
          imageUri: item.imageUri,
        });
      } else {
        useVaultStore.getState().removeItemByRef(item.id);
      }
      return {
        items: state.items.map((i) => (i.id === id ? { ...i, saved: nextSaved } : i)),
      };
    }),
  tipClip: (id, amount) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              tips: (item.tips ?? 0) + amount,
              myTipTotal: (item.myTipTotal ?? 0) + amount,
            }
          : item,
      ),
    })),
  addPost: (input) => {
    const profile = useLoyaltyStore.getState().profile;
    const id = `feed-user-${Date.now()}`;
    const imageUris =
      input.imageUris?.filter(Boolean) ??
      (input.imageUri ? [input.imageUri] : undefined);
    const gps = input.gps ?? CHANTHABURI;
    const searchRadius = input.searchRadius ?? DEFAULT_SEARCH_RADIUS;
    const caption = input.caption || 'โพสต์ใหม่จาก BoomMall';
    const author = profile.displayName;
    const authorHandle = profile.handle.replace(/^@/, '');
    // Only board intent (or explicit forceBoard/boardSide) lands on เว็บบอร์ด.
    // Content / sell never auto-classify via keywords — keeps contexts separate.
    const intent = input.intent;
    const isJobPost =
      intent === 'board' ||
      Boolean(input.forceBoard) ||
      (intent == null && Boolean(input.boardSide));
    const boardSide: BoardSide | undefined = isJobPost
      ? input.boardSide ?? 'demand'
      : undefined;
    const newItem: FeedItem = {
      id,
      author,
      authorHandle,
      lane: isJobPost ? 'board' : 'foryou',
      boardSide,
      caption,
      location: 'จันทบุรี',
      gps,
      searchRadius,
      likes: 0,
      comments: 0,
      shares: 0,
      tips: 0,
      isLive: false,
      musicTitle: input.musicTitle?.trim() || '',
      gradient: ['#0B3D2E', '#1A7A55'],
      imageUri: imageUris?.[0] ?? input.imageUri,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      imageUris,
      videoUri: input.videoUri,
      overlayText: input.overlayText?.trim() || undefined,
      overlayTextColor: input.overlayTextColor,
      overlayTransform: input.overlayTransform,
      isUserPost: true,
      product: {
        id: input.masterProductId ?? `p-user-${Date.now()}`,
        name: input.productName?.trim() || input.caption || 'สินค้าใหม่',
        shopName: profile.displayName,
        tier: input.channel,
        basePrice: input.price || 0,
        currency: 'THB',
        tags: [
          input.channel,
          input.masterProductId ? 'Shop' : 'New',
          ...(isJobPost ? ['เว็บบอร์ด', 'บริการ', boardSide === 'supply' ? 'รับงาน' : 'หาช่าง'] : []),
        ],
        variants: [
          {
            id: 'v1',
            label: 'มาตรฐาน',
            price: input.price || 0,
            stock: input.stock ?? 10,
          },
        ],
      },
    };
    set((state) => ({ items: [newItem, ...state.items] }));

    void (async () => {
      const uploaded = await uploadFeedMedia({
        imageUris,
        videoUri: input.videoUri,
      });
      const saved = await publishSocialPost({
        body: caption,
        media: {
          images: uploaded.imageUris,
          video: uploaded.videoUri,
          musicTitle: newItem.musicTitle,
          overlayText: newItem.overlayText,
          overlayTextColor: newItem.overlayTextColor,
          overlayTransform: newItem.overlayTransform,
          authorName: author,
          authorHandle,
        },
        lat: gps.lat,
        lng: gps.lng,
        locationLabel: newItem.location,
        tags: newItem.product.tags,
        lane: newItem.lane,
      });
      const auth = useAuthStore.getState().user;
      set((state) => ({
        items: state.items.map((item) => {
          if (item.id !== id) return item;
          const next = saved
            ? {
                ...item,
                ...socialPostToFeedItem(saved, {
                  myUserId: auth?.id,
                  myHandle: authorHandle,
                }),
                isUserPost: true,
              }
            : item;
          return {
            ...next,
            imageUri: uploaded.imageUris[0] ?? next.imageUri,
            imageUris: uploaded.imageUris.length ? uploaded.imageUris : next.imageUris,
            videoUri: uploaded.videoUri ?? next.videoUri,
          };
        }),
      }));
    })();

    // Matching only for board demand posts
    if (isJobPost && boardSide === 'demand') {
      runPostMatching({
        feedId: id,
        caption,
        author,
        authorHandle,
        gps,
        searchRadius,
        boardSide,
      });
    }

    return id;
  },
  renameOwnPosts: (displayName) => {
    const name = displayName.trim();
    if (!name) return;
    set((state) => ({
      items: state.items.map((item) =>
        item.isUserPost
          ? { ...item, author: name, product: { ...item.product, shopName: name } }
          : item,
      ),
    }));
  },
  openProductSheet: (productId) => set({ activeProductId: productId }),
  closeProductSheet: () => set({ activeProductId: null }),
  openComments: (feedId) => set({ activeCommentsFeedId: feedId }),
  closeComments: () => set({ activeCommentsFeedId: null }),
  openTip: (feedId) => set({ activeTipFeedId: feedId }),
  closeTip: () => set({ activeTipFeedId: null }),
  addComment: (feedId, text, author = 'คุณ', authorInitial = 'ค', parentId) =>
    set((state) => {
      commentSeq += 1;
      const comment: FeedComment = {
        id: `cm-${commentSeq}`,
        feedId,
        author,
        authorInitial,
        text,
        likes: 0,
        createdAt: 'เมื่อสักครู่',
        parentId,
      };
      void syncFeedComment(feedId, text, parentId);
      return {
        commentsByFeedId: {
          ...state.commentsByFeedId,
          [feedId]: [...(state.commentsByFeedId[feedId] ?? []), comment],
        },
        items: state.items.map((item) =>
          item.id === feedId ? { ...item, comments: item.comments + 1 } : item,
        ),
      };
    }),
  toggleCommentLike: (feedId, commentId) =>
    set((state) => ({
      commentsByFeedId: {
        ...state.commentsByFeedId,
        [feedId]: (state.commentsByFeedId[feedId] ?? []).map((c) =>
          c.id === commentId
            ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 }
            : c,
        ),
      },
    })),
  openCreatorProfile: (handle, feedId) =>
    set((state) => ({
      activeCreatorHandle: handle,
      activeCreatorFeedId: feedId ?? null,
      creatorProfileNonce: state.creatorProfileNonce + 1,
    })),
  closeCreatorProfile: () => set({ activeCreatorHandle: null, activeCreatorFeedId: null }),
  hydrateFromServer: async () => {
    const rows = await fetchFeedPosts();
    const auth = useAuthStore.getState().user;
    const profileName = useLoyaltyStore.getState().profile.displayName.trim();
    const remote = rows
      .map((row) => {
        const item = socialPostToFeedItem(row, { myUserId: auth?.id, myHandle: auth?.handle });
        return {
          ...item,
          musicTitle: sanitizeMusicTitle(item.musicTitle),
          author: item.isUserPost && profileName ? profileName : item.author,
        };
      })
      .filter(isLiveUgcFeedItem);
    const local = keepPersistedFeedItems(get().items);
    if (!remote.length && local.length === get().items.length) return;
    set({ items: mergeFeedItems(remote, local) });
  },
    }),
    {
      name: 'boommall-feed-v4',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: keepPersistedFeedItems(s.items).slice(0, 80) }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<FeedState>;
        const profileName = useLoyaltyStore.getState().profile.displayName.trim();
        const items = keepPersistedFeedItems(p.items ?? []).map((item) => ({
          ...item,
          musicTitle: sanitizeMusicTitle(item.musicTitle),
          caption: stripFakeMusicCaption(item.caption),
          author: item.isUserPost && profileName ? profileName : item.author,
        }));
        return { ...current, ...p, items };
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const items = keepPersistedFeedItems(state.items);
        if (items.length !== state.items.length) {
          useFeedStore.setState({ items });
        }
      },
    },
  ),
);
