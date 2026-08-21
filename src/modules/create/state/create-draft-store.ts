import { create } from 'zustand';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';
import type { OverlayTextSticker } from '@/modules/create/domain/overlayTextSticker';
import type { EditorMedia, OverlayObject } from '@/modules/create/domain/editorComposition';

type CreateDraftState = {
  uri: string | null;
  type: 'image' | 'video';
  /** true = ข้อความ/ฟิลเตอร์ถูก bake เข้าไฟล์แล้ว — อย่ารีเรนเดอร์ overlay ทับอีก */
  baked: boolean;
  overlayText: string;
  overlayColor: string;
  overlayTransform: OverlayTransform;
  /** ข้อความหลายชิ้น (Text Stickers) — ส่งต่อไปยัง publish/export ครบทุกชิ้น */
  overlayStickers: OverlayTextSticker[];
  filter: string;
  sticker: string;
  music: string;
  /** Optional artist / uri from Listen Mode “ใช้เสียงนี้” */
  musicArtist: string;
  musicUri: string;
  musicTrackId: string;
  /** When sound comes from a music video upload */
  musicVideoUri: string;
  musicMediaKind: '' | 'audio' | 'video';
  /** When set, publish flow updates this feed item instead of creating a new post. */
  editFeedId: string | null;
  /** Multi-image carousel (publish step). */
  mediaUris: string[];
  /** Canonical editor composition. Legacy fields above remain read adapters only. */
  media: EditorMedia[];
  overlays: OverlayObject[];
  activeMediaId: string | null;
  publishTitle: string;
  publishDescription: string;
  publishLocation: string | null;
  publishLinkLabel: string | null;
  setDraft: (patch: Partial<Omit<CreateDraftState, 'setDraft' | 'clear'>>) => void;
  setMedia: (media: EditorMedia[]) => void;
  setActiveMediaId: (mediaId: string) => void;
  setOverlays: (overlays: OverlayObject[]) => void;
  replaceActiveMediaUri: (uri: string) => void;
  clear: () => void;
};

/** สถานะระหว่างหน้าแต่ง → พรีวิวโพสต์ (กันข้อความ/ตำแหน่งหาย) */
export const useCreateDraftStore = create<CreateDraftState>((set) => ({
  uri: null,
  type: 'image',
  baked: false,
  overlayText: '',
  overlayColor: '#FFFFFF',
  overlayTransform: { ...DEFAULT_OVERLAY_TRANSFORM },
  overlayStickers: [],
  filter: 'none',
  sticker: '',
  music: '',
  musicArtist: '',
  musicUri: '',
  musicTrackId: '',
  musicVideoUri: '',
  musicMediaKind: '',
  editFeedId: null,
  mediaUris: [],
  media: [],
  overlays: [],
  activeMediaId: null,
  publishTitle: '',
  publishDescription: '',
  publishLocation: null,
  publishLinkLabel: null,
  setDraft: (patch) => set((s) => ({ ...s, ...patch })),
  setMedia: (media) => set((state) => ({
    media,
    activeMediaId: media.some((item) => item.id === state.activeMediaId)
      ? state.activeMediaId
      : media[0]?.id ?? null,
    mediaUris: media.map((item) => item.uri),
    uri: media[0]?.uri ?? null,
    type: media[0]?.type ?? state.type,
  })),
  setActiveMediaId: (activeMediaId) => set({ activeMediaId }),
  setOverlays: (overlays) => set({ overlays }),
  replaceActiveMediaUri: (uri) => set((state) => {
    const activeMediaId = state.activeMediaId ?? state.media[0]?.id;
    const media = state.media.map((item) => item.id === activeMediaId ? { ...item, uri } : item);
    return {
      media,
      mediaUris: media.map((item) => item.uri),
      uri: media[0]?.uri ?? uri,
    };
  }),
  clear: () =>
    set({
      uri: null,
      type: 'image',
      baked: false,
      overlayText: '',
      overlayColor: '#FFFFFF',
      overlayTransform: { ...DEFAULT_OVERLAY_TRANSFORM },
      overlayStickers: [],
      filter: 'none',
      sticker: '',
      music: '',
      musicArtist: '',
      musicUri: '',
      musicTrackId: '',
      musicVideoUri: '',
      musicMediaKind: '',
      editFeedId: null,
      mediaUris: [],
      media: [],
      overlays: [],
      activeMediaId: null,
      publishTitle: '',
      publishDescription: '',
      publishLocation: null,
      publishLinkLabel: null,
    }),
}));
