/**
 * PSP (Payment Gateway) — marketplace settlements MUST go through a real PSP.
 * App Store 3.1: never claim payment success without an integrated gateway.
 */

import { AppError } from '../../lib/errors';

export type PspCaptureInput = {
  orderId: string;
  amountThb: bigint;
  currency?: 'THB';
  buyerRef: string;
  merchantRef: string;
  idempotencyKey: string;
  description?: string;
  /** Omise token / Stripe payment method / TrueMoney source id from the client */
  sourceToken?: string;
};

export type PspCaptureResult = {
  ok: true;
  pspRef: string;
  status: 'captured' | 'pending';
  raw?: Record<string, unknown>;
};

export type PspRefundInput = {
  pspRef: string;
  amountThb: bigint;
  idempotencyKey: string;
  reason?: string;
};

export type PspRefundResult = {
  ok: true;
  refundRef: string;
  raw?: Record<string, unknown>;
};

export interface PaymentGateway {
  readonly provider: string;
  capture(input: PspCaptureInput): Promise<PspCaptureResult>;
  refund(input: PspRefundInput): Promise<PspRefundResult>;
}

/** Default: refuse — forces configure real Omise/Stripe/PromptPay PSP */
export class UnconfiguredPspGateway implements PaymentGateway {
  readonly provider = 'UNCONFIGURED';

  async capture(_input: PspCaptureInput): Promise<PspCaptureResult> {
    throw new AppError(
      'PSP_NOT_CONFIGURED',
      'Marketplace payout/capture requires a real Payment Gateway (PSP). Do not simulate success.',
      503,
    );
  }

  async refund(_input: PspRefundInput): Promise<PspRefundResult> {
    throw new AppError(
      'PSP_NOT_CONFIGURED',
      'Marketplace refund requires a real Payment Gateway (PSP). Do not simulate success.',
      503,
    );
  }
}

let gateway: PaymentGateway = new UnconfiguredPspGateway();

export function setPaymentGateway(g: PaymentGateway) {
  gateway = g;
}

export function getPaymentGateway(): PaymentGateway {
  return gateway;
}

/** Env-selected stub: still refuses fake success unless PSP_PROVIDER=mock_dev AND ALLOW_MOCK_PSP=1 */
export class DevMockPspGateway implements PaymentGateway {
  readonly provider = 'DEV_MOCK';

  async capture(input: PspCaptureInput): Promise<PspCaptureResult> {
    if (process.env.ALLOW_MOCK_PSP !== '1') {
      throw new AppError(
        'PSP_MOCK_DISABLED',
        'ALLOW_MOCK_PSP=1 required for DevMockPspGateway (never enable in App Store builds)',
        403,
      );
    }
    return {
      ok: true,
      pspRef: `mock_psp_${input.idempotencyKey}`,
      status: 'captured',
      raw: { warning: 'DEV ONLY — not for production / App Review' },
    };
  }

  async refund(input: PspRefundInput): Promise<PspRefundResult> {
    if (process.env.ALLOW_MOCK_PSP !== '1') {
      throw new AppError('PSP_MOCK_DISABLED', 'ALLOW_MOCK_PSP=1 required for mock refund', 403);
    }
    return { ok: true, refundRef: `mock_refund_${input.idempotencyKey}` };
  }
}

export class OmisePspGateway implements PaymentGateway {
  readonly provider = 'omise';

  async capture(input: PspCaptureInput): Promise<PspCaptureResult> {
    const secret = process.env.OMISE_SECRET_KEY?.trim();
    if (!secret) {
      throw new AppError('PSP_NOT_CONFIGURED', 'OMISE_SECRET_KEY required', 503);
    }
    if (!input.sourceToken) {
      throw new AppError(
        'PSP_SOURCE_REQUIRED',
        'ต้องมี Omise token / TrueMoney source จากแอปก่อนตัดบัตร',
        400,
      );
    }
    const amountSatang = Number(input.amountThb) * 100;
    const res = await fetch('https://api.omise.co/charges', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Omise-Version': '2019-05-29',
      },
      body: new URLSearchParams({
        amount: String(amountSatang),
        currency: 'thb',
        card: input.sourceToken,
        description: input.description ?? `BoomMall ${input.orderId}`,
        'metadata[orderId]': input.orderId,
      }),
    });
    const raw = (await res.json()) as Record<string, unknown>;
    if (!res.ok || raw.object === 'error') {
      throw new AppError('PSP_FAILED', String(raw.message ?? 'Omise charge failed'), 402);
    }
    return {
      ok: true,
      pspRef: String(raw.id ?? input.idempotencyKey),
      status: raw.status === 'pending' ? 'pending' : 'captured',
      raw,
    };
  }

  async refund(input: PspRefundInput): Promise<PspRefundResult> {
    const secret = process.env.OMISE_SECRET_KEY?.trim();
    if (!secret) throw new AppError('PSP_NOT_CONFIGURED', 'OMISE_SECRET_KEY required', 503);
    const res = await fetch(`https://api.omise.co/charges/${encodeURIComponent(input.pspRef)}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Omise-Version': '2019-05-29',
      },
      body: new URLSearchParams({
        amount: String(Number(input.amountThb) * 100),
      }),
    });
    const raw = (await res.json()) as Record<string, unknown>;
    if (!res.ok || raw.object === 'error') {
      throw new AppError('PSP_FAILED', String(raw.message ?? 'Omise refund failed'), 402);
    }
    return { ok: true, refundRef: String(raw.id ?? input.idempotencyKey), raw };
  }
}

export class StripePspGateway implements PaymentGateway {
  readonly provider = 'stripe';

  async capture(input: PspCaptureInput): Promise<PspCaptureResult> {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret) {
      throw new AppError('PSP_NOT_CONFIGURED', 'STRIPE_SECRET_KEY required', 503);
    }
    if (!input.sourceToken) {
      throw new AppError('PSP_SOURCE_REQUIRED', 'ต้องมี Stripe payment method จากแอปก่อนตัดบัตร', 400);
    }
    const amountSatang = Number(input.amountThb) * 100;
    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: new URLSearchParams({
        amount: String(amountSatang),
        currency: 'thb',
        confirm: 'true',
        payment_method: input.sourceToken,
        description: input.description ?? `BoomMall ${input.orderId}`,
        'metadata[orderId]': input.orderId,
      }),
    });
    const raw = (await res.json()) as Record<string, unknown>;
    if (!res.ok || raw.error) {
      const err = raw.error as Record<string, unknown> | undefined;
      throw new AppError('PSP_FAILED', String(err?.message ?? 'Stripe charge failed'), 402);
    }
    return {
      ok: true,
      pspRef: String(raw.id ?? input.idempotencyKey),
      status: raw.status === 'succeeded' ? 'captured' : 'pending',
      raw,
    };
  }

  async refund(input: PspRefundInput): Promise<PspRefundResult> {
    const secret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secret) throw new AppError('PSP_NOT_CONFIGURED', 'STRIPE_SECRET_KEY required', 503);
    const res = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: new URLSearchParams({
        payment_intent: input.pspRef,
        amount: String(Number(input.amountThb) * 100),
      }),
    });
    const raw = (await res.json()) as Record<string, unknown>;
    if (!res.ok || raw.error) {
      const err = raw.error as Record<string, unknown> | undefined;
      throw new AppError('PSP_FAILED', String(err?.message ?? 'Stripe refund failed'), 402);
    }
    return { ok: true, refundRef: String(raw.id ?? input.idempotencyKey), raw };
  }
}

export function bootstrapPspFromEnv() {
  const provider = (process.env.PSP_PROVIDER ?? '').toLowerCase();
  if (provider === 'mock_dev') {
    setPaymentGateway(new DevMockPspGateway());
  } else if (provider === 'omise' || provider === 'truemoney') {
    setPaymentGateway(new OmisePspGateway());
  } else if (provider === 'stripe') {
    setPaymentGateway(new StripePspGateway());
  } else {
    setPaymentGateway(new UnconfiguredPspGateway());
  }
}
