/**
 * Shared formatting utilities across HorizonVigil microservices and UI.
 */

/** USD currency formatting */
export function money(n: number, fractionDigits = 0): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: fractionDigits });
}

/** Returns YYYY-MM-DD for X days ago */
export function daysAgoISO(days: number): string {
  return new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Formats dotted or snake_case activity actions (e.g. org.user_created -> org user created — user created) */
export function formatActivityAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\./g, ' — ');
}

/** Formats date strings/timestamps safely with fallback */
export function formatDate(value: string | number | Date | null | undefined, fallback = 'Unknown time'): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

/** Computes health status label & tier CSS class based on health score (0-100) */
export function healthTier(score: number): { label: string; className: string } {
  if (score >= 90) return { label: 'Excellent', className: 'text-emerald-600 dark:text-emerald-400 font-medium' };
  if (score >= 70) return { label: 'Needs attention', className: 'text-amber-600 dark:text-amber-400 font-medium' };
  if (score >= 40) return { label: 'Degraded', className: 'text-orange-600 dark:text-orange-400 font-medium' };
  return { label: 'Critical', className: 'text-red-600 dark:text-red-400 font-medium' };
}
