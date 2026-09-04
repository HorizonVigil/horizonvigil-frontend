import { describe, it, expect } from 'vitest';
import { convertFromUsd, formatMoney } from './fx';

const rates = { EUR: 0.86, GBP: 0.74, INR: 94.5 };

describe('convertFromUsd', () => {
  it('returns the amount unchanged for USD', () => {
    expect(convertFromUsd(100, 'USD', rates)).toBe(100);
  });

  it('multiplies by the rate for a supported currency', () => {
    expect(convertFromUsd(100, 'EUR', rates)).toBe(86);
  });

  it('returns the amount unconverted when rates are still loading (undefined)', () => {
    expect(convertFromUsd(100, 'EUR', undefined)).toBe(100);
  });

  it('returns the amount unconverted when the currency has no rate', () => {
    expect(convertFromUsd(100, 'ZZZ', rates)).toBe(100);
  });
});

describe('formatMoney', () => {
  it('formats a converted amount with the target currency symbol', () => {
    expect(formatMoney(100, 'EUR', rates)).toBe((86).toLocaleString(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));
  });

  it('falls back to a USD-denominated format when rates are missing', () => {
    expect(formatMoney(100, 'EUR', undefined)).toBe((100).toLocaleString(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));
  });
});
