/**
 * Ad Inventory + Billing — Banner / Sponsored Feed.
 * Ad fees are billed as THB invoices via PSP — separate from marketplace GP.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { getPaymentGateway } from './PspGateway';

export type AdPlacement = 'BANNER' | 'SPONSORED_FEED' | 'APP_OPEN';
export type AdCampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ENDED';
export type AdInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'FAILED';

export type AdCampaignDto = {
  id: string;
  advertiserId: string;
  name: string;
  placement: AdPlacement;
  status: AdCampaignStatus;
  budgetThb: string;
  spentThb: string;
  creatives: AdCreativeDto[];
  targetingJson?: unknown;
  updatedAt: string;
};

export type AdCreativeDto = {
  id: string;
  campaignId: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  ctaUrl?: string | null;
  weight: number;
  active: boolean;
};

export type AdInvoiceDto = {
  id: string;
  campaignId: string;
  invoiceNumber: string;
  amountThb: string;
  status: AdInvoiceStatus;
  pspRef?: string | null;
  paidAt?: string | null;
  lineItems: unknown;
  createdAt: string;
};

type Store = {
  campaigns: AdCampaignDto[];
  invoices: AdInvoiceDto[];
};

const DATA_FILE = path.join(process.cwd(), 'data', 'ads-inventory.json');

function readStore(): Store {
  try {
    if (!fs.existsSync(DATA_FILE)) return { campaigns: [], invoices: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Store;
  } catch {
    return { campaigns: [], invoices: [] };
  }
}

function writeStore(s: Store) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.adCampaign.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

function nextInvoiceNumber() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `AD-${y}${m}-${rand}`;
}

function mapCampaign(row: {
  id: string;
  advertiserId: string;
  name: string;
  placement: AdPlacement;
  status: AdCampaignStatus;
  budgetThb: bigint;
  spentThb: bigint;
  targetingJson: unknown;
  updatedAt: Date;
  creatives: AdCreativeDto[];
}): AdCampaignDto {
  return {
    id: row.id,
    advertiserId: row.advertiserId,
    name: row.name,
    placement: row.placement,
    status: row.status,
    budgetThb: row.budgetThb.toString(),
    spentThb: row.spentThb.toString(),
    targetingJson: row.targetingJson,
    creatives: row.creatives.map((c) => ({
      id: c.id,
      campaignId: c.campaignId,
      title: c.title,
      body: c.body,
      imageUrl: c.imageUrl,
      ctaUrl: c.ctaUrl,
      weight: c.weight,
      active: c.active,
    })),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createCampaign(input: {
  advertiserId: string;
  name: string;
  placement: AdPlacement;
  budgetThb: string | number | bigint;
  targeting?: { geo?: string; channel?: string };
  creative?: { title: string; body?: string; imageUrl?: string; ctaUrl?: string };
}): Promise<AdCampaignDto> {
  if (!input.advertiserId.trim() || !input.name.trim()) {
    throw new AppError('VALIDATION', 'advertiserId and name required', 400);
  }
  if (!['BANNER', 'SPONSORED_FEED', 'APP_OPEN'].includes(input.placement)) {
    throw new AppError('VALIDATION', 'placement must be BANNER, SPONSORED_FEED, or APP_OPEN', 400);
  }
  const budget = BigInt(String(input.budgetThb));
  const id = randomUUID();

  if (await prismaReady()) {
    const row = await prisma.adCampaign.create({
      data: {
        id,
        advertiserId: input.advertiserId,
        name: input.name,
        placement: input.placement,
        status: 'DRAFT',
        budgetThb: budget,
        targetingJson: input.targeting ?? {},
        creatives: input.creative
          ? {
              create: {
                id: randomUUID(),
                title: input.creative.title,
                body: input.creative.body,
                imageUrl: input.creative.imageUrl,
                ctaUrl: input.creative.ctaUrl,
              },
            }
          : undefined,
      },
      include: { creatives: true },
    });
    return mapCampaign(row);
  }

  const creative: AdCreativeDto | null = input.creative
    ? {
        id: randomUUID(),
        campaignId: id,
        title: input.creative.title,
        body: input.creative.body,
        imageUrl: input.creative.imageUrl,
        ctaUrl: input.creative.ctaUrl,
        weight: 1,
        active: true,
      }
    : null;
  const dto: AdCampaignDto = {
    id,
    advertiserId: input.advertiserId,
    name: input.name,
    placement: input.placement,
    status: 'DRAFT',
    budgetThb: budget.toString(),
    spentThb: '0',
    targetingJson: input.targeting ?? {},
    creatives: creative ? [creative] : [],
    updatedAt: new Date().toISOString(),
  };
  const store = readStore();
  store.campaigns.unshift(dto);
  writeStore(store);
  return dto;
}

export async function listCampaigns(limit = 50): Promise<AdCampaignDto[]> {
  if (await prismaReady()) {
    const rows = await prisma.adCampaign.findMany({
      include: { creatives: true },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(limit, 200),
    });
    return rows.map(mapCampaign);
  }
  return readStore().campaigns.slice(0, limit);
}

export async function setCampaignStatus(id: string, status: AdCampaignStatus) {
  if (await prismaReady()) {
    const row = await prisma.adCampaign.update({
      where: { id },
      data: { status },
      include: { creatives: true },
    });
    return mapCampaign(row);
  }
  const store = readStore();
  const c = store.campaigns.find((x) => x.id === id);
  if (!c) throw new AppError('NOT_FOUND', 'Campaign not found', 404);
  c.status = status;
  c.updatedAt = new Date().toISOString();
  writeStore(store);
  return c;
}

/** Issue ad invoice (THB) — not GP */
export async function issueAdInvoice(input: {
  campaignId: string;
  amountThb: string | number | bigint;
  lineItems?: unknown;
  actor: string;
}): Promise<AdInvoiceDto> {
  const amount = BigInt(String(input.amountThb));
  if (amount <= 0n) throw new AppError('VALIDATION', 'amountThb must be > 0', 400);
  const invoiceNumber = nextInvoiceNumber();
  const id = randomUUID();

  if (await prismaReady()) {
    const campaign = await prisma.adCampaign.findUnique({ where: { id: input.campaignId } });
    if (!campaign) throw new AppError('NOT_FOUND', 'Campaign not found', 404);
    const row = await prisma.adInvoice.create({
      data: {
        id,
        campaignId: input.campaignId,
        invoiceNumber,
        amountThb: amount,
        status: 'ISSUED',
        dueAt: new Date(Date.now() + 7 * 86400000),
        lineItemsJson: (input.lineItems as object) ?? [
          { description: `Ad fee — ${campaign.placement}`, amountThb: amount.toString() },
        ],
        auditJson: { actor: input.actor, issuedAt: new Date().toISOString() },
      },
    });
    return {
      id: row.id,
      campaignId: row.campaignId,
      invoiceNumber: row.invoiceNumber,
      amountThb: row.amountThb.toString(),
      status: row.status,
      pspRef: row.pspRef,
      paidAt: row.paidAt?.toISOString() ?? null,
      lineItems: row.lineItemsJson,
      createdAt: row.createdAt.toISOString(),
    };
  }

  const store = readStore();
  const campaign = store.campaigns.find((c) => c.id === input.campaignId);
  if (!campaign) throw new AppError('NOT_FOUND', 'Campaign not found', 404);
  const dto: AdInvoiceDto = {
    id,
    campaignId: input.campaignId,
    invoiceNumber,
    amountThb: amount.toString(),
    status: 'ISSUED',
    lineItems: input.lineItems ?? [
      { description: `Ad fee — ${campaign.placement}`, amountThb: amount.toString() },
    ],
    createdAt: new Date().toISOString(),
  };
  store.invoices.unshift(dto);
  writeStore(store);
  return dto;
}

/**
 * Capture ad invoice via PSP. Never fakes success when PSP unconfigured.
 */
export async function payAdInvoice(input: {
  invoiceId: string;
  actor: string;
  idempotencyKey: string;
}): Promise<AdInvoiceDto> {
  const gateway = getPaymentGateway();

  if (await prismaReady()) {
    const inv = await prisma.adInvoice.findUnique({ where: { id: input.invoiceId } });
    if (!inv) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
    if (inv.status === 'PAID') {
      return {
        id: inv.id,
        campaignId: inv.campaignId,
        invoiceNumber: inv.invoiceNumber,
        amountThb: inv.amountThb.toString(),
        status: inv.status,
        pspRef: inv.pspRef,
        paidAt: inv.paidAt?.toISOString() ?? null,
        lineItems: inv.lineItemsJson,
        createdAt: inv.createdAt.toISOString(),
      };
    }
    if (inv.status !== 'ISSUED') {
      throw new AppError('VALIDATION', `Cannot pay invoice in status ${inv.status}`, 400);
    }

    let capture;
    try {
      capture = await gateway.capture({
        amountThb: inv.amountThb,
        currency: 'THB',
        orderId: inv.invoiceNumber,
        buyerRef: inv.campaignId,
        merchantRef: 'PLATFORM_ADS',
        idempotencyKey: input.idempotencyKey,
        description: `Ad invoice ${inv.invoiceNumber}`,
      });
    } catch (e) {
      await prisma.adInvoice.update({
        where: { id: inv.id },
        data: {
          status: 'FAILED',
          auditJson: {
            ...(typeof inv.auditJson === 'object' && inv.auditJson ? inv.auditJson : {}),
            lastError: e instanceof AppError ? e.code : 'PSP_FAILED',
            actor: input.actor,
          },
        },
      });
      throw e;
    }

    const paid = await prisma.adInvoice.update({
      where: { id: inv.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        pspRef: capture.pspRef,
        auditJson: {
          ...(typeof inv.auditJson === 'object' && inv.auditJson ? inv.auditJson : {}),
          paidBy: input.actor,
          pspRef: capture.pspRef,
        },
      },
    });
    await prisma.adCampaign.update({
      where: { id: inv.campaignId },
      data: { spentThb: { increment: inv.amountThb }, status: 'ACTIVE' },
    });

    return {
      id: paid.id,
      campaignId: paid.campaignId,
      invoiceNumber: paid.invoiceNumber,
      amountThb: paid.amountThb.toString(),
      status: paid.status,
      pspRef: paid.pspRef,
      paidAt: paid.paidAt?.toISOString() ?? null,
      lineItems: paid.lineItemsJson,
      createdAt: paid.createdAt.toISOString(),
    };
  }

  const store = readStore();
  const inv = store.invoices.find((i) => i.id === input.invoiceId);
  if (!inv) throw new AppError('NOT_FOUND', 'Invoice not found', 404);
  if (inv.status === 'PAID') return inv;
  let capture;
  try {
    capture = await gateway.capture({
      amountThb: BigInt(inv.amountThb),
      currency: 'THB',
      orderId: inv.invoiceNumber,
      buyerRef: inv.campaignId,
      merchantRef: 'PLATFORM_ADS',
      idempotencyKey: input.idempotencyKey,
      description: `Ad invoice ${inv.invoiceNumber}`,
    });
  } catch (e) {
    inv.status = 'FAILED';
    writeStore(store);
    throw e;
  }
  inv.status = 'PAID';
  inv.pspRef = capture.pspRef;
  inv.paidAt = new Date().toISOString();
  const camp = store.campaigns.find((c) => c.id === inv.campaignId);
  if (camp) {
    camp.spentThb = (BigInt(camp.spentThb) + BigInt(inv.amountThb)).toString();
    camp.status = 'ACTIVE';
  }
  writeStore(store);
  return inv;
}

export async function listInvoices(limit = 50): Promise<AdInvoiceDto[]> {
  if (await prismaReady()) {
    const rows = await prisma.adInvoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });
    return rows.map((row) => ({
      id: row.id,
      campaignId: row.campaignId,
      invoiceNumber: row.invoiceNumber,
      amountThb: row.amountThb.toString(),
      status: row.status,
      pspRef: row.pspRef,
      paidAt: row.paidAt?.toISOString() ?? null,
      lineItems: row.lineItemsJson,
      createdAt: row.createdAt.toISOString(),
    }));
  }
  return readStore().invoices.slice(0, limit);
}

export async function listActiveInventory(
  placement?: AdPlacement,
  targeting?: { geo?: string; channel?: string },
) {
  const campaigns = await listCampaigns(100);
  return campaigns.filter((c) => {
    if (c.status !== 'ACTIVE') return false;
    if (placement && c.placement !== placement) return false;
    if (!c.creatives.some((cr) => cr.active)) return false;
    const rules = (c.targetingJson ?? {}) as { geo?: string; channel?: string };
    if (targeting?.geo && rules.geo && rules.geo !== targeting.geo) return false;
    if (targeting?.channel && rules.channel && rules.channel !== targeting.channel) return false;
    return true;
  });
}

export function adsDomainStatus() {
  const gateway = getPaymentGateway();
  return {
    domain: 'marketplace-ads',
    placements: ['BANNER', 'SPONSORED_FEED', 'APP_OPEN'],
    billing: 'THB invoices via PSP (not GP / Boom Coin)',
    pspConfigured: gateway.provider !== 'UNCONFIGURED',
    pspProvider: gateway.provider,
    policy: 'Ad fees billed separately from marketplace GP; no fake payment success',
  };
}
