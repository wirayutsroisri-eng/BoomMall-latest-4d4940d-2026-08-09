import { useChatStore } from '@/modules/chat/state/chat-store';
import type { JobMatchCard } from '@/modules/chat/domain/types';
import { useFeedStore } from '@/modules/feed/state/feed-store';
import type { BoardSide } from '@/modules/feed/domain/types';
import { notifyMatchedProviders } from '../data/matchingNotifyApi';
import { extractJobKeywords } from './extract-keywords';
import { CHANTHABURI } from './geo';
import { matchProviders } from './match-providers';
import { supplyPostsToProviders } from './match-supply';
import {
  formatSearchRadiusLabel,
  resolveSearchRadiusKm,
  type SearchRadiusOption,
} from './search-radius';
import type { GeoPoint, MatchingResult } from './types';

export type RunPostMatchingInput = {
  feedId: string;
  caption: string;
  author: string;
  authorHandle: string;
  gps?: GeoPoint;
  /** Preferred search radius from post creation (default 10 km). */
  searchRadius?: SearchRadiusOption | number | null;
  /** demand triggers provider scan; supply listings are match targets. */
  boardSide?: BoardSide;
};

const BOT_NAME = 'บูมบอท';
const BOT_INITIAL = 'บ';
const NOTIFY_BODY = '⚡ มีงานใหม่ใกล้คุณ! กดดูรายละเอียดเพื่อทักแชท';

function formatKm(km: number) {
  return km.toFixed(1);
}

function hitComment(count: number, searchRadius: SearchRadiusOption | number) {
  const radiusLabel = formatSearchRadiusLabel(searchRadius);
  return `🤖 บูมบอทตรวจพบผู้ให้บริการใกล้คุณ ${count} ราย ในรัศมี ${radiusLabel} ระบบส่งการ์ดงานไปทางแชทเรียบร้อยแล้วครับ!`;
}

const MISS_COMMENT =
  '🤖 บูมบอทกำลังเร่งค้นหาช่างในพื้นที่ให้ครับ หากมีช่างในรัศมีใกล้เคียงเข้ามา ระบบจะแจ้งเตือนทันที!';

/**
 * Community Board Smart Matching orchestrator (demand → supply cross-tab).
 * Keyword extract → GPS radius match → bot comment + DMs + server push to providers.
 */
export function runPostMatching(input: RunPostMatchingInput): MatchingResult | null {
  const side = input.boardSide ?? 'demand';
  // Supply cards are targets — matching runs when a Demand post is created.
  if (side === 'supply') return null;

  const extracted = extractJobKeywords(input.caption);
  if (extracted.skills.length === 0) return null;

  const postGps = input.gps ?? CHANTHABURI;
  const searchRadiusKm = resolveSearchRadiusKm(input.searchRadius);
  const authorKey = input.authorHandle.replace(/^@/, '').toLowerCase();

  const providers = supplyPostsToProviders(useFeedStore.getState().items).filter(
    (p) => p.handle.replace(/^@/, '').toLowerCase() !== authorKey,
  );
  const matched = matchProviders(postGps, extracted, providers, searchRadiusKm);
  const minDistanceKm =
    matched.length > 0 ? Math.min(...matched.map((m) => m.distanceKm)) : null;

  const result: MatchingResult = {
    feedId: input.feedId,
    extracted,
    matched,
    minDistanceKm,
    searchRadiusKm,
  };

  const feed = useFeedStore.getState();
  const chat = useChatStore.getState();

  if (matched.length === 0) {
    feed.addComment(input.feedId, MISS_COMMENT, BOT_NAME, BOT_INITIAL);
    return result;
  }

  feed.addComment(
    input.feedId,
    hitComment(matched.length, input.searchRadius ?? searchRadiusKm),
    BOT_NAME,
    BOT_INITIAL,
  );

  for (const item of matched) {
    const { provider, distanceKm, overlappingSkills } = item;
    const conversationId = chat.startConversationWithCreator(
      provider.name,
      provider.handle,
      provider.avatarColor,
    );

    const jobMatch: JobMatchCard = {
      id: `job-${input.feedId}-${provider.id}`,
      feedId: input.feedId,
      header: `📌 จับคู่งานด่วนใกล้คุณ (${formatKm(distanceKm)} กม.)`,
      details: input.caption,
      distanceKm,
      skills: overlappingSkills.length > 0 ? overlappingSkills : extracted.skills,
      actionLabel: 'ตอบรับงาน / ทักเสนอราคา',
    };

    chat.sendJobMatchCard(conversationId, jobMatch);

    if (provider.userId) {
      void notifyMatchedProviders({
        userIds: [provider.userId],
        title: `⚡ มีงานใหม่ใกล้คุณ! (${formatKm(distanceKm)} กม.)`,
        body: NOTIFY_BODY,
        feedId: input.feedId,
        conversationId,
      }).catch(() => undefined);
    }
  }

  return result;
}
