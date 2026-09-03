import { describe, expect, it } from 'vitest';
import { effectiveTaxRates, isValidThaiTaxId } from '../taxPolicy';

const base = {
  vatRegistered: false,
  vatPercent: 0,
  vatEffectiveFrom: null,
  whtPercent: 0,
};

describe('when tax applies', () => {
  it('charges nothing while the company is not VAT registered', () => {
    const rates = effectiveTaxRates({ ...base, vatPercent: 7 });
    expect(rates.vatPercent).toBe(0);
    expect(rates.reason).toBe('not_registered');
  });

  it('does not charge VAT on orders paid before the registration date', () => {
    const settings = {
      ...base,
      vatRegistered: true,
      vatPercent: 7,
      vatEffectiveFrom: '2027-01-01T00:00:00.000Z',
    };
    expect(effectiveTaxRates(settings, { at: new Date('2026-12-31T23:59:00Z') }).vatPercent).toBe(0);
    expect(effectiveTaxRates(settings, { at: new Date('2026-12-31T23:59:00Z') }).reason).toBe('not_yet_effective');
    expect(effectiveTaxRates(settings, { at: new Date('2027-01-01T00:00:01Z') }).vatPercent).toBe(7);
  });

  it('charges from the moment it is switched on when no date is set', () => {
    const rates = effectiveTaxRates({ ...base, vatRegistered: true, vatPercent: 7 });
    expect(rates.vatPercent).toBe(7);
    expect(rates.reason).toBe('active');
  });

  it('withholds only from corporate sellers', () => {
    const settings = { ...base, whtPercent: 3 };
    expect(effectiveTaxRates(settings, { sellerIsCorporate: false }).whtPercent).toBe(0);
    expect(effectiveTaxRates(settings, { sellerIsCorporate: true }).whtPercent).toBe(3);
  });

  it('accepts a 13-digit tax id in any punctuation', () => {
    expect(isValidThaiTaxId('1234567890123')).toBe(true);
    expect(isValidThaiTaxId('1-2345-67890-12-3')).toBe(true);
    expect(isValidThaiTaxId('12345')).toBe(false);
    expect(isValidThaiTaxId(null)).toBe(false);
  });
});
