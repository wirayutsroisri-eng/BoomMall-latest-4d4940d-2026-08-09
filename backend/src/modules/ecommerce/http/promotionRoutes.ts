import { Router } from 'express';
import { requireAdmin, requirePermission } from '../../../middleware/adminAuth';
import type { AuthedRequest } from '../../../middleware/adminAuth';
import { requireUserOrDevHeader } from '../../../middleware/userAuth';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import {
  createPromotion,
  listPackages,
  listPromotions,
  listSellerNotifications,
  markNotificationsRead,
  updatePromotionStatus,
  type AdStatus,
} from '../ProductPromotionService';

const FILTER_TO_STATUS: Record<string, AdStatus | AdStatus[] | undefined> = {
  pending: 'pending_review',
  pending_review: 'pending_review',
  active: 'active',
  expired: 'expired',
  rejected: 'rejected',
  stopped: 'stopped',
  all: undefined,
};

export const sellerPromotionRouter = Router();

sellerPromotionRouter.get('/packages', (_req, res) => {
  res.json({ ok: true, data: listPackages() });
});

sellerPromotionRouter.post('/create', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const userId = req.user?.sub ?? '';
    const data = await createPromotion({
      userId,
      productId: String(body.productId ?? body.product_id ?? ''),
      productTitle: String(body.productTitle ?? body.product_title ?? ''),
      shopName: body.shopName ?? body.shop_name ? String(body.shopName ?? body.shop_name) : undefined,
      productImageUrl: body.productImageUrl ?? body.product_image_url
        ? String(body.productImageUrl ?? body.product_image_url)
        : undefined,
      productMediaType: body.productMediaType ?? body.product_media_type
        ? String(body.productMediaType ?? body.product_media_type)
        : undefined,
      packageType: String(body.packageType ?? body.package_type ?? ''),
      paymentProofUrl: body.paymentProofUrl ?? body.payment_proof_url
        ? String(body.paymentProofUrl ?? body.payment_proof_url)
        : undefined,
      transactionId: body.transactionId ?? body.transaction_id
        ? String(body.transactionId ?? body.transaction_id)
        : undefined,
    });
    res.status(201).json({
      ok: true,
      data,
      message: 'ส่งคำขอแล้ว รอแอดมินตรวจสอบ — โฆษณายังไม่เริ่มจนกว่าจะได้รับอนุมัติ',
    });
  } catch (e) {
    next(e);
  }
});

sellerPromotionRouter.get('/mine', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const userId = req.user?.sub ?? '';
    const productId = req.query.productId ? String(req.query.productId) : undefined;
    res.json({ ok: true, data: await listPromotions({ userId, productId }) });
  } catch (e) {
    next(e);
  }
});

sellerPromotionRouter.get(
  '/notifications',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const userId = req.user?.sub ?? '';
      const unreadOnly = String(req.query.unread ?? '') === '1';
      res.json({ ok: true, data: await listSellerNotifications(userId, unreadOnly) });
    } catch (e) {
      next(e);
    }
  },
);

sellerPromotionRouter.post(
  '/notifications/read',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const userId = req.user?.sub ?? '';
      const ids = Array.isArray(req.body?.ids)
        ? (req.body.ids as unknown[]).map((id) => String(id))
        : undefined;
      res.json({ ok: true, data: await markNotificationsRead(userId, ids) });
    } catch (e) {
      next(e);
    }
  },
);

export const adminPromotionRouter = Router();

adminPromotionRouter.use(requireAdmin);

adminPromotionRouter.get('/', requirePermission('ads:read'), async (req, res, next) => {
  try {
    const raw = String(req.query.filter ?? req.query.adStatus ?? req.query.ad_status ?? 'all');
    const mapped = FILTER_TO_STATUS[raw] ?? (raw as AdStatus);
    const adStatus = raw === 'all' ? undefined : mapped;
    res.json({
      ok: true,
      data: await listPromotions({
        adStatus: adStatus as AdStatus | AdStatus[] | undefined,
      }),
    });
  } catch (e) {
    next(e);
  }
});

adminPromotionRouter.patch(
  '/:id/status',
  requirePermission('ads:write'),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const body = req.body ?? {};
      const extraDays =
        body.extraDays != null || body.extra_days != null
          ? Number(body.extraDays ?? body.extra_days)
          : undefined;
      res.json({
        ok: true,
        data: await updatePromotionStatus({
          id: String(id),
          action: body.action,
          adStatus: body.adStatus ?? body.ad_status,
          rejectReason: body.rejectReason ?? body.reject_reason,
          extraDays: Number.isFinite(extraDays) ? extraDays : undefined,
          paymentStatus: body.paymentStatus ?? body.payment_status,
          adminNote: body.adminNote ?? body.admin_note,
          actor: req.adminActor,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);
