/**
 * Marketplace catalog — products + artisan services (PostgreSQL).
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export type CatalogKind = 'PRODUCT' | 'SERVICE';

export type CatalogDto = {
  id: string;
  kind: CatalogKind;
  merchantId: string;
  title: string;
  description?: string | null;
  priceThb: string;
  currency: string;
  status: string;
  metadataJson?: unknown;
  updatedAt: string;
};

type Store = { items: CatalogDto[] };
const DATA_FILE = path.join(process.cwd(), 'data', 'catalog.json');

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { items: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
  } catch {
    return { items: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.catalogItem.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

function mapRow(row: {
  id: string;
  kind: string;
  merchantId: string;
  title: string;
  description: string | null;
  priceThb: bigint;
  currency: string;
  status: string;
  metadataJson: unknown;
  updatedAt: Date;
}): CatalogDto {
  return {
    id: row.id,
    kind: row.kind as CatalogKind,
    merchantId: row.merchantId,
    title: row.title,
    description: row.description,
    priceThb: row.priceThb.toString(),
    currency: row.currency,
    status: row.status,
    metadataJson: row.metadataJson,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function upsertCatalogItem(input: {
  id?: string;
  kind: CatalogKind;
  merchantId: string;
  title: string;
  description?: string;
  priceThb: string | number | bigint;
  status?: string;
  metadataJson?: unknown;
}): Promise<CatalogDto> {
  if (!input.merchantId.trim() || !input.title.trim()) {
    throw new AppError('VALIDATION', 'merchantId and title required', 400);
  }
  const price = BigInt(String(input.priceThb));
  const id = input.id?.trim() || randomUUID();

  if (await prismaReady()) {
    const existing = await prisma.catalogItem.findUnique({ where: { id } });
    const row = existing
      ? await prisma.catalogItem.update({
          where: { id },
          data: {
            kind: input.kind,
            merchantId: input.merchantId,
            title: input.title,
            description: input.description,
            priceThb: price,
            status: input.status ?? existing.status,
            metadataJson: (input.metadataJson as object) ?? undefined,
          },
        })
      : await prisma.catalogItem.create({
          data: {
            id,
            kind: input.kind,
            merchantId: input.merchantId,
            title: input.title,
            description: input.description,
            priceThb: price,
            status: input.status ?? 'ACTIVE',
            metadataJson: (input.metadataJson as object) ?? {},
          },
        });
    return mapRow(row);
  }

  const store = readStore();
  const dto: CatalogDto = {
    id,
    kind: input.kind,
    merchantId: input.merchantId,
    title: input.title,
    description: input.description,
    priceThb: price.toString(),
    currency: 'THB',
    status: input.status ?? 'ACTIVE',
    metadataJson: input.metadataJson ?? {},
    updatedAt: new Date().toISOString(),
  };
  const idx = store.items.findIndex((i) => i.id === id);
  if (idx >= 0) store.items[idx] = dto;
  else store.items.unshift(dto);
  writeStore(store);
  return dto;
}

export async function listCatalog(opts?: { kind?: CatalogKind; merchantId?: string; limit?: number }) {
  const limit = Math.min(opts?.limit ?? 50, 200);
  if (await prismaReady()) {
    const rows = await prisma.catalogItem.findMany({
      where: {
        ...(opts?.kind ? { kind: opts.kind } : {}),
        ...(opts?.merchantId ? { merchantId: opts.merchantId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return rows.map(mapRow);
  }
  return readStore()
    .items.filter((i) => {
      if (opts?.kind && i.kind !== opts.kind) return false;
      if (opts?.merchantId && i.merchantId !== opts.merchantId) return false;
      return true;
    })
    .slice(0, limit);
}

export function catalogDomainStatus() {
  return {
    domain: 'marketplace-catalog',
    kinds: ['PRODUCT', 'SERVICE'],
    storage: 'postgresql',
  };
}
