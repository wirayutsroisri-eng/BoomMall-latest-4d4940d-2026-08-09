import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVaultStore } from '@/modules/vault/state/vault-store';
import { useLoyaltyStore } from '@/modules/loyalty/state/loyalty-store';
import { useAuthStore } from '@/modules/auth/state/auth-store';
import { CHANTHABURI } from '@/modules/matching/domain/geo';
import { runPostMatching } from '@/modules/matching/domain/run-post-matching';
import { fetchFeedPosts, publishSocialPost, syncFeedComment, fetchFeedComments, syncFeedPostUpdate, syncFeedPostDelete } from '@/modules/feed/data/feedEngageApi';
import type { SocialCommentDto } from '@/modules/feed/data/feedEngageApi';
import { mergeFeedItems, socialCommentToFeedComment, socialPostToFeedItem } from '@/modules/feed/data/mapSocialPost';
import { sanitizeMusicTitle, stripFakeMusicCaption } from '@/modules/feed/domain/feedMusic';
import { isLiveUgcFeedItem, keepPersistedFeedItems } from '@/modules/feed/domain/isLiveUgcFeedItem';
import { uploadFeedMedia } from '@/modules/feed/data/uploadFeedMedia';
import { persistCreateMedia } from '@/modules/create/data/persistCreateMedia';
import {
  DEFAULT_SEARCH_RADIUS,
  type SearchRadiusOption,
} from '@/modules/matching/domain/search-radius';
import type { BoardSide, CommerceTier, FeedComment, FeedItem, FeedTab } from '../domain/types';
import type { MediaAsset } from '@/modules/media/domain/mediaAsset';

type NewPostInput = {
  /** Stable across retries from one composer session; server uses it to deduplicate. */
  clientPostId?: string;
  caption: string;
  price: number;
  channel: CommerceTier;
  imageUri?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageUris?: string[];
  videoUri?: string;
  editorMedia?: FeedItem['editorMedia'];
  overlays?: FeedItem['overlays'];
  overlayText?: string;
  overlayTextColor?: string;
  overlayTransform?: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
  /** ข้อความหลายชิ้น (Text Stickers) — ส่งต่อไปยัง export/composite ครบทุกชิ้น */
  overlayStickers?: FeedItem['overlayStickers'];
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
  locationLabel?: string;
};

function replaceEditorMediaUris(
  media: FeedItem['editorMedia'],
  imageUris: string[] | undefined,
  videoUri: string | undefined,
): FeedItem['editorMedia'] {
  if (!media?.length) return media;
  let imageIndex = 0;
  return media.map((item) => {
    const uri = item.type === 'video'
      ? videoUri ?? item.uri
      : imageUris?.[imageIndex++] ?? item.uri;
    return uri === item.uri ? item : { ...item, uri };
  });
}

function bindCompositionToMediaAssets(
  media: FeedItem['editorMedia'],
  overlays: FeedItem['overlays'],
  bindings: { sourceUri: string; asset: MediaAsset }[],
  imageUris: string[],
  videoUri: string | undefined,
) {
  if (!media?.length || !bindings.length) {
    return { editorMedia: replaceEditorMediaUris(media, imageUris, videoUri), overlays };
  }
  const idMap = new Map<string, string>();
  const editorMedia = media.map((item) => {
    const asset = bindings.find((binding) => binding.sourceUri === item.uri)?.asset;
    if (!asset) return item;
    idMap.set(item.id, asset.id);
    return {
      ...item,
      id: asset.id,
      mediaAssetId: asset.id,
      uri: asset.type === 'video' ? asset.playbackUrl || asset.canonicalUrl : asset.canonicalUrl,
      width: asset.width ?? item.width,
      height: asset.height ?? item.height,
    };
  });
  return {
    editorMedia,
    overlays: overlays?.map((overlay) => {
      const mediaId = idMap.get(overlay.mediaId);
      return mediaId ? { ...overlay, mediaId } : overlay;
    }),
  };
}

type FeedState = {
  /** Owner of account-scoped persisted state. Null also forces one-time cleanup of legacy caches. */
  accountOwnerId: string | null;
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
  addPost: (input: NewPostInput) => Promise<string>;
  updatePost: (feedId: string, input: NewPostInput) => Promise<boolean>;
  deletePost: (feedId: string) => Promise<boolean>;
  renameOwnPosts: (displayName: string) => void;
  openProductSheet: (productId: string) => void;
  closeProductSheet: () => void;
  openComments: (feedId: string) => void;
  closeComments: () => void;
  openTip: (feedId: string) => void;
  closeTip: () => void;
  addComment: (feedId: string, text: string, author?: string, authorInitial?: string, parentId?: string) => void;
  updateComment: (feedId: string, commentId: string, text: string) => void;
  deleteComment: (feedId: string, commentId: string) => void;
  loadComments: (feedId: string) => Promise<boolean>;
  toggleCommentLike: (feedId: string, commentId: string) => void;
  openCreatorProfile: (handle: string, feedId?: string) => void;
  closeCreatorProfile: () => void;
  hydrateFromServer: () => Promise<void>;
  switchAccount: (userId: string | null) => boolean;
};

let commentSeq = 1000;

export const useFeedStore = create<FeedState>()(
  persist(
    (set, get) => ({
  tab: 'foryou',
  accountOwnerId: null,
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
  addPost: async (input) => {
    const profile = useLoyaltyStore.getState().profile;
    const auth = useAuthStore.getState().user;
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
      authorId: auth?.id,
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
      editorMedia: input.editorMedia,
      overlays: input.overlays,
      overlayText: input.overlayText?.trim() || undefined,
      overlayTextColor: input.overlayTextColor,
      overlayTransform: input.overlayTransform,
      overlayStickers: input.overlayStickers,
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

    try {
      let stableImages = imageUris;
      let stableVideo = input.videoUri;
      try {
        if (imageUris?.length) {
          stableImages = await Promise.all(
            imageUris.map((uri) => persistCreateMedia(uri, 'image')),
          );
        }
        if (input.videoUri) {
          stableVideo = await persistCreateMedia(input.videoUri, 'video');
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.id !== id
              ? item
              : {
                  ...item,
                  imageUri: stableImages?.[0] ?? item.imageUri,
                  imageUris: stableImages ?? item.imageUris,
                  videoUri: stableVideo ?? item.videoUri,
                  editorMedia: replaceEditorMediaUris(item.editorMedia, stableImages, stableVideo),
                },
          ),
        }));
      } catch {
        /* keep optimistic URIs */
      }

      const stableEditorMedia = replaceEditorMediaUris(newItem.editorMedia, stableImages, stableVideo);

      const uploaded = await uploadFeedMedia({
        imageUris: stableImages,
        videoUri: stableVideo,
        editorMedia: stableEditorMedia,
      });
      const invalidRemoteUri = [...uploaded.imageUris, uploaded.videoUri]
        .filter((uri): uri is string => Boolean(uri))
        .find((uri) => !/^https?:\/\//i.test(uri));
      if (invalidRemoteUri) throw new Error('POST_MEDIA_MUST_USE_REMOTE_URL');
      const uploadedComposition = bindCompositionToMediaAssets(
        stableEditorMedia,
        newItem.overlays,
        uploaded.bindings,
        uploaded.imageUris,
        uploaded.videoUri,
      );
      const uploadedEditorMedia = uploadedComposition.editorMedia;
      const saved = await publishSocialPost({
        body: caption,
        media: {
          clientPostId: input.clientPostId,
          images: uploaded.imageUris,
          video: uploaded.videoUri,
          musicTitle: newItem.musicTitle,
          overlayText: newItem.overlayText,
          overlayTextColor: newItem.overlayTextColor,
          overlayTransform: newItem.overlayTransform,
          editorMedia: uploadedEditorMedia,
          overlays: uploadedComposition.overlays,
          mediaAssetIds: uploaded.mediaAssets.map((asset) => asset.id),
          mediaAssets: uploaded.mediaAssets,
          authorName: author,
          authorHandle,
        },
        lat: gps.lat,
        lng: gps.lng,
        locationLabel: newItem.location,
        tags: newItem.product.tags,
        lane: newItem.lane,
      });
      if (!saved) throw new Error('FEED_PUBLISH_FAILED');
      const auth = useAuthStore.getState().user;
      set((state) => {
        const migrated = state.commentsByFeedId[id] ?? [];
        const nextComments = { ...state.commentsByFeedId };
        delete nextComments[id];
        const serverId = saved?.id;
        if (serverId && serverId !== id && migrated.length) {
          nextComments[serverId] = [
            ...(nextComments[serverId] ?? []),
            ...migrated.map((c) => ({ ...c, feedId: serverId })),
          ];
        }
        return {
          commentsByFeedId: nextComments,
          items: state.items.map((item) => {
            if (item.id !== id) return item;
            const next = {
                  ...item,
                  ...socialPostToFeedItem(saved, {
                    myUserId: auth?.id,
                    myHandle: authorHandle,
                  }),
                  legacyLocalId: id,
                  isUserPost: true,
                };
            return {
              ...next,
              imageUri: uploaded.imageUris[0] ?? next.imageUri,
              imageUris: uploaded.imageUris.length ? uploaded.imageUris : next.imageUris,
              videoUri: uploaded.videoUri ?? next.videoUri,
              editorMedia: uploadedEditorMedia ?? next.editorMedia,
              mediaAssets: uploaded.mediaAssets.length ? uploaded.mediaAssets : next.mediaAssets,
              overlays: next.overlays?.length ? next.overlays : uploadedComposition.overlays,
            };
          }),
        };
      });
      console.info('[POST_FLOW] feed updated', { postId: saved.id });
      const refetchedRows = await fetchFeedPosts(newItem.lane);
      const refetched = refetchedRows.find((row) => row.id === saved.id);
      if (refetched) {
        const refetchedItem = socialPostToFeedItem(refetched, {
          myUserId: auth?.id,
          myHandle: authorHandle,
        });
        set((state) => ({
          items: state.items.map((item) => item.id === saved.id ? { ...refetchedItem, isUserPost: true } : item),
        }));
        console.info('[POST_MEDIA] server post refetched', { postId: saved.id });
      } else {
        console.error('[POST_FLOW_ERROR]', {
          step: 'server-post-refetch',
          message: 'SERVER_POST_REFETCH_FAILED',
          postId: saved.id,
        });
      }
    } catch (error) {
      set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
      throw error;
    }

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
  updatePost: async (feedId, input) => {
    const existing = get().items.find((item) => item.id === feedId);
    if (!existing?.isUserPost) return false;

    const profile = useLoyaltyStore.getState().profile;
    const authorHandle = profile.handle.replace(/^@/, '');
    const imageUris =
      input.imageUris?.filter(Boolean) ??
      (input.imageUri ? [input.imageUri] : undefined);
    const caption = input.caption || existing.caption;
    const musicTitle = sanitizeMusicTitle(input.musicTitle ?? existing.musicTitle ?? '');

    set((state) => ({
      items: state.items.map((item) => {
        if (item.id !== feedId) return item;
        return {
          ...item,
          caption,
          musicTitle,
          imageUri: imageUris?.[0] ?? input.imageUri ?? item.imageUri,
          imageUris: imageUris ?? item.imageUris,
          videoUri: input.videoUri ?? item.videoUri,
          editorMedia: input.editorMedia ?? item.editorMedia,
          overlays: input.overlays ?? item.overlays,
          overlayText: input.overlayText?.trim() || undefined,
          overlayTextColor: input.overlayTextColor,
          overlayTransform: input.overlayTransform,
          overlayStickers: input.overlayStickers,
          location: input.locationLabel ?? item.location,
          imageWidth: input.imageWidth ?? item.imageWidth,
          imageHeight: input.imageHeight ?? item.imageHeight,

        };
      }),
    }));

    try {
      let stableImages = imageUris;
      let stableVideo = input.videoUri ?? existing.videoUri;
      try {
        if (imageUris?.length) {
          stableImages = await Promise.all(
            imageUris.map((uri) => persistCreateMedia(uri, 'image')),
          );
        }
        if (stableVideo) {
          stableVideo = await persistCreateMedia(stableVideo, 'video');
        }
        set((state) => ({
          items: state.items.map((item) =>
            item.id !== feedId
              ? item
              : {
                  ...item,
                  imageUri: stableImages?.[0] ?? item.imageUri,
                  imageUris: stableImages ?? item.imageUris,
                  videoUri: stableVideo ?? item.videoUri,
                  editorMedia: replaceEditorMediaUris(item.editorMedia, stableImages, stableVideo),
                },
          ),
        }));
      } catch {
        /* keep optimistic URIs */
      }

      const stableEditorMedia = replaceEditorMediaUris(
        input.editorMedia ?? existing.editorMedia,
        stableImages,
        stableVideo,
      );

      const uploaded = await uploadFeedMedia({
        imageUris: stableImages,
        videoUri: stableVideo,
        editorMedia: stableEditorMedia,
      });
      const uploadedComposition = bindCompositionToMediaAssets(
        stableEditorMedia,
        input.overlays ?? existing.overlays,
        uploaded.bindings,
        uploaded.imageUris,
        uploaded.videoUri,
      );
      const uploadedEditorMedia = uploadedComposition.editorMedia;
      const saved = await syncFeedPostUpdate(feedId, {
        body: caption,
        media: {
          images: uploaded.imageUris,
          video: uploaded.videoUri,
          musicTitle,
          overlayText: input.overlayText,
          overlayTextColor: input.overlayTextColor,
          overlayTransform: input.overlayTransform,
          editorMedia: uploadedEditorMedia,
          overlays: uploadedComposition.overlays,
          mediaAssetIds: uploaded.mediaAssets.map((asset) => asset.id),
          mediaAssets: uploaded.mediaAssets,
          authorName: profile.displayName,
          authorHandle,
        },
        lat: existing.gps?.lat ?? CHANTHABURI.lat,
        lng: existing.gps?.lng ?? CHANTHABURI.lng,
        locationLabel: input.locationLabel ?? existing.location,
        tags: existing.product.tags,
        lane: existing.lane ?? 'foryou',
      });
      if (!saved) throw new Error('FEED_UPDATE_FAILED');
      const authUser = useAuthStore.getState().user;
      set((state) => ({
        items: state.items.map((item) => {
          if (item.id !== feedId) return item;
          const mapped = socialPostToFeedItem(saved, {
            myUserId: authUser?.id,
            myHandle: authorHandle,
          });
          return {
            ...item,
            ...mapped,
            isUserPost: true,
            imageUri: uploaded.imageUris[0] ?? mapped.imageUri ?? item.imageUri,
            imageUris: uploaded.imageUris.length ? uploaded.imageUris : mapped.imageUris ?? item.imageUris,
            videoUri: uploaded.videoUri ?? mapped.videoUri ?? item.videoUri,
            editorMedia: uploadedEditorMedia ?? mapped.editorMedia ?? item.editorMedia,
            mediaAssets: uploaded.mediaAssets.length ? uploaded.mediaAssets : mapped.mediaAssets ?? item.mediaAssets,
            overlays: mapped.overlays?.length ? mapped.overlays : uploadedComposition.overlays ?? item.overlays,
            likes: item.likes,
            comments: item.comments,
            shares: item.shares,
            tips: item.tips,
            myTipTotal: item.myTipTotal,
            liked: item.liked,
            saved: item.saved,
          };
        }),
      }));
    } catch (error) {
      set((state) => ({
        items: state.items.map((item) => item.id === feedId ? existing : item),
      }));
      throw error;
    }

    return true;
  },
  deletePost: async (feedId) => {
    const before = get();
    const existingIndex = before.items.findIndex((item) => item.id === feedId);
    const existing = before.items[existingIndex];
    if (!existing?.isUserPost) return false;

    const removedComments = before.commentsByFeedId[feedId];
    const removedLegacyComments = existing.legacyLocalId
      ? before.commentsByFeedId[existing.legacyLocalId]
      : undefined;

    set((state) => {
      const nextComments = { ...state.commentsByFeedId };
      delete nextComments[feedId];
      if (existing.legacyLocalId) delete nextComments[existing.legacyLocalId];

      return {
        items: state.items.filter((item) => item.id !== feedId),
        commentsByFeedId: nextComments,
        activeCommentsFeedId:
          state.activeCommentsFeedId === feedId ? null : state.activeCommentsFeedId,
        activeTipFeedId: state.activeTipFeedId === feedId ? null : state.activeTipFeedId,
      };
    });

    const deleted = await syncFeedPostDelete(feedId);
    if (deleted) {
      useVaultStore.getState().removeItemByRef(feedId);
      return true;
    }

    // The server is authoritative. Put the exact record back if DELETE failed,
    // while preserving posts/comments that may have arrived during the request.
    set((state) => {
      if (state.items.some((item) => item.id === feedId)) return state;
      const items = [...state.items];
      items.splice(Math.min(existingIndex, items.length), 0, existing);
      const commentsByFeedId = { ...state.commentsByFeedId };
      if (removedComments) commentsByFeedId[feedId] = removedComments;
      if (existing.legacyLocalId && removedLegacyComments) {
        commentsByFeedId[existing.legacyLocalId] = removedLegacyComments;
      }
      return {
        items,
        commentsByFeedId,
        activeCommentsFeedId: before.activeCommentsFeedId,
        activeTipFeedId: before.activeTipFeedId,
      };
    });
    return false;
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
  addComment: (feedId, text, author = 'คุณ', authorInitial = 'ค', parentId) => {
    commentSeq += 1;
    const tempId = `cm-${commentSeq}`;
    const authorId = useAuthStore.getState().user?.id;
    const profileName = useLoyaltyStore.getState().profile.displayName;
    const comment: FeedComment = {
      id: tempId,
      feedId,
      author,
      authorInitial,
      authorId,
      text,
      likes: 0,
      createdAt: 'เมื่อสักครู่',
      parentId,
    };
    set((state) => ({
      commentsByFeedId: {
        ...state.commentsByFeedId,
        [feedId]: [...(state.commentsByFeedId[feedId] ?? []), comment],
      },
      items: state.items.map((item) =>
        item.id === feedId ? { ...item, comments: item.comments + 1 } : item,
      ),
    }));
    void (async () => {
      const saved = await syncFeedComment(feedId, text, parentId);
      if (!saved) return;
      const mapped = socialCommentToFeedComment(saved, feedId, {
        myUserId: authorId,
        myDisplayName: profileName,
      });
      set((state) => ({
        commentsByFeedId: {
          ...state.commentsByFeedId,
          [feedId]: (state.commentsByFeedId[feedId] ?? [])
            .filter((c) => c.id !== tempId)
            .concat(mapped),
        },
      }));
    })();
  },
  updateComment: (feedId, commentId, text) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) return state;
      return {
        commentsByFeedId: {
          ...state.commentsByFeedId,
          [feedId]: (state.commentsByFeedId[feedId] ?? []).map((c) =>
            c.id === commentId ? { ...c, text: trimmed, editedAt: 'แก้ไขแล้ว' } : c,
          ),
        },
      };
    }),
  deleteComment: (feedId, commentId) =>
    set((state) => {
      const list = state.commentsByFeedId[feedId] ?? [];
      const next = list.filter((c) => c.id !== commentId && c.parentId !== commentId);
      const removed = list.length - next.length;
      if (removed <= 0) return state;
      return {
        commentsByFeedId: {
          ...state.commentsByFeedId,
          [feedId]: next,
        },
        items: state.items.map((item) =>
          item.id === feedId
            ? { ...item, comments: Math.max(0, item.comments - removed) }
            : item,
        ),
      };
    }),
  loadComments: async (feedId) => {
    const auth = useAuthStore.getState().user;
    const profileName = useLoyaltyStore.getState().profile.displayName;
    const item = get().items.find((row) => row.id === feedId);
    const postIds = [feedId];
    if (item?.legacyLocalId && item.legacyLocalId !== feedId) {
      postIds.push(item.legacyLocalId);
    }

    const remoteRows: SocialCommentDto[] = [];
    const seen = new Set<string>();
    for (const postId of postIds) {
      const rows = await fetchFeedComments(postId);
      if (rows === null) return false;
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        remoteRows.push(row);
      }
    }

    const remote = remoteRows.map((row) =>
      socialCommentToFeedComment(row, feedId, {
        myUserId: auth?.id,
        myDisplayName: profileName,
      }),
    );

    set((state) => {
      const local = state.commentsByFeedId[feedId] ?? [];
      const remoteIds = new Set(remote.map((c) => c.id));
      const pendingLocal = local.filter((c) => {
        if (!c.id.startsWith('cm-')) return false;
        if (remoteIds.has(c.id)) return false;
        return !remote.some(
          (r) =>
            r.text === c.text &&
            r.authorId === c.authorId &&
            (r.parentId ?? null) === (c.parentId ?? null),
        );
      });
      const byId = new Map<string, FeedComment>();
      for (const c of [...remote, ...pendingLocal]) byId.set(c.id, c);
      const list = [...byId.values()].sort((a, b) => {
        const ta = a.createdAt === 'เมื่อสักครู่' ? Date.now() : 0;
        const tb = b.createdAt === 'เมื่อสักครู่' ? Date.now() : 0;
        return ta - tb;
      });

      return {
        commentsByFeedId: {
          ...state.commentsByFeedId,
          [feedId]: list,
        },
        items: state.items.map((row) =>
          row.id === feedId
            ? { ...row, comments: Math.max(row.comments, list.length, remote.length) }
            : row,
        ),
      };
    });
    return true;
  },
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
    if (!useFeedStore.persist.hasHydrated()) return;
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
  switchAccount: (userId) => {
    const nextOwnerId = userId?.trim() || null;
    if (get().accountOwnerId === nextOwnerId) return false;
    set({
      accountOwnerId: nextOwnerId,
      items: [],
      commentsByFeedId: {},
      activeProductId: null,
      activeCommentsFeedId: null,
      activeTipFeedId: null,
      activeCreatorHandle: null,
      activeCreatorFeedId: null,
    });
    return true;
  },
    }),
    {
      name: 'boommall-feed-v4',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        accountOwnerId: s.accountOwnerId,
        items: keepPersistedFeedItems(s.items).slice(0, 80),
        commentsByFeedId: Object.fromEntries(
          Object.entries(s.commentsByFeedId)
            .slice(0, 40)
            .map(([feedId, rows]) => [feedId, rows.slice(0, 120)]),
        ),
      }),
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
