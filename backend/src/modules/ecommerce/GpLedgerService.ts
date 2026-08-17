/**
 * Marketplace GP + Audit Trail.
 * Policy: every GP calculation MUST write MarketplaceAuditLog and optional ledger tx.
 * Payment capture MUST go through PaymentGateway (PSP) — never invent success.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { getPaymentGateway } from './PspGateway';

export type GpQuote = {
  orderId: string;
  amountThb: bigint;
  gpBps: number;
  gpAmountThb: bigint;
  netToMerchantThb: bigint;
};

export type MarketplaceAuditDto = {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  amountThb?: string | null;
  gpBps?: number | null;
  gpAmountThb?: string | null;
  pspRef?: string | null;
  ledgerTxId?: string | null;
  detail?: Record<string, unknown>;
  createdAt: string;
};

export type MerchantGpOverride = {
  merchantId: string;
  shopName?: string;
  gpBps: number;
};

export type GpPolicyDto = {
  id: string;
  enabled: boolean;
  /** Platform default, basis points (500 = 5.00%) */
  defaultGpBps: number;
  b2cGpBps: number | null;
  b2bGpBps: number | null;
  minOrderThb: number;
  holdDaysAfterComplete: number;
  payoutCycleDays: number;
  merchantOverrides: MerchantGpOverride[];
  updatedAt: string;
  updatedBy: string | null;
};

type JsonStore = { audits: MarketplaceAuditDto[]; policy?: GpPolicyDto };

const DATA_FILE = path.join(process.cwd(), 'data', 'marketplace-audit.json');
const POLICY_ID = 'GLOBAL_GP';
/** Seed only — live rate comes from MarketplaceGpPolicy (admin-editable) */
export const DEFAULT_GP_BPS = Number(process.env.MARKETPLACE_GP_BPS ?? 500);

function readStore(): JsonStore {
  try {
    if (!fs.existsSync(DATA_FILE)) return { audits: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as JsonStore;
  } catch {
    return { audits: [] };
  }
}

function writeStore(s: JsonStore) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(s, null, 2), 'utf8');
}

async function prismaReady() {
  try {
    await prisma.marketplaceAuditLog.findFirst({ take: 1 });
    return true;
  } catch {
    return false;
  }
}

async function gpPolicyTableReady() {
  try {
    await prisma.marketplaceGpPolicy.findUnique({ where: { id: POLICY_ID } });
    return true;
  } catch {
    return false;
  }
}

function clampBps(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(10_000, Math.round(n)));
}

function parseOverrides(raw: unknown): MerchantGpOverride[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MerchantGpOverride[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const merchantId = String(rec.merchantId ?? '').trim();
    if (!merchantId || seen.has(merchantId)) continue;
    seen.add(merchantId);
    out.push({
      merchantId,
      shopName: rec.shopName ? String(rec.shopName) : undefined,
      gpBps: clampBps(rec.gpBps, DEFAULT_GP_BPS),
    });
  }
  return out;
}

function defaultPolicy(): GpPolicyDto {
  return {
    id: POLICY_ID,
    enabled: true,
    defaultGpBps: DEFAULT_GP_BPS,
    b2cGpBps: null,
    b2bGpBps: null,
    minOrderThb: 0,
    holdDaysAfterComplete: 7,
    payoutCycleDays: 7,
    merchantOverrides: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'system',
  };
}

function mapPolicy(row: {
  id: string;
  enabled: boolean;
  defaultGpBps: number;
  b2cGpBps: number | null;
  b2bGpBps: number | null;
  minOrderThb: number;
  holdDaysAfterComplete?: number;
  payoutCycleDays?: number;
  merchantOverridesJson: unknown;
  updatedAt: Date;
  updatedBy: string | null;
}): GpPolicyDto {
  return {
    id: row.id,
    enabled: row.enabled,
    defaultGpBps: row.defaultGpBps,
    b2cGpBps: row.b2cGpBps,
    b2bGpBps: row.b2bGpBps,
    minOrderThb: row.minOrderThb,
    holdDaysAfterComplete: row.holdDaysAfterComplete ?? 7,
    payoutCycleDays: row.payoutCycleDays ?? 7,
    merchantOverrides: parseOverrides(row.merchantOverridesJson),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function getGpPolicy(): Promise<GpPolicyDto> {
  if (await gpPolicyTableReady()) {
    let row = await prisma.marketplaceGpPolicy.findUnique({ where: { id: POLICY_ID } });
    if (!row) {
      const d = defaultPolicy();
      row = await prisma.marketplaceGpPolicy.create({
        data: {
          id: POLICY_ID,
          enabled: d.enabled,
          defaultGpBps: d.defaultGpBps,
          minOrderThb: d.minOrderThb,
          merchantOverridesJson: [],
          updatedBy: 'system',
        },
      });
    }
    return mapPolicy(row);
  }
  return readStore().policy ?? defaultPolicy();
}

export async function updateGpPolicy(input: {
  enabled?: boolean;
  defaultGpBps?: number;
  b2cGpBps?: number | null;
  b2bGpBps?: number | null;
  minOrderThb?: number;
  holdDaysAfterComplete?: number;
  payoutCycleDays?: number;
  merchantOverrides?: MerchantGpOverride[];
  actor: string;
}): Promise<GpPolicyDto> {
  const current = await getGpPolicy();
  const next: GpPolicyDto = {
    ...current,
    enabled: input.enabled ?? current.enabled,
    defaultGpBps: input.defaultGpBps != null ? clampBps(input.defaultGpBps, current.defaultGpBps) : current.defaultGpBps,
    b2cGpBps: input.b2cGpBps === undefined ? current.b2cGpBps : input.b2cGpBps == null ? null : clampBps(input.b2cGpBps, current.defaultGpBps),
    b2bGpBps: input.b2bGpBps === undefined ? current.b2bGpBps : input.b2bGpBps == null ? null : clampBps(input.b2bGpBps, current.defaultGpBps),
    minOrderThb: input.minOrderThb != null ? Math.max(0, Math.round(Number(input.minOrderThb) || 0)) : current.minOrderThb,
    holdDaysAfterComplete:
      input.holdDaysAfterComplete != null
        ? Math.max(0, Math.min(30, Math.round(Number(input.holdDaysAfterComplete) || 0)))
        : current.holdDaysAfterComplete,
    payoutCycleDays:
      input.payoutCycleDays != null
        ? Math.max(1, Math.min(30, Math.round(Number(input.payoutCycleDays) || 7)))
        : current.payoutCycleDays,
    merchantOverrides: input.merchantOverrides ? parseOverrides(input.merchantOverrides) : current.merchantOverrides,
    updatedAt: new Date().toISOString(),
    updatedBy: input.actor,
  };

  if (await gpPolicyTableReady()) {
    const row = await prisma.marketplaceGpPolicy.upsert({
      where: { id: POLICY_ID },
      create: {
        id: POLICY_ID,
        enabled: next.enabled,
        defaultGpBps: next.defaultGpBps,
        b2cGpBps: next.b2cGpBps,
        b2bGpBps: next.b2bGpBps,
        minOrderThb: next.minOrderThb,
        holdDaysAfterComplete: next.holdDaysAfterComplete,
        payoutCycleDays: next.payoutCycleDays,
        merchantOverridesJson: next.merchantOverrides as unknown as Prisma.InputJsonValue,
        updatedBy: next.updatedBy,
      },
      update: {
        enabled: next.enabled,
        defaultGpBps: next.defaultGpBps,
        b2cGpBps: next.b2cGpBps,
        b2bGpBps: next.b2bGpBps,
        minOrderThb: next.minOrderThb,
        holdDaysAfterComplete: next.holdDaysAfterComplete,
        payoutCycleDays: next.payoutCycleDays,
        merchantOverridesJson: next.merchantOverrides as unknown as Prisma.InputJsonValue,
        updatedBy: next.updatedBy,
      },
    });
    await pushAudit({
      actor: input.actor,
      action: 'gp.policy.update',
      entityType: 'gp_policy',
      entityId: POLICY_ID,
      gpBps: next.defaultGpBps,
      detail: { before: current, after: next },
    });
    return mapPolicy(row);
  }

  const store = readStore();
  store.policy = next;
  writeStore(store);
  return next;
}

export async function resolveGpBps(opts?: {
  merchantId?: string;
  channel?: string;
  amountThb?: number;
  policy?: GpPolicyDto;
}) {
  const policy = opts?.policy ?? (await getGpPolicy());
  if (!policy.enabled) return 0;
  if (opts?.amountThb != null && opts.amountThb < policy.minOrderThb) return 0;
  if (opts?.merchantId) {
    const hit = policy.merchantOverrides.find((o) => o.merchantId === opts.merchantId);
    if (hit) return hit.gpBps;
  }
  const channel = String(opts?.channel ?? '').toUpperCase();
  if (channel === 'B2B' && policy.b2bGpBps != null) return policy.b2bGpBps;
  if (channel === 'B2C' && policy.b2cGpBps != null) return policy.b2cGpBps;
  return policy.defaultGpBps;
}

export function quoteGp(amountThb: bigint, gpBps = DEFAULT_GP_BPS): Omit<GpQuote, 'orderId'> {
  if (amountThb < 0n) throw new AppError('VALIDATION', 'amountThb must be >= 0', 400);
  if (gpBps < 0 || gpBps > 10_000) throw new AppError('VALIDATION', 'gpBps out of range', 400);
  if (amountThb === 0n) {
    return { amountThb, gpBps, gpAmountThb: 0n, netToMerchantThb: 0n };
  }
  const gpAmountThb = (amountThb * BigInt(gpBps)) / 10_000n;
  return {
    amountThb,
    gpBps,
    gpAmountThb,
    netToMerchantThb: amountThb - gpAmountThb,
  };
}

export async function quoteOrderGp(input: {
  amountThb: number | bigint | string;
  merchantId?: string;
  channel?: string;
  gpBps?: number;
}) {
  const amount =
    typeof input.amountThb === 'bigint' ? input.amountThb : BigInt(String(Math.max(0, Math.round(Number(input.amountThb) || 0))));
  const bps =
    input.gpBps != null
      ? clampBps(input.gpBps, DEFAULT_GP_BPS)
      : await resolveGpBps({
          merchantId: input.merchantId,
          channel: input.channel,
          amountThb: Number(amount),
        });
  return quoteGp(amount, bps);
}

async function pushAudit(row: Omit<MarketplaceAuditDto, 'id' | 'createdAt'> & { id?: string }) {
  const dto: MarketplaceAuditDto = {
    id: row.id ?? randomUUID(),
    actor: row.actor,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    amountThb: row.amountThb,
    gpBps: row.gpBps,
    gpAmountThb: row.gpAmountThb,
    pspRef: row.pspRef,
    ledgerTxId: row.ledgerTxId,
    detail: row.detail,
    createdAt: new Date().toISOString(),
  };

  if (await prismaReady()) {
    await prisma.marketplaceAuditLog.create({
      data: {
        id: dto.id,
        actor: dto.actor,
        action: dto.action,
        entityType: dto.entityType,
        entityId: dto.entityId,
        amountThb: dto.amountThb != null ? BigInt(dto.amountThb) : null,
        gpBps: dto.gpBps ?? null,
        gpAmountThb: dto.gpAmountThb != null ? BigInt(dto.gpAmountThb) : null,
        pspRef: dto.pspRef ?? null,
        ledgerTxId: dto.ledgerTxId ?? null,
        detailJson: (dto.detail ?? {}) as Prisma.InputJsonValue,
      },
    });
  } else {
    const store = readStore();
    store.audits = [dto, ...store.audits].slice(0, 5000);
    writeStore(store);
  }
  return dto;
}

export async function listMarketplaceAudit(limit = 50): Promise<MarketplaceAuditDto[]> {
  if (await prismaReady()) {
    const rows = await prisma.marketplaceAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      amountThb: r.amountThb?.toString() ?? null,
      gpBps: r.gpBps,
      gpAmountThb: r.gpAmountThb?.toString() ?? null,
      pspRef: r.pspRef,
      ledgerTxId: r.ledgerTxId,
      detail: (r.detailJson as Record<string, unknown>) ?? {},
      createdAt: r.createdAt.toISOString(),
    }));
  }
  return readStore().audits.slice(0, limit);
}

/**
 * Settle marketplace order: quote GP → PSP capture → audit trail.
 * Ledger coin mint is separate (Boom Coin closed loop); THB must go through PSP.
 */
export async function settleMarketplaceOrder(input: {
  orderId: string;
  amountThb: bigint | number | string;
  buyerRef: string;
  merchantRef: string;
  actor: string;
  gpBps?: number;
  idempotencyKey: string;
}) {
  const amount =
    typeof input.amountThb === 'bigint'
      ? input.amountThb
      : BigInt(input.amountThb);
  const quote = {
    orderId: input.orderId,
    ...(await quoteOrderGp({
      amountThb: amount,
      merchantId: input.merchantRef,
      gpBps: input.gpBps,
    })),
  };

  await pushAudit({
    actor: input.actor,
    action: 'gp.quote',
    entityType: 'order',
    entityId: input.orderId,
    amountThb: quote.amountThb.toString(),
    gpBps: quote.gpBps,
    gpAmountThb: quote.gpAmountThb.toString(),
    detail: { netToMerchantThb: quote.netToMerchantThb.toString(), policy: 'ledger+audit mandatory' },
  });

  const psp = getPaymentGateway();
  const capture = await psp.capture({
    orderId: input.orderId,
    amountThb: amount,
    buyerRef: input.buyerRef,
    merchantRef: input.merchantRef,
    idempotencyKey: input.idempotencyKey,
    description: `BoomMall order ${input.orderId} · GP ${quote.gpBps}bps`,
  });

  const audit = await pushAudit({
    actor: input.actor,
    action: 'psp.capture',
    entityType: 'order',
    entityId: input.orderId,
    amountThb: amount.toString(),
    gpBps: quote.gpBps,
    gpAmountThb: quote.gpAmountThb.toString(),
    pspRef: capture.pspRef,
    detail: {
      provider: psp.provider,
      status: capture.status,
      netToMerchantThb: quote.netToMerchantThb.toString(),
    },
  });

  await pushAudit({
    actor: input.actor,
    action: 'gp.settle',
    entityType: 'order',
    entityId: input.orderId,
    amountThb: amount.toString(),
    gpBps: quote.gpBps,
    gpAmountThb: quote.gpAmountThb.toString(),
    pspRef: capture.pspRef,
    detail: { quote, capture },
  });

  return { quote, capture, audit };
}

/** Record GP split after a commerce order was already captured via PSP (no second charge). */
export async function recordPaidOrderGp(input: {
  orderId: string;
  actor: string;
  merchantId?: string;
  channel?: string;
  quote: Omit<GpQuote, 'orderId'>;
  pspRef?: string | null;
}) {
  return pushAudit({
    actor: input.actor,
    action: 'gp.settle',
    entityType: 'order',
    entityId: input.orderId,
    amountThb: input.quote.amountThb.toString(),
    gpBps: input.quote.gpBps,
    gpAmountThb: input.quote.gpAmountThb.toString(),
    pspRef: input.pspRef ?? null,
    detail: {
      merchantId: input.merchantId ?? null,
      channel: input.channel ?? null,
      netToMerchantThb: input.quote.netToMerchantThb.toString(),
      source: 'commerce_pay',
    },
  });
}

export function ecommerceDomainStatus() {
  const psp = getPaymentGateway();
  return {
    domain: 'ecommerce-merchant',
    gpConfigurable: true,
    gpBpsSeed: DEFAULT_GP_BPS,
    ledgerRequired: true,
    auditTrailRequired: true,
    pspProvider: psp.provider,
    pspConfigured: psp.provider !== 'UNCONFIGURED',
    policy:
      'GP quoted from admin policy on paid orders; THB capture only via real PSP (App Store 3.1)',
  };
}
