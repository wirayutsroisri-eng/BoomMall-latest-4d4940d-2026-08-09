import type { Response } from 'express';
import type { AuthedRequest } from '../middleware/adminAuth';
import { AppError } from '../lib/errors';
import * as feed from '../services/feed/FeedRankingService';
import type { PersonalWeightKey } from '../services/feed/FeedRankingService';

function actor(req: AuthedRequest) {
  return req.adminActor ?? 'admin';
}

const LOCK_KEYS = new Set<PersonalWeightKey>([
  'interestMatchWeight',
  'watchTimeWeight',
  'freshnessWeight',
  'creatorDiversityWeight',
]);

/** GET /api/v1/admin/feed-config */
export async function getFeedConfig(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: await feed.getFeedConfig() });
}

/**
 * PUT /api/v1/admin/feed-config
 * Normalizes personalization weights to 75%, updates global config, flushes ranking cache.
 */
export async function putFeedConfig(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const lockedRaw = body.lockedKey ?? body.lockedWeight;
  const lockedKey =
    typeof lockedRaw === 'string' && LOCK_KEYS.has(lockedRaw as PersonalWeightKey)
      ? (lockedRaw as PersonalWeightKey)
      : undefined;

  const data = await feed.saveFeedConfig({
    ...body,
    lockedKey,
    actor: actor(req),
  });
  res.json({ ok: true, data });
}

/** GET /api/v1/admin/feed-config/presets */
export async function getFeedPresets(_req: AuthedRequest, res: Response) {
  res.json({ ok: true, data: await feed.listFeedPresets() });
}

/** POST /api/v1/admin/feed-config/preset/:presetId */
export async function postApplyFeedPreset(req: AuthedRequest, res: Response) {
  const id = Array.isArray(req.params.presetId)
    ? req.params.presetId[0]
    : req.params.presetId ?? (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!id) throw new AppError('VALIDATION', 'preset id required', 400);
  const data = await feed.applyFeedPreset({ presetId: String(id), actor: actor(req) });
  res.json({ ok: true, data });
}

/**
 * POST /api/v1/admin/feed-config/preview
 * Body: { userId?, sampleLocation?, config? (draft), lockedKey? }
 * Returns top 10 ranked items for unsaved draft.
 */
export async function postFeedPreview(req: AuthedRequest, res: Response) {
  const body = req.body ?? {};
  const lockedRaw = body.lockedKey;
  const lockedKey =
    typeof lockedRaw === 'string' && LOCK_KEYS.has(lockedRaw as PersonalWeightKey)
      ? (lockedRaw as PersonalWeightKey)
      : undefined;

  const data = await feed.previewFeed({
    config: body.config,
    lockedKey,
    userId: body.userId ? String(body.userId) : undefined,
    sampleLocation: body.sampleLocation
      ? String(body.sampleLocation)
      : body.viewer?.sampleLocation,
    viewer: body.viewer,
    limit: body.limit != null ? Number(body.limit) : 10,
  });
  res.json({ ok: true, data });
}
