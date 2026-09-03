import { Router } from 'express';
import { requireAdmin, requirePermission, adminHasPermission } from '../../../middleware/adminAuth';
import { AppError } from '../../../lib/errors';
import type { AuthedRequest } from '../../../middleware/adminAuth';
import { authedUserId, requireUserOrDevHeader } from '../../../middleware/userAuth';
import { prisma } from '../../../lib/prisma';
import type { UserAuthedRequest } from '../../../middleware/userAuth';
import {
  applyStockSale,
  commerceOpsStatus,
  createOrder,
  deleteCatalogProduct,
  getCatalogBundle,
  listCatalogBundles,
  listOrders,
  listSellers,
  payOrder,
  confirmPaidOrder,
  requestOrderReturn,
  resolveOrderReturn,
  getMerchantLedger,
  updateOrderShipping,
  syncCatalogBundles,
  upsertCatalogBundle,
  type CatalogBundle,
  type OrderLine,
} from '../CommerceService';
import { parseShippingJson } from '../shipping/addressMerge';
import {
  previewMergedShipments,
  printMergedLabels,
  renderMergedLabelsHtml,
} from '../shipping/ShipmentMergeService';
import { printPickList } from '../shipping/PickListPdfService';
import {
  applyCourierTrackingEvent,
  listTrackingEvents,
  verifyCourierSignature,
} from '../shipping/CourierWebhookService';
import { recordAnalyticsEvent, summarizeAnalytics } from '../EventService';
import { listActiveInventory, type AdPlacement } from '../AdInventoryService';
import { quoteOrderGp, resolveGpBps } from '../GpLedgerService';
import { createWeeklyPayoutBatch, getPlatformBooks, listPayoutBatches, markPayoutBatchPaid } from '../SettlementService';
import {
  cancelOrderBeforeShip,
  confirmOrderReceived,
  getPlatformRevenue,
  listAdminEscrows,
  markEscrowPaidOut,
  markOrderDisputed,
  processRefundAfterReturn,
  setStoreGpPercent,
  adminApproveWithdrawal,
} from '../../finance/services/EscrowService';
import { listPendingWithdrawals, rejectWithdrawal } from '../../finance/FinanceService';
import { getPlatformSettings, updatePlatformSettings } from '../../finance/services/PlatformSettingsService';
import { getAccountingPack } from '../../finance/services/AccountingPackService';
import {
  buildTaxReportBundle,
  exportTaxReport,
  parseReportPeriod,
  sendExportFile,
  type ReportFormat,
  type ReportKind,
} from '../../finance/services/TaxAccountingExportService';

export const commerceAppRouter = Router();
export const commerceAdminRouter = Router();

async function commerceOwner(req: UserAuthedRequest) {
  const userId = authedUserId(req);
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { shopId: true },
  });
  const shopId = profile?.shopId?.trim();
  if (!shopId) throw new AppError('SHOP_ID_REQUIRED', 'บัญชีนี้ยังไม่มีรหัสร้านค้า กรุณาเข้าสู่ระบบใหม่', 409);
  return { userId, shopId };
}

function asBundle(body: unknown): CatalogBundle {
  const raw = (body ?? {}) as Record<string, unknown>;
  const nested = raw.product && typeof raw.product === 'object' ? (raw as CatalogBundle) : null;
  if (nested) {
    return {
      product: (nested.product ?? {}) as Record<string, unknown>,
      variants: Array.isArray(nested.variants) ? nested.variants : [],
      stock: Array.isArray(nested.stock) ? nested.stock : [],
    };
  }
  return {
    product: raw,
    variants: Array.isArray(raw.variants) ? (raw.variants as CatalogBundle['variants']) : [],
    stock: Array.isArray(raw.stock) ? (raw.stock as CatalogBundle['stock']) : [],
  };
}

commerceAppRouter.get('/catalog', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const owner = await commerceOwner(req);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    res.json({
      ok: true,
      data: await listCatalogBundles({ ownerUserId: owner.userId, q, limit }),
    });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/catalog/:id', async (req, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const row = await getCatalogBundle(String(id));
    if (!row) {
      res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'product not found' } });
      return;
    }
    res.json({ ok: true, data: row });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.put('/catalog', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const bundle = asBundle(req.body);
    const owner = await commerceOwner(req);
    bundle.product = { ...bundle.product, ownerShopId: owner.shopId };
    const data = await upsertCatalogBundle(bundle, owner);
    await recordAnalyticsEvent({
      userId: req.user?.sub,
      name: 'catalog_upsert',
      entityType: 'product',
      entityId: String(data.product.id ?? ''),
    });
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post('/catalog/sync', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const bundles = Array.isArray(req.body?.products)
      ? (req.body.products as CatalogBundle[])
      : Array.isArray(req.body)
        ? (req.body as CatalogBundle[])
        : [];
    const owner = await commerceOwner(req);
    const owned = bundles.map(asBundle).map((bundle) => ({
      ...bundle,
      product: { ...bundle.product, ownerShopId: owner.shopId },
    }));
    const data = await syncCatalogBundles(owned, owner);
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.delete('/catalog/:id', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const owner = await commerceOwner(req);
    res.json({ ok: true, data: await deleteCatalogProduct(String(id), owner.userId) });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post('/orders', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const lines = (Array.isArray(body.lines) ? body.lines : []) as OrderLine[];
    const shipping = body.shipping ? parseShippingJson(body.shipping) : undefined;
    const data = await createOrder({
      buyerId: req.user?.sub ?? String(body.buyerId ?? ''),
      lines,
      shippingFeeThb: body.shippingFeeThb != null ? Number(body.shippingFeeThb) : undefined,
      shipping,
      paymentMethod: body.paymentMethod ? String(body.paymentMethod) : shipping?.paymentMethod,
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey) : undefined,
    });
    await recordAnalyticsEvent({
      userId: req.user?.sub,
      name: 'order_create',
      entityType: 'order',
      entityId: data.id,
      payload: { merchandiseThb: data.merchandiseThb },
    });
    res.status(201).json({ ok: true, data });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post('/orders/:id/pay', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await payOrder({
      orderId: String(id),
      actor: req.user?.sub ?? 'buyer',
      idempotencyKey: req.body?.idempotencyKey ? String(req.body.idempotencyKey) : undefined,
      sourceToken: req.body?.sourceToken ? String(req.body.sourceToken) : undefined,
    });
    await recordAnalyticsEvent({
      userId: req.user?.sub,
      name: 'purchase',
      entityType: 'order',
      entityId: data.id,
      payload: { merchandiseThb: data.merchandiseThb, pspRef: data.pspRef },
    });
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/orders', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    res.json({
      ok: true,
      data: await listOrders({ buyerId: req.user?.sub, limit: 80 }),
    });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.patch(
  '/orders/:id/shipping',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const body = req.body ?? {};
      res.json({
        ok: true,
        data: await updateOrderShipping({
          orderId: String(id),
          actor: req.user?.sub ?? 'seller',
          trackingNumber: body.trackingNumber ? String(body.trackingNumber) : undefined,
          shippingCarrier: body.shippingCarrier ? String(body.shippingCarrier) : undefined,
          shippingStatus: body.shippingStatus ? String(body.shippingStatus) : undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAppRouter.post('/events', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const result = await recordAnalyticsEvent({
      userId: req.user?.sub,
      name: String(body.name ?? ''),
      entityType: body.entityType ? String(body.entityType) : undefined,
      entityId: body.entityId ? String(body.entityId) : undefined,
      payload: body.payload,
    });
    const interestEvent = ({ product_view: 'PRODUCT_VIEWED', product_purchase: 'PRODUCT_PURCHASED', catalog_upsert: 'PRODUCT_LISTED' } as Record<string, string>)[String(body.name ?? '').toLowerCase()];
    if (interestEvent && req.user?.sub) {
      const { recordBehaviorEvent } = await import('../../recommendation/BehaviorEventService');
      await recordBehaviorEvent(req.user.sub, { eventType: interestEvent, contentId: body.entityId, contentType: 'PRODUCT', tags: body.payload?.tags ?? [], metadata: body.payload ?? {} });
    }
    res.json({
      ok: true,
      data: result,
    });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post(
  '/orders/:id/confirm',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const role = String(req.body?.role ?? 'buyer') === 'seller' ? 'seller' : 'buyer';
      if (role === 'buyer') {
        res.json({
          ok: true,
          data: await confirmOrderReceived(String(id), req.user?.sub ?? 'buyer'),
        });
        return;
      }
      res.json({
        ok: true,
        data: await confirmPaidOrder({
          orderId: String(id),
          actor: req.user?.sub ?? 'user',
          role,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAppRouter.post(
  '/orders/:id/return',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      res.json({
        ok: true,
        data: await requestOrderReturn({
          orderId: String(id),
          actor: req.user?.sub ?? 'buyer',
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAppRouter.post(
  '/orders/:id/return/resolve',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const decision = String(req.body?.decision ?? '') === 'reject' ? 'reject' : 'accept';
      if (decision === 'accept') {
        res.json({
          ok: true,
          data: await processRefundAfterReturn(String(id)),
        });
        return;
      }
      res.json({
        ok: true,
        data: await resolveOrderReturn({
          orderId: String(id),
          actor: req.user?.sub ?? 'seller',
          decision,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAppRouter.post(
  '/orders/:id/cancel',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      res.json({ ok: true, data: await cancelOrderBeforeShip(String(id)) });
    } catch (e) {
      next(e);
    }
  },
);

commerceAppRouter.post(
  '/orders/:id/dispute',
  requireUserOrDevHeader,
  async (req: UserAuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      await markOrderDisputed(String(id));
      res.json({ ok: true, data: await requestOrderReturn({ orderId: String(id), actor: req.user?.sub ?? 'buyer' }) });
    } catch (e) {
      next(e);
    }
  },
);

commerceAppRouter.get('/merchant/orders', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const merchantId = req.user?.shopId ?? (req.query.merchantId ? String(req.query.merchantId) : undefined);
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    res.json({
      ok: true,
      data: await listOrders({
        merchantId,
        status: req.query.status ? String(req.query.status) : undefined,
        limit: 200,
      }),
    });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/shipping/labels/preview', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const merchantId = req.user?.shopId ?? (req.query.merchantId ? String(req.query.merchantId) : undefined);
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    const orderIds = req.query.orderIds
      ? String(req.query.orderIds)
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    res.json({ ok: true, data: await previewMergedShipments(merchantId, orderIds) });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/shipping/labels/html', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const merchantId = req.user?.shopId ?? (req.query.merchantId ? String(req.query.merchantId) : undefined);
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    const orderIds = req.query.orderIds
      ? String(req.query.orderIds)
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined;
    const html = await renderMergedLabelsHtml({
      merchantId,
      orderIds,
      carrier: req.query.carrier ? String(req.query.carrier) : undefined,
      persist: false,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post('/shipping/labels/print', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const merchantId = req.user?.shopId ?? (body.merchantId ? String(body.merchantId) : undefined);
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.map((id: unknown) => String(id)).filter(Boolean)
      : undefined;
    const packingLines = Array.isArray(body.packingLines)
      ? body.packingLines.map((raw: unknown) => {
          const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
          return {
            title: typeof row.title === 'string' ? row.title : undefined,
            option: typeof row.option === 'string' ? row.option : undefined,
            sku: typeof row.sku === 'string' ? row.sku : undefined,
            qty: Number(row.qty ?? 0) || 0,
            unitPrice: Number(row.unitPrice ?? 0) || 0,
            productId: typeof row.productId === 'string' ? row.productId : undefined,
            imageUri: typeof row.imageUri === 'string' ? row.imageUri : undefined,
          };
        })
      : undefined;
    const file = await printMergedLabels({
      merchantId,
      orderIds,
      carrier: body.carrier ? String(body.carrier) : undefined,
      persist: body.persist !== false,
      packingLines,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-BoomMall-Label-Count', String(file.groups));
    res.setHeader('X-BoomMall-Order-Count', String(file.orders));
    res.send(file.buffer);
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post('/shipping/pick-list/print', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const merchantId = req.user?.shopId ?? (body.merchantId ? String(body.merchantId) : undefined);
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.map((id: unknown) => String(id)).filter(Boolean)
      : undefined;
    const lines = Array.isArray(body.lines)
      ? body.lines.map((raw: unknown) => {
          const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
          return {
            title: typeof row.title === 'string' ? row.title : undefined,
            option: typeof row.option === 'string' ? row.option : undefined,
            sku: typeof row.sku === 'string' ? row.sku : undefined,
            qty: Number(row.qty ?? 0) || 0,
            warehouseId: typeof row.warehouseId === 'string' ? row.warehouseId : undefined,
            orderId: typeof row.orderId === 'string' ? row.orderId : undefined,
            imageUri: typeof row.imageUri === 'string' ? row.imageUri : undefined,
          };
        })
      : undefined;
    const file = await printPickList({ merchantId, orderIds, lines });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-BoomMall-Pick-Sku', String(file.skuCount));
    res.setHeader('X-BoomMall-Pick-Pieces', String(file.pieceCount));
    res.setHeader('X-BoomMall-Order-Count', String(file.orderCount));
    res.send(file.buffer);
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post('/webhooks/courier', async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const events = Array.isArray(body.events) ? body.events : [body];
    const occurredAt = String(body.occurredAt ?? new Date().toISOString());
    const signature = String(req.header('x-courier-signature') ?? body.signature ?? '');
    const results = [];
    for (const raw of events) {
      const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const trackingNumber = String(row.trackingNumber ?? row.tracking ?? '');
      const event = String(row.event ?? row.status ?? '');
      const at = String(row.occurredAt ?? occurredAt);
      if (!verifyCourierSignature({ trackingNumber, event, occurredAt: at, signature })) {
        res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'invalid courier signature' } });
        return;
      }
      results.push(
        await applyCourierTrackingEvent({
          trackingNumber,
          event,
          occurredAt: at,
          carrier: row.carrier ? String(row.carrier) : undefined,
          payload: row,
        }),
      );
    }
    res.json({ ok: true, data: results });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.post('/shipping/tracking/simulate', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await applyCourierTrackingEvent({
        trackingNumber: String(body.trackingNumber ?? ''),
        event: String(body.event ?? ''),
        occurredAt: body.occurredAt ? String(body.occurredAt) : undefined,
        carrier: body.carrier ? String(body.carrier) : undefined,
        payload: { ...body, simulatedBy: req.user?.sub ?? 'seller' },
      }),
    });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/shipping/tracking/:trackingNumber', requireUserOrDevHeader, async (req, res, next) => {
  try {
    const trackingNumber = Array.isArray(req.params.trackingNumber)
      ? req.params.trackingNumber[0]
      : req.params.trackingNumber;
    res.json({ ok: true, data: await listTrackingEvents(String(trackingNumber ?? '')) });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/merchant/ledger', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const merchantId = req.user?.shopId ?? (req.query.merchantId ? String(req.query.merchantId) : undefined);
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    res.json({ ok: true, data: await getMerchantLedger(merchantId) });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/gp/rate', requireUserOrDevHeader, async (req: UserAuthedRequest, res, next) => {
  try {
    const merchantId = req.user?.shopId ?? (req.query.merchantId ? String(req.query.merchantId) : undefined);
    const channel = req.query.channel ? String(req.query.channel) : undefined;
    const amountThb = req.query.amountThb != null ? Number(req.query.amountThb) : 1000;
    const gpBps = await resolveGpBps({ merchantId, channel, amountThb });
    const quote = await quoteOrderGp({ amountThb, merchantId, channel, gpBps });
    res.json({
      ok: true,
      data: {
        gpBps,
        gpPercent: gpBps / 100,
        sampleAmountThb: Number(quote.amountThb),
        sampleGpAmountThb: Number(quote.gpAmountThb),
        sampleNetToMerchantThb: Number(quote.netToMerchantThb),
      },
    });
  } catch (e) {
    next(e);
  }
});

commerceAppRouter.get('/ads/serve', async (req, res, next) => {
  try {
    const placement = String(req.query.placement ?? 'SPONSORED_FEED') as AdPlacement;
    const geo = req.query.geo ? String(req.query.geo) : undefined;
    const channel = req.query.channel ? String(req.query.channel) : undefined;
    const data = await listActiveInventory(placement, { geo, channel });
    res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.use(requireAdmin);

commerceAdminRouter.get('/status', (_req, res) => {
  res.json({ ok: true, data: commerceOpsStatus() });
});

commerceAdminRouter.get('/catalog', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    res.json({
      ok: true,
      data: await listCatalogBundles({
        merchantId: req.query.merchantId ? String(req.query.merchantId) : undefined,
        includeHidden: true,
        limit: 400,
      }),
    });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/sellers', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listSellers() });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/orders', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    res.json({
      ok: true,
      data: await listOrders({
        status: req.query.status ? String(req.query.status) : undefined,
        limit: 120,
      }),
    });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/shipping/labels/preview', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    const merchantId = req.query.merchantId ? String(req.query.merchantId) : '';
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    res.json({ ok: true, data: await previewMergedShipments(merchantId) });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.post('/shipping/labels/print', requirePermission('marketplace:write'), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const merchantId = String(body.merchantId ?? '');
    if (!merchantId) {
      res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'merchantId required' } });
      return;
    }
    const file = await printMergedLabels({
      merchantId,
      orderIds: Array.isArray(body.orderIds) ? body.orderIds.map((id: unknown) => String(id)) : undefined,
      carrier: body.carrier ? String(body.carrier) : undefined,
      persist: body.persist !== false,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.buffer);
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.patch(
  '/orders/:id/shipping',
  requirePermission('marketplace:write'),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const body = req.body ?? {};
      res.json({
        ok: true,
        data: await updateOrderShipping({
          orderId: String(id),
          actor: req.adminActor ?? 'admin',
          trackingNumber: body.trackingNumber ? String(body.trackingNumber) : undefined,
          shippingCarrier: body.shippingCarrier ? String(body.shippingCarrier) : undefined,
          shippingStatus: body.shippingStatus ? String(body.shippingStatus) : undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAdminRouter.get('/finance/settings', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await getPlatformSettings() });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.put('/finance/settings', async (req: AuthedRequest, res, next) => {
  try {
    const canWrite =
      adminHasPermission(req.adminRole, 'finance:write', req.adminDesk) ||
      adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk);
    if (!canWrite) {
      next(new AppError('FORBIDDEN', 'Missing permission: finance:write', 403));
      return;
    }
    const body = req.body ?? {};
    res.json({
      ok: true,
      data: await updatePlatformSettings({
        defaultGpPercent: body.defaultGpPercent != null ? Number(body.defaultGpPercent) : undefined,
        vatPercent: body.vatPercent != null ? Number(body.vatPercent) : undefined,
        vatRegistered: body.vatRegistered != null ? Boolean(body.vatRegistered) : undefined,
        vatEffectiveFrom:
          body.vatEffectiveFrom === undefined
            ? undefined
            : body.vatEffectiveFrom
              ? String(body.vatEffectiveFrom)
              : null,
        companyTaxId:
          body.companyTaxId === undefined ? undefined : body.companyTaxId ? String(body.companyTaxId) : null,
        companyLegalName:
          body.companyLegalName === undefined
            ? undefined
            : body.companyLegalName
              ? String(body.companyLegalName)
              : null,
        whtPercent: body.whtPercent != null ? Number(body.whtPercent) : undefined,
        autoCompleteDays: body.autoCompleteDays != null ? Number(body.autoCompleteDays) : undefined,
        payoutMode: body.payoutMode != null ? String(body.payoutMode) : undefined,
        autoPayoutMaxLimit:
          body.autoPayoutMaxLimit != null ? Number(body.autoPayoutMaxLimit) : undefined,
        bankName: body.bankName === undefined ? undefined : body.bankName ? String(body.bankName) : null,
        bankAccountNo:
          body.bankAccountNo === undefined ? undefined : body.bankAccountNo ? String(body.bankAccountNo) : null,
        bankAccountName:
          body.bankAccountName === undefined
            ? undefined
            : body.bankAccountName
              ? String(body.bankAccountName)
              : null,
        bankCode: body.bankCode === undefined ? undefined : body.bankCode ? String(body.bankCode) : null,
        actor: req.adminActor ?? 'admin',
      }),
    });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/finance/accounting-pack', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await getAccountingPack() });
  } catch (e) {
    next(e);
  }
});

/** สรุปรายงานภาษี/บัญชีตามช่วงวันที่ — ใช้เติมกล่อง Summary ก่อนกดดาวน์โหลด */
commerceAdminRouter.get('/finance/tax-reports/summary', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    const range = parseReportPeriod({
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      month: req.query.month ? String(req.query.month) : undefined,
    });
    const bundle = await buildTaxReportBundle(range);
    res.json({
      ok: true,
      data: {
        period: bundle.period,
        currency: bundle.currency,
        note: bundle.note,
        summary: bundle.summary,
        counts: {
          salesTaxRows: bundle.salesTax.length,
          creditNoteRows: bundle.creditNotes.length,
          ledgerRows: bundle.revenueLedger.length,
          payoutRows: bundle.payouts.length,
          merchantRows: bundle.merchants.length,
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

/** ดาวน์โหลดไฟล์รายงาน: sales-tax | revenue-ledger | payouts | merchants */
commerceAdminRouter.get('/finance/tax-reports/:kind', requirePermission('marketplace:read'), async (req, res, next) => {
  try {
    const kind = String(req.params.kind) as ReportKind;
    const allowed: ReportKind[] = ['sales-tax', 'revenue-ledger', 'payouts', 'merchants'];
    if (!allowed.includes(kind)) {
      next(new AppError('VALIDATION', 'unknown tax report', 400));
      return;
    }
    const format = String(req.query.format ?? (kind === 'merchants' ? 'csv' : 'xlsx')) as ReportFormat;
    const file = await exportTaxReport({
      kind,
      format,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      month: req.query.month ? String(req.query.month) : undefined,
    });
    sendExportFile(res, file);
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/finance/escrows', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listAdminEscrows() });
  } catch (e) {
    next(e);
  }
});

/** คำขอถอนเงินจากกระเป๋าร้าน — รอแอดมินโอนพร้อมหลักฐาน */
commerceAdminRouter.get('/finance/withdrawals', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listPendingWithdrawals() });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.post('/finance/withdrawals/:id/approve', async (req: AuthedRequest, res, next) => {
  try {
    const canWrite =
      adminHasPermission(req.adminRole, 'finance:write', req.adminDesk) ||
      adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk);
    if (!canWrite) {
      next(new AppError('FORBIDDEN', 'Missing permission: finance:write', 403));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({
      ok: true,
      data: await adminApproveWithdrawal(
        String(id),
        String(req.body?.proofOfTransfer ?? req.body?.proof ?? ''),
        req.adminActor ?? 'admin',
      ),
    });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.post('/finance/withdrawals/:id/reject', async (req: AuthedRequest, res, next) => {
  try {
    const canWrite =
      adminHasPermission(req.adminRole, 'finance:write', req.adminDesk) ||
      adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk);
    if (!canWrite) {
      next(new AppError('FORBIDDEN', 'Missing permission: finance:write', 403));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({
      ok: true,
      data: await rejectWithdrawal(String(id), req.adminActor ?? 'admin'),
    });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.post('/finance/escrows/:id/payout', async (req: AuthedRequest, res, next) => {
  try {
    const canWrite =
      adminHasPermission(req.adminRole, 'finance:write', req.adminDesk) ||
      adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk);
    if (!canWrite) {
      next(new AppError('FORBIDDEN', 'Missing permission: finance:write', 403));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    res.json({
      ok: true,
      data: await markEscrowPaidOut(
        String(id),
        String(req.body?.proofOfTransfer ?? req.body?.proof ?? ''),
        req.adminActor ?? 'admin',
      ),
    });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/finance/revenue', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await getPlatformRevenue() });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.put('/finance/stores/:id/gp', async (req: AuthedRequest, res, next) => {
  try {
    const canWrite =
      adminHasPermission(req.adminRole, 'finance:write', req.adminDesk) ||
      adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk);
    if (!canWrite) {
      next(new AppError('FORBIDDEN', 'Missing permission: finance:write', 403));
      return;
    }
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const raw = req.body?.customGpPercent ?? req.body?.gpPercent;
    const custom = raw === null || raw === '' ? null : Number(raw);
    res.json({
      ok: true,
      data: await setStoreGpPercent(String(id), custom, req.body?.name ? String(req.body.name) : undefined),
    });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/books', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await getPlatformBooks() });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.get('/payouts', requirePermission('marketplace:read'), async (_req, res, next) => {
  try {
    res.json({ ok: true, data: await listPayoutBatches() });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.post(
  '/payouts/weekly',
  async (req: AuthedRequest, res, next) => {
    try {
      const canWrite =
        adminHasPermission(req.adminRole, 'finance:write', req.adminDesk) ||
        adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk);
      if (!canWrite) {
        next(new AppError('FORBIDDEN', 'Missing permission: finance:write', 403));
        return;
      }
      res.json({
        ok: true,
        data: await createWeeklyPayoutBatch({ actor: req.adminActor ?? 'admin' }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAdminRouter.post(
  '/payouts/batches/:id/complete',
  async (req: AuthedRequest, res, next) => {
    try {
      const canWrite =
        adminHasPermission(req.adminRole, 'finance:write', req.adminDesk) ||
        adminHasPermission(req.adminRole, 'marketplace:write', req.adminDesk);
      if (!canWrite) {
        next(new AppError('FORBIDDEN', 'Missing permission: finance:write', 403));
        return;
      }
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      res.json({
        ok: true,
        data: await markPayoutBatchPaid({
          batchId: String(id),
          actor: req.adminActor ?? 'admin',
          proof: String(req.body?.proof ?? ''),
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAdminRouter.post(
  '/orders/:id/confirm',
  requirePermission('marketplace:write'),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      res.json({
        ok: true,
        data: await confirmPaidOrder({
          orderId: String(id),
          actor: req.adminActor ?? 'admin',
          role: 'admin',
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAdminRouter.post(
  '/orders/:id/return/resolve',
  requirePermission('marketplace:write'),
  async (req: AuthedRequest, res, next) => {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const decision = String(req.body?.decision ?? '') === 'reject' ? 'reject' : 'accept';
      res.json({
        ok: true,
        data: await resolveOrderReturn({
          orderId: String(id),
          actor: req.adminActor ?? 'admin',
          decision,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);

commerceAdminRouter.get('/analytics', requirePermission('dashboard:read'), async (req, res, next) => {
  try {
    const hours = req.query.hours != null ? Number(req.query.hours) : 24;
    res.json({ ok: true, data: await summarizeAnalytics(Number.isFinite(hours) ? hours : 24) });
  } catch (e) {
    next(e);
  }
});

commerceAdminRouter.post(
  '/stock/sell',
  requirePermission('marketplace:write'),
  async (req: AuthedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      res.json({
        ok: true,
        data: await applyStockSale({
          variantId: String(body.variantId ?? ''),
          warehouseId: String(body.warehouseId ?? 'WH-CTI-MAIN'),
          qty: Number(body.qty ?? 0),
          orderRef: body.orderRef ? String(body.orderRef) : undefined,
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);
