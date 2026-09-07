import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../lib/errors';
import { requirePublicShop } from '../ShopIdentityService';
import { listCatalogBundles } from '../../ecommerce/CommerceService';
import { getShopsByMerchantIds } from '../ShopIdentityService';
import type { CatalogBundle } from '../../ecommerce/CommerceService';

export const shopPublicRouter = Router();

function param(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
}

/** GET /api/v1/shops/:shopKey — public shop identity (id | slug/handle). */
shopPublicRouter.get('/:shopKey', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shop = await requirePublicShop(param(req, 'shopKey'));
    res.json({ ok: true, data: shop });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/v1/shops/:shopKey/products — ACTIVE catalog of a shop (any user's shop).
 * No N+1: shop profile + all products are fetched in two batched queries.
 */
shopPublicRouter.get('/:shopKey/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const shop = await requirePublicShop(param(req, 'shopKey'));
    const limitRaw = req.query.limit != null ? Number(req.query.limit) : undefined;
    const bundles: CatalogBundle[] = await listCatalogBundles({
      merchantId: shop.id,
      limit: Number.isFinite(limitRaw) && limitRaw! > 0 ? Math.min(limitRaw!, 100) : 100,
    });
    const shopById = await getShopsByMerchantIds([shop.id]);
    const withShop: CatalogBundle[] = bundles.map((bundle) => ({
      ...bundle,
      shop: shopById.get(shop.id) ?? shop,
    }));
    res.json({ ok: true, data: { shop, products: withShop } });
  } catch (e) {
    next(e);
  }
});
