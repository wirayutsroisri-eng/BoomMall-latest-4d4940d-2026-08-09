import { Router } from 'express';
import { requireUserOrDevHeader, type UserAuthedRequest } from '../../../middleware/userAuth';
import { requireAdmin, type AuthedRequest } from '../../../middleware/adminAuth';
import { getInterestProfile, suggestInterestTags, updateInterestProfile } from '../InterestProfileService';
import { recordBehaviorEvent } from '../BehaviorEventService';
import { getRecommendations, type RecommendationSurface } from '../RecommendationService';
import { getRecommendationConfig, resetRecommendationConfig, saveRecommendationConfig } from '../RecommendationConfigService';

export const recommendationAppRouter = Router();

recommendationAppRouter.get('/me/interests', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await getInterestProfile(req.user!.sub) }); } catch (error) { next(error); }
});
recommendationAppRouter.put('/me/interests', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await updateInterestProfile(req.user!.sub, req.body ?? {}) }); } catch (error) { next(error); }
});
recommendationAppRouter.get('/interest-suggestions', requireUserOrDevHeader, async (req, res, next) => {
  try { res.json({ ok: true, data: await suggestInterestTags(String(req.query.q ?? '')) }); } catch (error) { next(error); }
});
recommendationAppRouter.post('/events/behavior', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try { res.status(202).json({ ok: true, data: await recordBehaviorEvent(req.user!.sub, req.body ?? {}) }); } catch (error) { next(error); }
});
for (const surface of ['feed', 'products', 'secondhand', 'jobs', 'services'] as RecommendationSurface[]) {
  recommendationAppRouter.get(`/recommendations/${surface}`, requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
    try { res.json({ ok: true, data: await getRecommendations(req.user!.sub, surface, {
      limit: req.query.limit == null ? undefined : Number(req.query.limit), cursor: req.query.cursor ? String(req.query.cursor) : undefined,
    }) }); } catch (error) { next(error); }
  });
}

export const recommendationAdminRouter = Router();
recommendationAdminRouter.use(requireAdmin);
recommendationAdminRouter.get('/', async (_req, res, next) => { try { res.json({ ok: true, data: await getRecommendationConfig() }); } catch (e) { next(e); } });
recommendationAdminRouter.put('/', async (req: AuthedRequest, res, next) => { try { res.json({ ok: true, data: await saveRecommendationConfig(req.body ?? {}, req.adminActor ?? 'admin') }); } catch (e) { next(e); } });
recommendationAdminRouter.post('/reset-default', async (req: AuthedRequest, res, next) => { try { res.json({ ok: true, data: await resetRecommendationConfig(req.adminActor ?? 'admin') }); } catch (e) { next(e); } });
