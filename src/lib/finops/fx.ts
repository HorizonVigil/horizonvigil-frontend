/**
 * FinOps' optional display currency (spec's "configurable display
 * currency" gap). All cost data in this app is genuinely denominated in
 * USD (AWS/Azure billing, cost_snapshots.currency) — this converts it for
 * *display only*, using real rates from the backend's /fx-rates endpoint
 * (frankfurter.dev, ECB reference rates), never a fabricated or hardcoded
 * rate. Scoped to the FinOps Overview KPI strip only, not every dollar
 * figure across the module — see FinOpsOverviewTab.tsx.
 */

export const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_LABEL: Record<Currency, string> = { USD: 'USD ($)', EUR: 'EUR (€)', GBP: 'GBP (£)', INR: 'INR (₹)' };

/** Converts a USD amount into `currency` using `rates` (1 USD = rates[currency] units). Returns the amount unconverted for USD itself, or when the rate isn't available yet (rates still loading, or an unexpected currency) — never guesses a rate. */
export function convertFromUsd(amountUsd: number, currency: string, rates: Record<string, number> | undefined): number {
  if (currency === 'USD') return amountUsd;
  const rate = rates?.[currency];
  if (!rate) return amountUsd;
  return amountUsd * rate;
}

/** Currency-aware money formatting, same rounding convention as lib/format.ts's money() (which stays hardcoded to USD for the rest of the app) — extended here to whichever SUPPORTED_CURRENCIES the viewer picked. */
export function formatMoney(amountUsd: number, currency: string, rates: Record<string, number> | undefined, fractionDigits = 0): string {
  const converted = convertFromUsd(amountUsd, currency, rates);
  return converted.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: fractionDigits });
}
