import { create } from 'zustand';
import { mockFeedsData } from '../data/mockFeedsData';
import { mockComments } from '../data/mockComments';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import type { CommerceTier, FeedComment, FeedItem, FeedTab } from '../domain/types';

type NewPostInput = {
  caption: string;
  price: number;
  channel: CommerceTier;
  imageUri?: string;
  videoUri?: string;
};

type FeedState = {
  tab: FeedTab;
  items: FeedItem[];
  activeProductId: string | null;
  activeCommentsFeedId: string | null;
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
  toggleSave: (id: string) => void;
  addPost: (input: NewPostInput) => void;
  openProductSheet: (productId: string) => void;
  closeProductSheet: () => void;
  openComments: (feedId: string) => void;
  closeComments: () => void;
  addComment: (feedId: string, text: string, author?: string, authorInitial?: string) => void;
  toggleCommentLike: (feedId: string, commentId: string) => void;
  openCreatorProfile: (handle: string, feedId?: string) => void;
  closeCreatorProfile: () => void;
};

const commentsByFeedId = mockComments.reduce<Record<string, FeedComment[]>>((acc, c) => {
  acc[c.feedId] = [...(acc[c.feedId] ?? []), c];
  return acc;
}, {});

let commentSeq = 1000;

export const useFeedStore = create<FeedState>((set) => ({
  tab: 'foryou',
  items: mockFeedsData,
  activeProductId: null,
  activeCommentsFeedId: null,
  commentsByFeedId,
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
  addPost: (input) => {
    const profile = useLoyaltyStore.getState().profile;
    const id = `feed-user-${Date.now()}`;
    const newItem: FeedItem = {
      id,
      author: profile.displayName,
      authorHandle: profile.handle.replace(/^@/, ''),
      caption: input.caption || 'โพสต์ใหม่จาก BoomMall',
      location: 'จันทบุรี',
      likes: 0,
      comments: 0,
      shares: 0,
      isLive: false,
      musicTitle: 'Original Sound — BoomMall',
      gradient: ['#0B3D2E', '#1A7A55'],
      imageUri: input.imageUri,
      videoUri: input.videoUri,
      isUserPost: true,
      product: {
        id: `p-user-${Date.now()}`,
        name: input.caption || 'สินค้าใหม่',
        shopName: profile.displayName,
        tier: input.channel,
        basePrice: input.price || 0,
        currency: 'THB',
        tags: [input.channel, 'New'],
        variants: [
          {
            id: 'v1',
            label: 'มาตรฐาน',
            price: input.price || 0,
            stock: 10,
          },
        ],
      },
    };
    set((state) => ({ items: [newItem, ...state.items] }));
  },
  openProductSheet: (productId) => set({ activeProductId: productId }),
  closeProductSheet: () => set({ activeProductId: null }),
  openComments: (feedId) => set({ activeCommentsFeedId: feedId }),
  closeComments: () => set({ activeCommentsFeedId: null }),
  addComment: (feedId, text, author = 'คุณ', authorInitial = 'ค') =>
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
      };
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
}));
