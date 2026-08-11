import { create } from 'zustand';
import {
  DEFAULT_OVERLAY_TRANSFORM,
  type OverlayTransform,
} from '@/modules/create/domain/overlay';

type CreateDraftState = {
  uri: string | null;
  type: 'image' | 'video';
  /** true = ข้อความ/ฟิลเตอร์ถูก bake เข้าไฟล์แล้ว — อย่ารีเรนเดอร์ overlay ทับอีก */
  baked: boolean;
  overlayText: string;
  overlayColor: string;
  overlayTransform: OverlayTransform;
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
  setDraft: (patch: Partial<Omit<CreateDraftState, 'setDraft' | 'clear'>>) => void;
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
  filter: 'none',
  sticker: '',
  music: '',
  musicArtist: '',
  musicUri: '',
  musicTrackId: '',
  musicVideoUri: '',
  musicMediaKind: '',
  setDraft: (patch) => set((s) => ({ ...s, ...patch })),
  clear: () =>
    set({
      uri: null,
      type: 'image',
      baked: false,
      overlayText: '',
      overlayColor: '#FFFFFF',
      overlayTransform: { ...DEFAULT_OVERLAY_TRANSFORM },
      filter: 'none',
      sticker: '',
      music: '',
      musicArtist: '',
      musicUri: '',
      musicTrackId: '',
      musicVideoUri: '',
      musicMediaKind: '',
    }),
}));
