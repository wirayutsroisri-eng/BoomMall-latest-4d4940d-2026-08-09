import { prisma } from '../../../lib/prisma';
import { toSatang, toThb } from '../domain/escrowMath';
import { isValidThaiTaxId } from '../domain/taxPolicy';
import { AppError } from '../../../lib/errors';

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
    /** เลิกใช้เป็นแหล่งอัตรา — ดู resolveEffectiveGpBps คงไว้เป็น fallback เท่านั้น */
    defaultGpPercent: row.defaultGpPercent,
    /** VAT บนค่า GP (%) — มีผลเมื่อจดทะเบียนแล้วและถึงวันเริ่มมีผล */
    vatPercent: row.vatPercent ?? 0,
    vatRegistered: row.vatRegistered ?? false,
    vatEffectiveFrom: row.vatEffectiveFrom?.toISOString() ?? null,
    companyTaxId: row.companyTaxId ?? null,
    companyLegalName: row.companyLegalName ?? null,
    /** หัก ณ ที่จ่ายบนค่า GP (%) ใช้กับร้านนิติบุคคล — 0 = ยังไม่เปิด */
    whtPercent: row.whtPercent ?? 0,
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
  vatPercent?: number;
  vatRegistered?: boolean;
  vatEffectiveFrom?: string | null;
  companyTaxId?: string | null;
  companyLegalName?: string | null;
  whtPercent?: number;
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
  const clampPercent = (value: number | undefined, fallback: number) =>
    value != null ? Math.max(0, Math.min(100, Number(value))) : fallback;
  const whtPercent = clampPercent(input.whtPercent, current.whtPercent);

  const vatRegistered = input.vatRegistered ?? current.vatRegistered;
  // ปิดการจดทะเบียน = ล้างอัตราทิ้ง ไม่ให้ค้างไว้แล้วเผลอเปิดกลับมาเก็บย้อนหลัง
  const vatPercent = vatRegistered ? clampPercent(input.vatPercent, current.vatPercent) : 0;
  const companyTaxId =
    input.companyTaxId === undefined
      ? current.companyTaxId
      : input.companyTaxId
        ? String(input.companyTaxId).replace(/\D/g, '')
        : null;
  const companyLegalName =
    input.companyLegalName === undefined
      ? current.companyLegalName
      : input.companyLegalName
        ? String(input.companyLegalName).trim()
        : null;
  const vatEffectiveFromRaw =
    input.vatEffectiveFrom === undefined ? current.vatEffectiveFrom : input.vatEffectiveFrom;
  const vatEffectiveFrom = vatEffectiveFromRaw ? new Date(vatEffectiveFromRaw) : null;
  if (vatEffectiveFrom && Number.isNaN(vatEffectiveFrom.getTime())) {
    throw new AppError('VALIDATION', 'vatEffectiveFrom ต้องเป็นวันที่ที่อ่านได้', 400);
  }

  // เปิด VAT ได้ต่อเมื่อกรอกข้อมูลผู้เสียภาษีครบ — ใบกำกับที่ออกไปแล้วแก้ไม่ได้
  if (vatRegistered) {
    if (!isValidThaiTaxId(companyTaxId)) {
      throw new AppError('VALIDATION', 'กรอกเลขประจำตัวผู้เสียภาษี 13 หลักก่อนเปิด VAT', 400);
    }
    if (!companyLegalName) {
      throw new AppError('VALIDATION', 'กรอกชื่อผู้รับเงินตามที่จดทะเบียนก่อนเปิด VAT', 400);
    }
    if (!vatEffectiveFrom) {
      throw new AppError('VALIDATION', 'ระบุวันที่เริ่มคิด VAT ก่อนเปิดใช้งาน', 400);
    }
  }
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
      vatPercent,
      vatRegistered,
      vatEffectiveFrom,
      companyTaxId,
      companyLegalName,
      whtPercent,
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
      vatPercent,
      vatRegistered,
      vatEffectiveFrom,
      companyTaxId,
      companyLegalName,
      whtPercent,
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
