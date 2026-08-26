import { Router } from 'express';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import { requireUserOrDevHeader } from '../../../middleware/userAuth';
import { AppError } from '../../../lib/errors';
import { createStory, deleteStory, listStoryFeed, listUserStories, markStoryViewed } from '../StoryService';

export const storyRouter = Router();
storyRouter.use(requireUserOrDevHeader);

storyRouter.post('/', async (req: UserAuthedRequest, res, next) => {
  try {
    res.status(201).json({ ok: true, data: await createStory(req.user!.sub, {
      mediaAssetId: String(req.body?.mediaAssetId ?? ''),
      thumbnailAssetId: req.body?.thumbnailAssetId ? String(req.body.thumbnailAssetId) : undefined,
      caption: req.body?.caption ? String(req.body.caption) : undefined,
      overlayJson: req.body?.overlayJson,
    }) });
  } catch (error) { next(error); }
});

storyRouter.get('/feed', async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await listStoryFeed(req.user!.sub) }); }
  catch (error) { next(error); }
});

storyRouter.get('/:userId', async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await listUserStories(String(req.params.userId), req.user!.sub) }); }
  catch (error) { next(error); }
});

storyRouter.post('/:storyId/view', async (req: UserAuthedRequest, res, next) => {
  try { res.json({ ok: true, data: await markStoryViewed(String(req.params.storyId), req.user!.sub) }); }
  catch (error) { next(error); }
});

storyRouter.delete('/:storyId', async (req: UserAuthedRequest, res, next) => {
  try {
    const deleted = await deleteStory(String(req.params.storyId), req.user!.sub);
    if (!deleted) throw new AppError('STORY_NOT_FOUND', 'Story not found or forbidden', 404);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
