import { Router } from 'express';
import { renderLegalHtml } from './html';
import type { LegalDocKey } from './copy';

export const legalPublicRouter = Router();

legalPublicRouter.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'",
  );
  next();
});

function docParam(raw: string | string[] | undefined): LegalDocKey {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'terms' ? 'terms' : 'privacy';
}

legalPublicRouter.get('/', (_req, res) => {
  res.type('html').send(renderLegalHtml('privacy'));
});

legalPublicRouter.get('/:doc', (req, res) => {
  res.type('html').send(renderLegalHtml(docParam(req.params.doc)));
});
