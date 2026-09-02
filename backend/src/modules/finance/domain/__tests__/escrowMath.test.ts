import { describe, expect, it } from 'vitest';
import { quoteEscrow } from '../escrowMath';

describe('escrow money math', () => {
  it('never loses a satang: gross + shipping = platform take + seller net', () => {
    const quote = quoteEscrow({
      merchandiseThb: 1234.56,
      shippingFeeThb: 45,
      gpPercent: 5,
      vatPercent: 7,
      whtPercent: 3,
    });
    const { gross, shipping, platformTake, netMerchantAmount } = quote.satang;
    expect(platformTake + netMerchantAmount).toBe(gross + shipping);
  });

  it('charges GP on goods only — shipping passes through to the seller', () => {
    const withShipping = quoteEscrow({ merchandiseThb: 1000, shippingFeeThb: 50, gpPercent: 5 });
    const without = quoteEscrow({ merchandiseThb: 1000, gpPercent: 5 });
    expect(withShipping.satang.gpAmount).toBe(without.satang.gpAmount);
    expect(withShipping.satang.netMerchantAmount - without.satang.netMerchantAmount).toBe(5000);
  });

  it('keeps VAT and WHT off until they are switched on', () => {
    const quote = quoteEscrow({ merchandiseThb: 1000, gpPercent: 5 });
    expect(quote.satang.vatAmount).toBe(0);
    expect(quote.satang.whtAmount).toBe(0);
    expect(quote.satang.netMerchantAmount).toBe(95_000);
  });

  it('puts VAT on the platform fee, not on the goods', () => {
    const quote = quoteEscrow({ merchandiseThb: 1000, gpPercent: 5, vatPercent: 7 });
    expect(quote.satang.gpAmount).toBe(5000);
    expect(quote.satang.vatAmount).toBe(350);
    expect(quote.satang.netMerchantAmount).toBe(100_000 - 5000 - 350);
  });

  it('leaves withholding tax with the seller to remit', () => {
    const quote = quoteEscrow({ merchandiseThb: 1000, gpPercent: 5, vatPercent: 7, whtPercent: 3 });
    expect(quote.satang.whtAmount).toBe(150);
    expect(quote.satang.platformTake).toBe(5000 + 350 - 150);
    expect(quote.satang.netMerchantAmount).toBe(100_000 - (5000 + 350 - 150));
  });

  it('accepts a rate written as 5 or as 0.05', () => {
    expect(quoteEscrow({ merchandiseThb: 1000, gpPercent: 5 }).satang.gpAmount).toBe(5000);
    expect(quoteEscrow({ merchandiseThb: 1000, gpPercent: 0.05 }).satang.gpAmount).toBe(5000);
  });

  it('handles a zero-rate shop without taking anything', () => {
    const quote = quoteEscrow({ merchandiseThb: 500, gpPercent: 0, vatPercent: 7 });
    expect(quote.satang.platformTake).toBe(0);
    expect(quote.satang.netMerchantAmount).toBe(50_000);
  });
});
