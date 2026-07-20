import { describe, it, expect } from "vitest";
import {
  normalizeWholesalePriceTiers,
  priceTierForQuantity,
  bestWholesaleTier,
  WholesalePriceTierError,
} from "../shared/wholesale-pricing";

describe("wholesale-pricing", () => {
  it("normalizes valid tiers sorted by minQty", () => {
    const tiers = normalizeWholesalePriceTiers(500, [
      { minQty: 50, pricePerUnit: 380 },
      { minQty: 20, pricePerUnit: 420 },
    ]);
    expect(tiers).toEqual([
      { minQty: 20, pricePerUnit: 420 },
      { minQty: 50, pricePerUnit: 380 },
    ]);
  });

  it("rejects tier price higher than previous step", () => {
    expect(() =>
      normalizeWholesalePriceTiers(500, [{ minQty: 10, pricePerUnit: 600 }])
    ).toThrow(WholesalePriceTierError);
  });

  it("picks correct tier for quantity", () => {
    const tiers = [
      { minQty: 20, pricePerUnit: 420 },
      { minQty: 50, pricePerUnit: 380 },
    ];
    expect(priceTierForQuantity(500, tiers, 25).pricePerUnit).toBe(420);
    expect(priceTierForQuantity(500, tiers, 50).pricePerUnit).toBe(380);
  });

  it("returns best wholesale tier", () => {
    const t = bestWholesaleTier([
      { minQty: 20, pricePerUnit: 420 },
      { minQty: 50, pricePerUnit: 380 },
    ]);
    expect(t?.minQty).toBe(20);
  });
});
