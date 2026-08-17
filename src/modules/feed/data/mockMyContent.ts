import type { FeedItem } from '../domain/types';

/** Profile grid is live-only — no simulated “my posts”. */
export const mockMyContent: FeedItem[] = [];

export const SEED_LIKED_IDS = new Set<string>();
export const SEED_SAVED_IDS = new Set<string>();
