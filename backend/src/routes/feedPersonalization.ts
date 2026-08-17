import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getFeedConfig,
  getFeedPresets,
  postApplyFeedPreset,
  postFeedPreview,
  putFeedConfig,
} from '../controllers/PersonalizationController';

/**
 * Spec paths:
 *   PUT  /api/v1/admin/feed-config
 *   POST /api/v1/admin/feed-config/preset/:presetId
 *   POST /api/v1/admin/feed-config/preview
 * Also mounted under /api/v1/admin/feed for backward compatibility.
 */
export const feedPersonalizationRouter = Router();

feedPersonalizationRouter.use(requireAdmin);

feedPersonalizationRouter.get('/', getFeedConfig);
feedPersonalizationRouter.get('/config', getFeedConfig);
feedPersonalizationRouter.put('/', putFeedConfig);
feedPersonalizationRouter.put('/config', putFeedConfig);

feedPersonalizationRouter.get('/presets', getFeedPresets);
feedPersonalizationRouter.post('/preset/:presetId', postApplyFeedPreset);
feedPersonalizationRouter.post('/presets/:id/apply', postApplyFeedPreset);

feedPersonalizationRouter.post('/preview', postFeedPreview);
