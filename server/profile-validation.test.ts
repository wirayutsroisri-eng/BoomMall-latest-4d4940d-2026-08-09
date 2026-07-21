import { describe, expect, it } from "vitest";
import {
  isValidThaiPhone,
  isValidThaiZipCode,
  normalizeThaiPhone,
  normalizeThaiZipCode,
  shippingAddressInputSchema,
  submitKycInputSchema,
} from "@shared/profile-validation";

describe("profile-validation", () => {
  it("normalizes Thai phone with dashes and spaces", () => {
    expect(normalizeThaiPhone("099-926-6218")).toBe("0999266218");
    expect(normalizeThaiPhone("099 926 6218")).toBe("0999266218");
    expect(normalizeThaiPhone("+66999266218")).toBe("0999266218");
  });

  it("accepts valid 10-digit Thai mobile numbers", () => {
    expect(isValidThaiPhone("0999266218")).toBe(true);
    expect(isValidThaiPhone("081-234-5678")).toBe(true);
    expect(isValidThaiPhone("081234567")).toBe(false);
  });

  it("validates postal code as 5 digits", () => {
    expect(isValidThaiZipCode("10110")).toBe(true);
    expect(normalizeThaiZipCode("10 110")).toBe("10110");
    expect(isValidThaiZipCode("1011")).toBe(false);
  });

  it("accepts Thai address text with slash and hyphen", () => {
    const parsed = shippingAddressInputSchema.safeParse({
      shippingName: "คุณสมชาย ใจดี",
      shippingPhone: "099-926-6218",
      shippingAddress: "123/4 ถ.สุขุมวิท ซ.10",
      shippingSubdistrict: "คลองตัน",
      shippingDistrict: "คลองเตย",
      shippingProvince: "กรุงเทพมหานคร",
      shippingZipCode: "10110",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.shippingPhone).toBe("0999266218");
      expect(parsed.data.shippingZipCode).toBe("10110");
    }
  });

  it("rejects invalid phone in submitKyc schema", () => {
    const parsed = submitKycInputSchema.safeParse({
      fullName: "-",
      phone: "12345",
    });
    expect(parsed.success).toBe(false);
  });
});
