import { z } from "zod";

/** Strip formatting; convert +66/66 prefix to leading 0. */
export function normalizeThaiPhone(raw: string): string {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+66")) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith("66") && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  return digits.replace(/\D/g, "");
}

/** Thai mobile/phone: 10 digits starting with 0 (e.g. 0999266218). */
export function isValidThaiPhone(raw: string): boolean {
  const digits = normalizeThaiPhone(raw);
  return /^0\d{9}$/.test(digits);
}

export function normalizeThaiZipCode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidThaiZipCode(raw: string): boolean {
  return /^\d{5}$/.test(normalizeThaiZipCode(raw));
}

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

/** Names and address lines: Thai/Latin/digits and common punctuation. */
export function freeTextField(label: string, maxLen: number) {
  return z
    .string()
    .trim()
    .min(1, `กรุณากรอก${label}`)
    .max(maxLen, `${label}ยาวเกินไป`)
    .refine((value) => !CONTROL_CHARS.test(value), {
      message: `${label}มีอักขระที่ไม่รองรับ`,
    });
}

export const thaiPhoneSchema = z
  .string()
  .min(1, "กรุณากรอกเบอร์โทรศัพท์")
  .transform(normalizeThaiPhone)
  .pipe(
    z
      .string()
      .regex(/^0\d{9}$/, "กรุณากรอกเบอร์โทรศัพท์ 10 หลัก (เช่น 0812345678)")
  );

export const thaiZipCodeSchema = z
  .string()
  .min(1, "กรุณากรอกรหัสไปรษณีย์")
  .transform(normalizeThaiZipCode)
  .pipe(
    z.string().regex(/^\d{5}$/, "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก")
  );

export const submitKycInputSchema = z.object({
  fullName: z.string().trim().max(200).optional().default("-"),
  phone: thaiPhoneSchema,
});

export const shippingAddressInputSchema = z.object({
  shippingName: freeTextField("ชื่อผู้รับ", 200),
  shippingPhone: thaiPhoneSchema,
  shippingAddress: freeTextField("ที่อยู่", 500),
  shippingSubdistrict: freeTextField("ตำบล/แขวง", 100),
  shippingDistrict: freeTextField("อำเภอ/เขต", 100),
  shippingProvince: freeTextField("จังหวัด", 100),
  shippingZipCode: thaiZipCodeSchema,
});
