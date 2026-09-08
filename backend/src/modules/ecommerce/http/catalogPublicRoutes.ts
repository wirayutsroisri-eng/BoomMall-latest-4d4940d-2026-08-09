import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../lib/errors';
import { getPublicCatalogProduct, listPublicCatalogProducts, type PublicCatalogSort } from '../CommerceService';

/**
 * Public, unauthenticated catalog browse/read surface for the web storefront
 * (BoomMall Web). Separate from:
 *   - `/api/v1/commerce/catalog/*`  — the app's authenticated authoring API,
 *     whose single-product GET is intentionally permissive (a seller can
 *     fetch their own hidden/draft product to edit it).
 *   - `/api/v1/shops/:shopKey/products` — a single shop's own catalog.
 * This router never returns a non-ACTIVE product and never returns products
 * belonging to a private account (see CommerceService.listPublicCatalogProducts).
 */
export const catalogPublicRouter = Router();

const VALID_SORTS: PublicCatalogSort[] = ['newest', 'price_asc', 'price_desc'];

function queryString(req: Request, name: string) {
  const value = req.query[name];
  return typeof value === 'string' ? value : undefined;
}

function queryNumber(req: Request, name: string) {
  const raw = queryString(req, name);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** GET /api/v1/catalog/products — cross-shop browse (cursor pagination + filters + sort). */
catalogPublicRouter.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sortRaw = queryString(req, 'sort');
    const sort = VALID_SORTS.includes(sortRaw as PublicCatalogSort) ? (sortRaw as PublicCatalogSort) : undefined;
    const result = await listPublicCatalogProducts({
      q: queryString(req, 'q'),
      merchantId: queryString(req, 'merchantId'),
      channel: queryString(req, 'channel'),
      minPrice: queryNumber(req, 'minPrice'),
      maxPrice: queryNumber(req, 'maxPrice'),
      sort,
      cursor: queryString(req, 'cursor'),
      limit: queryNumber(req, 'limit'),
    });
    res.json({ ok: true, data: result });
  } catch (e) {
    next(e);
  }
});

/** GET /api/v1/catalog/products/:key — single ACTIVE product by slug OR id. */
catalogPublicRouter.get('/products/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
    const bundle = await getPublicCatalogProduct(String(key ?? ''));
    if (!bundle) throw new AppError('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้', 404);
    res.json({ ok: true, data: bundle });
  } catch (e) {
    next(e);
  }
});
