/**
 * Content Feed Service facade + safety hooks (downrank / hide via Trust & Safety).
 */

import {
  getFeedConfig,
  previewFeed,
  rankFeed,
  saveFeedConfig,
} from '../../services/feed/FeedRankingService';

export async function contentFeedDomainStatus() {
  const cfg = await getFeedConfig();
  return {
    domain: 'content-feed',
    personalizationPct: 75,
    systemSignalsPct: 25,
    downrankReported: cfg.downrankReported,
    hideOutOfStock: cfg.hideOutOfStock,
    geoProximityBoost: cfg.geoProximityBoost,
    safetyIntegration: true,
    policy: 'Feed ranking must respect Trust & Safety downrank/hide signals',
  };
}

export { getFeedConfig, previewFeed, rankFeed, saveFeedConfig };
