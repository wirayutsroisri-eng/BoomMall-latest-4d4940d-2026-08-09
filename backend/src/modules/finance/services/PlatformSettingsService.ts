import { prisma } from '../../../lib/prisma';
import { toSatang, toThb } from '../domain/escrowMath';

const ID = 'GLOBAL';
const DEFAULT_AUTO_LIMIT_SATANG = 2_000_000; // ฿20,000

function normalizePayoutMode(raw: unknown): 'MANUAL' | 'AUTO' {
  return String(raw ?? 'MANUAL').toUpperCase() === 'AUTO' ? 'AUTO' : 'MANUAL';
}

export async function getPlatformSettings() {
  const row =
    (await prisma.platformSettings.findUnique({ where: { id: ID } })) ??
    (await prisma.platformSettings.create({
      data: {
        id: ID,
        defaultGpPercent: 5,
        autoCompleteDays: 7,
        payoutMode: 'MANUAL',
        autoPayoutMaxLimit: DEFAULT_AUTO_LIMIT_SATANG,
        updatedBy: 'system',
      },
    }));
  return {
    defaultGpPercent: row.defaultGpPercent,
    autoCompleteDays: row.autoCompleteDays,
    payoutMode: normalizePayoutMode(row.payoutMode),
    /** เพดานออโต้ต่อครั้ง (บาท) */
    autoPayoutMaxLimit: toThb(row.autoPayoutMaxLimit ?? DEFAULT_AUTO_LIMIT_SATANG),
    autoPayoutMaxLimitSatang: row.autoPayoutMaxLimit ?? DEFAULT_AUTO_LIMIT_SATANG,
    bankAccount: {
      bankName: row.bankName,
      bankAccountNo: row.bankAccountNo,
      bankAccountName: row.bankAccountName,
      bankCode: row.bankCode,
    },
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export async function updatePlatformSettings(input: {
  defaultGpPercent?: number;
  autoCompleteDays?: number;
  payoutMode?: string;
  autoPayoutMaxLimit?: number;
  bankName?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  bankCode?: string | null;
  actor: string;
}) {
  const current = await getPlatformSettings();
  const defaultGpPercent =
    input.defaultGpPercent != null
      ? Math.max(0, Math.min(100, Number(input.defaultGpPercent)))
      : current.defaultGpPercent;
  const autoCompleteDays =
    input.autoCompleteDays != null
      ? Math.max(1, Math.min(30, Math.round(Number(input.autoCompleteDays))))
      : current.autoCompleteDays;
  const payoutMode =
    input.payoutMode != null ? normalizePayoutMode(input.payoutMode) : current.payoutMode;
  const autoPayoutMaxLimitSatang =
    input.autoPayoutMaxLimit != null
      ? Math.max(0, toSatang(Number(input.autoPayoutMaxLimit)))
      : current.autoPayoutMaxLimitSatang;

  await prisma.platformSettings.upsert({
    where: { id: ID },
    create: {
      id: ID,
      defaultGpPercent,
      autoCompleteDays,
      payoutMode,
      autoPayoutMaxLimit: autoPayoutMaxLimitSatang,
      bankName: input.bankName ?? null,
      bankAccountNo: input.bankAccountNo ?? null,
      bankAccountName: input.bankAccountName ?? null,
      bankCode: input.bankCode ?? null,
      updatedBy: input.actor,
    },
    update: {
      defaultGpPercent,
      autoCompleteDays,
      payoutMode,
      autoPayoutMaxLimit: autoPayoutMaxLimitSatang,
      ...(input.bankName !== undefined ? { bankName: input.bankName } : {}),
      ...(input.bankAccountNo !== undefined ? { bankAccountNo: input.bankAccountNo } : {}),
      ...(input.bankAccountName !== undefined ? { bankAccountName: input.bankAccountName } : {}),
      ...(input.bankCode !== undefined ? { bankCode: input.bankCode } : {}),
      updatedBy: input.actor,
    },
  });
  return getPlatformSettings();
}
