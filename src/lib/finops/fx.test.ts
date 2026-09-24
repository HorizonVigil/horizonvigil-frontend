import { describe, expect, it } from 'vitest';

import { convertFromUsd, formatMoney } from './fx';

const RATES = {
  EUR: 0.86,
  GBP: 0.74,
  INR: 94.5,
} as const;

const currencyFormat = (amount: number, currency: string) =>
  amount.toLocaleString(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });

describe('convertFromUsd', () => {
  it('returns the amount unchanged for USD', () => {
    expect(convertFromUsd(100, 'USD', RATES)).toBe(100);
  });

  it('multiplies by the rate for a supported currency', () => {
    expect(convertFromUsd(100, 'EUR', RATES)).toBe(86);
  });

  it('supports fractional exchange rates without rounding the calculation', () => {
    expect(convertFromUsd(100, 'GBP', RATES)).toBe(74);
  });

  it('converts to INR using the supplied rate', () => {
    expect(convertFromUsd(100, 'INR', RATES)).toBe(9450);
  });

  it('returns the original amount when rates are unavailable', () => {
    expect(convertFromUsd(100, 'EUR', undefined)).toBe(100);
  });

  it('returns the original amount when the requested currency has no rate', () => {
    expect(convertFromUsd(100, 'ZZZ', RATES)).toBe(100);
  });

  it('preserves zero without introducing a conversion artifact', () => {
    expect(convertFromUsd(0, 'EUR', RATES)).toBe(0);
  });

  it('preserves negative values for callers that pass signed amounts', () => {
    expect(convertFromUsd(-100, 'EUR', RATES)).toBe(-86);
  });

  it('does not mutate the supplied rates object', () => {
    const rates = { EUR: 0.86, GBP: 0.74 };

    convertFromUsd(100, 'EUR', rates);

    expect(rates).toEqual({
      EUR: 0.86,
      GBP: 0.74,
    });
  });
});

describe('formatMoney', () => {
  it('formats a converted amount using the requested currency', () => {
    expect(formatMoney(100, 'EUR', RATES)).toBe(
      currencyFormat(86, 'EUR'),
    );
  });

  it('uses the original amount when exchange rates are unavailable', () => {
    expect(formatMoney(100, 'EUR', undefined)).toBe(
      currencyFormat(100, 'EUR'),
    );
  });

  it('uses the original amount when the requested currency has no rate', () => {
    expect(formatMoney(100, 'ZZZ', RATES)).toBe(
      currencyFormat(100, 'ZZZ'),
    );
  });

  it('formats zero consistently', () => {
    expect(formatMoney(0, 'EUR', RATES)).toBe(
      currencyFormat(0, 'EUR'),
    );
  });

  it('preserves signed amounts in the formatted result', () => {
    expect(formatMoney(-100, 'EUR', RATES)).toBe(
      currencyFormat(-86, 'EUR'),
    );
  });

  it('converts and formats INR using the supplied rate', () => {
    expect(formatMoney(100, 'INR', RATES)).toBe(
      currencyFormat(9450, 'INR'),
    );
  });
});
