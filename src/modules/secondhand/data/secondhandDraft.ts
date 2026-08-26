import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SecondhandDraftMedia } from '../state/secondhand-ui-store';

export const SECONDHAND_DRAFT_KEY = 'boommall-secondhand-draft-v1';

export type SavedSecondhandDraft = {
  media?: SecondhandDraftMedia[];
  coverIndex?: number;
  title?: string;
  description?: string;
  category?: string;
  condition?: string;
  price?: string;
  negotiable?: boolean;
  delivery?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  updatedAt?: string;
};

export async function readSecondhandDraft(): Promise<SavedSecondhandDraft | null> {
  const raw = await AsyncStorage.getItem(SECONDHAND_DRAFT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as SavedSecondhandDraft; } catch { return null; }
}

export function writeSecondhandDraft(draft: SavedSecondhandDraft) {
  return AsyncStorage.setItem(SECONDHAND_DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
}

export function deleteSecondhandDraft() {
  return AsyncStorage.removeItem(SECONDHAND_DRAFT_KEY);
}
