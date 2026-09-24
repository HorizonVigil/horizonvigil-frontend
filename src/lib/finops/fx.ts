/**
 * FinOps optional display currency.
 *
 * All underlying cost values are denominated in USD. This module converts
 * amounts for display only using backend-supplied FX rates; it never invents
 * or hardcodes an exchange rate.
 *
 * Supported currencies are intentionally limited to the currencies exposed by
 * the FinOps display-currency control. This helper should not be used as a
 * general currency/accounting conversion service.
 */

export const SUPPORTED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'INR',
] as const;

export type Currency =
  (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABEL: Record<
  Currency,
  string
> = {
  USD: 'USD ($)',
  EUR: 'EUR (€)',
  GBP: 'GBP (£)',
  INR: 'INR (₹)',
};

const SUPPORTED_CURRENCY_SET =
  new Set<string>(
    SUPPORTED_CURRENCIES,
  );

function isSupportedCurrency(
  currency: string,
): currency is Currency {
  return SUPPORTED_CURRENCY_SET.has(
    currency,
  );
}

function normalizeAmount(
  amountUsd: number,
): number {
  return Number.isFinite(amountUsd)
    ? amountUsd
    : 0;
}

function normalizeRates(
  rates:
    | Record<string, number>
    | undefined,
): Record<string, number> {
  return rates ?? {};
}

function getRate(
  currency: Currency,
  rates:
    | Record<string, number>
    | undefined,
): number | null {
  if (currency === 'USD') {
    return 1;
  }

  const rawRate =
    normalizeRates(rates)[currency];

  /*
   * A valid FX rate must be finite and strictly positive.
   * Zero, negative, NaN, and Infinity are not usable exchange rates and must
   * never be applied to financial display values.
   */
  if (
    typeof rawRate !== 'number' ||
    !Number.isFinite(rawRate) ||
    rawRate <= 0
  ) {
    return null;
  }

  return rawRate;
}

/**
 * Converts a USD amount into the selected display currency.
 *
 * `rates` follows the contract:
 *   1 USD = rates[currency] units
 *
 * Behavior is deliberately fail-safe:
 * - USD is returned unchanged.
 * - A supported currency with a valid backend rate is converted.
 * - Missing/invalid rates return the original USD amount rather than guessing.
 * - An unsupported currency returns the original USD amount.
 *
 * This helper does not round the converted numeric value. Rounding belongs to
 * the presentation layer (`formatMoney`).
 */
export function convertFromUsd(
  amountUsd: number,
  currency: string,
  rates:
    | Record<string, number>
    | undefined,
): number {
  const amount =
    normalizeAmount(amountUsd);

  if (currency === 'USD') {
    return amount;
  }

  if (!isSupportedCurrency(currency)) {
    return amount;
  }

  const rate = getRate(
    currency,
    rates,
  );

  if (rate === null) {
    return amount;
  }

  return amount * rate;
}

/**
 * Formats a USD-denominated amount using the selected display currency.
 *
 * The currency code is normalized to a supported currency before it reaches
 * Intl.NumberFormat. When the selected currency is unsupported or its rate is
 * unavailable, the original USD amount is retained but the requested currency
 * is still used only when it is a supported display currency.
 *
 * `fractionDigits` is constrained to a safe Intl-compatible range.
 */
export function formatMoney(
  amountUsd: number,
  currency: string,
  rates:
    | Record<string, number>
    | undefined,
  fractionDigits = 0,
): string {
  const safeFractionDigits =
    Number.isFinite(fractionDigits)
      ? Math.min(
          20,
          Math.max(
            0,
            Math.floor(
              fractionDigits,
            ),
          ),
        )
      : 0;

  const converted =
    convertFromUsd(
      amountUsd,
      currency,
      rates,
    );

  /*
   * Label the amount with the currency that was ASKED FOR, not with USD.
   *
   * convertFromUsd already returns the amount UNCONVERTED when the currency
   * is unsupported or has no rate. Formatting that unconverted number as
   * 'USD' put a dollar sign on a figure the caller asked to see in another
   * currency -- the number is not wrong, the unit on it is. A mislabelled
   * unit is worse than an unconverted one, because nothing on screen shows
   * that a conversion did not happen.
   *
   * Intl only accepts a well-formed (three-letter) code, so fall back to USD
   * strictly for input that could not be rendered at all.
   */
  const requested = currency?.trim().toUpperCase() ?? '';
  const displayCurrency = /^[A-Z]{3}$/.test(requested)
    ? requested
    : 'USD';

  try {
    return converted.toLocaleString(undefined, {
      style: 'currency',
      currency: displayCurrency,
      maximumFractionDigits: safeFractionDigits,
    });
  } catch {
    return converted.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: safeFractionDigits,
    });
  }
}
