import { Router } from 'express';
import { requireUserOrDevHeader, type UserAuthedRequest } from '../../../middleware/userAuth';
import { confirmMediaAsset, createMediaAssetUploadSession } from '../MediaAssetService';

export const mediaAssetRouter = Router();

mediaAssetRouter.post('/upload-session', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const type = String(body.type ?? '');
    const data = await createMediaAssetUploadSession(req.user!.sub, {
      type: type as 'image' | 'video',
      filename: String(body.filename ?? 'media'),
      mimeType: String(body.mimeType ?? ''),
      width: body.width != null ? Number(body.width) : undefined,
      height: body.height != null ? Number(body.height) : undefined,
      duration: body.duration != null ? Number(body.duration) : undefined,
      fileSize: body.fileSize != null ? Number(body.fileSize) : undefined,
    });
    res.status(201).json({ ok: true, data });
  } catch (error) {
    next(error);
  }
});

mediaAssetRouter.post('/:id/confirm', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({ ok: true, data: await confirmMediaAsset(req.user!.sub, String(id)) });
  } catch (error) {
    next(error);
  }
});
