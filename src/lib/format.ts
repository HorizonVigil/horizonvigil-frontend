/**
 * Shared formatting utilities across HorizonVigil microservices and UI.
 *
 * These helpers are presentation utilities only. They deliberately avoid
 * throwing on malformed external values so dashboards, tables, exports, and
 * background refreshes can degrade gracefully instead of failing an entire
 * render.
 */

const DEFAULT_MONEY_FRACTION_DIGITS = 0;
const MIN_FRACTION_DIGITS = 0;
const MAX_FRACTION_DIGITS = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clampFractionDigits(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MONEY_FRACTION_DIGITS;
  }

  return Math.min(
    MAX_FRACTION_DIGITS,
    Math.max(MIN_FRACTION_DIGITS, Math.trunc(value)),
  );
}

function normalizeFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * USD currency formatting.
 *
 * Invalid/non-finite values are rendered as $0 rather than producing
 * "NaN" or "Infinity" in user-facing UI.
 */
export function money(
  value: number,
  fractionDigits = DEFAULT_MONEY_FRACTION_DIGITS,
): string {
  const safeValue = normalizeFiniteNumber(value);
  const digits = clampFractionDigits(fractionDigits);

  return safeValue.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Returns YYYY-MM-DD for the requested lookback day.
 *
 * The existing HorizonVigil contract treats `days = 1` as today. Negative,
 * non-finite, and fractional values are normalized to the nearest sensible
 * non-negative integer.
 */
export function daysAgoISO(days: number): string {
  const safeDays = Number.isFinite(days)
    ? Math.max(1, Math.trunc(days))
    : 1;

  const timestamp = Date.now() - (safeDays - 1) * MS_PER_DAY;

  return new Date(timestamp).toISOString().slice(0, 10);
}

/**
 * Formats dotted and snake_case activity actions.
 *
 * Examples:
 *   org.user_created -> org — user created
 *   user_created     -> user created
 *
 * Empty/malformed values return an empty string instead of throwing.
 */
export function formatActivityAction(action: string): string {
  if (typeof action !== 'string') return '';

  return action
    .trim()
    .replace(/_/g, ' ')
    .replace(/\./g, ' — ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safely formats a date/time value using the browser's locale.
 *
 * Invalid dates return the supplied fallback. Numeric zero is a valid Unix
 * epoch timestamp and is therefore handled correctly rather than being
 * mistaken for an absent value.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  fallback = 'Unknown time',
): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleString();
}

/**
 * Computes the health status label and Tailwind CSS class from a 0-100 score.
 *
 * Scores outside the expected range are clamped before classification so a
 * malformed backend value cannot create a misleading tier.
 */
export function healthTier(
  score: number,
): { label: string; className: string } {
  const safeScore = Number.isFinite(score)
    ? Math.min(100, Math.max(0, score))
    : 0;

  if (safeScore >= 90) {
    return {
      label: 'Excellent',
      className:
        'text-emerald-600 dark:text-emerald-400 font-medium',
    };
  }

  if (safeScore >= 70) {
    return {
      label: 'Needs attention',
      className:
        'text-amber-600 dark:text-amber-400 font-medium',
    };
  }

  if (safeScore >= 40) {
    return {
      label: 'Degraded',
      className:
        'text-orange-600 dark:text-orange-400 font-medium',
    };
  }

  return {
    label: 'Critical',
    className:
      'text-red-600 dark:text-red-400 font-medium',
  };
}
