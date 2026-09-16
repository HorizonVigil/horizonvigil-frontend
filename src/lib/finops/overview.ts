/**
 * FinOps → Overview — pure aggregation and presentation-data helpers.
 *
 * The Overview is composed from the same backend endpoints already used by
 * Cost Management and Cost Optimization. This module does not make network
 * requests and does not fabricate unavailable metrics.
 *
 * Important contracts:
 * - Cost values remain in their source currency and are not silently converted
 *   here.
 * - Unresolvable connection keys are omitted rather than guessed.
 * - Budget/optimization/anomaly aggregates are defensive against malformed
 *   runtime payloads.
 * - Date calculations use UTC calendar dates so client timezone boundaries do
 *   not shift reporting windows.
 * - Exported helpers are pure and do not mutate caller-owned collections.
 */

import type {
  Budget,
  CostAnomaly,
  CostRecommendation,
  CostSnapshot,
} from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';
import type { BarDatum } from '../../components/charts/BarChart';
import type { DateRangePreset } from '../filterContext';

export type Provider = 'aws' | 'azure' | 'gcp';

export const PROVIDERS: readonly Provider[] = [
  'aws',
  'azure',
  'gcp',
];

export const PROVIDER_LABEL: Record<Provider, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegative(value: unknown): number {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

function normalizeString(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || toIsoDate(date) !== value) {
    return null;
  }

  return date;
}

function dateRangeToDays(range: DateRangePreset): number {
  switch (range) {
    case '1h':
      // Cost endpoints in this module are date-scoped, so the shortest
      // supported window is the current calendar day.
      return 1;
    case '7d':
      return 7;
    case '30d':
      return 30;
    case 'mtd':
      return new Date().getUTCDate();
    default:
      return 1;
  }
}

/**
 * Converts the FilterBar day preset into an inclusive UTC date range.
 */
export function rangeToFromTo(
  range: DateRangePreset,
): { from: string; to: string } {
  const days = dateRangeToDays(range);
  const to = new Date();
  const from = new Date(to);

  from.setUTCDate(from.getUTCDate() - days + 1);

  return {
    from: toIsoDate(from),
    to: toIsoDate(to),
  };
}

/** The immediately preceding equal-length UTC calendar window. */
export function previousRange({
  from,
  to,
}: {
  from: string;
  to: string;
}): { from: string; to: string } {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);

  if (!fromDate || !toDate) {
    return { from, to };
  }

  const days =
    Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;

  if (!Number.isFinite(days) || days <= 0) {
    return { from, to };
  }

  const previousTo = new Date(fromDate);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);

  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - days + 1);

  return {
    from: toIsoDate(previousFrom),
    to: toIsoDate(previousTo),
  };
}

/** Percentage change from previous to current; null means no valid baseline. */
export function percentChange(current: number, previous: number): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous) || previous <= 0) {
    return null;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function connectionForKey(
  accountKey: string,
  connections: readonly UnifiedAccountRow[],
): UnifiedAccountRow | null {
  for (const connection of connections) {
    if (connection.id === accountKey || connection.identifier === accountKey) {
      return connection;
    }
  }

  return null;
}

/** Cost by cloud. Unknown analytics keys are intentionally omitted. */
export function costByCloudBars(
  byAccount: Record<string, number>,
  connections: readonly UnifiedAccountRow[],
): BarDatum[] {
  const sums = new Map<Provider, number>();

  for (const [key, rawCost] of Object.entries(byAccount ?? {})) {
    const connection = connectionForKey(key, connections);
    if (!connection) continue;

    const provider = connection.provider;
    if (provider !== 'aws' && provider !== 'azure' && provider !== 'gcp') {
      continue;
    }

    const cost = nonNegative(rawCost);
    if (cost <= 0) continue;

    sums.set(provider, (sums.get(provider) ?? 0) + cost);
  }

  return PROVIDERS
    .filter((provider) => sums.has(provider))
    .map((provider) => ({
      label: PROVIDER_LABEL[provider],
      value: sums.get(provider) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.value - a.value || a.label.localeCompare(b.label),
    );
}

/** Cost by account/subscription/project, top N, resolved to a display name. */
export function costByAccountBars(
  byAccount: Record<string, number>,
  connections: readonly UnifiedAccountRow[],
  limit = 10,
): BarDatum[] {
  const safeLimit = normalizeLimit(limit, 10);

  return Object.entries(byAccount ?? {})
    .map(([key, rawValue]) => {
      const row = connectionForKey(key, connections);
      return {
        label: row?.name?.trim() || key || 'Unknown',
        value: nonNegative(rawValue),
      };
    })
    .filter((item) => item.value > 0)
    .sort(
      (a, b) =>
        b.value - a.value || a.label.localeCompare(b.label),
    )
    .slice(0, safeLimit);
}

/** Cost by environment. Unknown connection keys are omitted. */
export function costByEnvironmentBars(
  byAccount: Record<string, number>,
  connections: readonly UnifiedAccountRow[],
): BarDatum[] {
  const sums = new Map<string, number>();

  for (const [key, rawValue] of Object.entries(byAccount ?? {})) {
    const row = connectionForKey(key, connections);
    if (!row) continue;

    const value = nonNegative(rawValue);
    if (value <= 0) continue;

    const environment = normalizeString(row.environment, 'Unknown');
    sums.set(environment, (sums.get(environment) ?? 0) + value);
  }

  return [...sums.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort(
      (a, b) =>
        b.value - a.value || a.label.localeCompare(b.label),
    );
}

export function recordToBars(
  record: Record<string, number> | null | undefined,
  limit = 8,
): BarDatum[] {
  const safeLimit = normalizeLimit(limit, 8);

  return Object.entries(record ?? {})
    .map(([label, rawValue]) => ({
      label: normalizeString(label, 'Unknown'),
      value: nonNegative(rawValue),
    }))
    .filter((item) => item.value > 0)
    .sort(
      (a, b) =>
        b.value - a.value || a.label.localeCompare(b.label),
    )
    .slice(0, safeLimit);
}

export interface BudgetRollup {
  count: number;
  totalLimit: number;
  totalSpend: number;
  totalForecast: number;
  usedPercent: number | null;
  worst: 'ok' | 'warning' | 'exceeded' | null;
  exceededCount: number;
  warningCount: number;
}

const STATUS_RANK: Record<Budget['status'], number> = {
  ok: 0,
  warning: 1,
  exceeded: 2,
};

export function summarizeBudgets(
  budgets: readonly Budget[],
): BudgetRollup {
  if (!Array.isArray(budgets) || budgets.length === 0) {
    return {
      count: 0,
      totalLimit: 0,
      totalSpend: 0,
      totalForecast: 0,
      usedPercent: null,
      worst: null,
      exceededCount: 0,
      warningCount: 0,
    };
  }

  let totalLimit = 0;
  let totalSpend = 0;
  let totalForecast = 0;
  let exceededCount = 0;
  let warningCount = 0;
  let worst: Budget['status'] | null = null;

  for (const item of budgets) {
    totalLimit += nonNegative(item.monthly_limit);
    totalSpend += nonNegative(item.currentSpend);
    totalForecast += nonNegative(item.projectedSpend);

    if (item.status === 'exceeded') exceededCount += 1;
    if (item.status === 'warning') warningCount += 1;

    if (
      item.status in STATUS_RANK &&
      (worst === null || STATUS_RANK[item.status] > STATUS_RANK[worst])
    ) {
      worst = item.status;
    }
  }

  return {
    count: budgets.length,
    totalLimit,
    totalSpend,
    totalForecast,
    usedPercent:
      totalLimit > 0
        ? Math.round((totalSpend / totalLimit) * 100)
        : null,
    worst,
    exceededCount,
    warningCount,
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  rightsizing: 'Rightsizing',
  idle: 'Idle Resources',
  unused_storage: 'Unused Storage',
  reserved_instance: 'Reservations',
  savings_plan: 'Savings Plans',
};

/** Savings by category, limited to recommendations explicitly marked actionable. */
export function optimizationByCategory(
  recs: readonly CostRecommendation[],
): BarDatum[] {
  const sums = new Map<string, number>();

  for (const recommendation of recs) {
    if (recommendation.validity !== 'actionable') continue;

    const value = nonNegative(
      recommendation.potential_monthly_savings,
    );
    if (value <= 0) continue;

    const category = normalizeString(
      recommendation.category,
      'other',
    );

    sums.set(category, (sums.get(category) ?? 0) + value);
  }

  return [...sums.entries()]
    .map(([category, value]) => ({
      label:
        CATEGORY_LABEL[category] ?? category.replace(/_/g, ' '),
      value,
    }))
    .filter((item) => item.value > 0)
    .sort(
      (a, b) =>
        b.value - a.value || a.label.localeCompare(b.label),
    );
}

export type AnomalySeverity = 'critical' | 'warning';

export function anomalySeverity(
  percentChange: number,
): AnomalySeverity {
  const value = isFiniteNumber(percentChange)
    ? Math.abs(percentChange)
    : 0;

  return value >= 50 ? 'critical' : 'warning';
}

export function sortAnomalies(
  anomalies: readonly CostAnomaly[],
): CostAnomaly[] {
  return [...anomalies].sort((a, b) => {
    const impactA = Math.abs(nonNegative(a.dollar_impact));
    const impactB = Math.abs(nonNegative(b.dollar_impact));

    return (
      impactB - impactA ||
      String(a.id).localeCompare(String(b.id))
    );
  });
}

/**
 * Splits an already-loaded daily series at the midpoint. It does not make a
 * second backend request and therefore is not a true arbitrary historical
 * previous-period comparison unless the supplied series contains both halves.
 */
export function periodOverPeriod(
  daily: readonly { date: string; cost: number }[],
): {
  current: number;
  previous: number;
  changePercent: number | null;
} {
  if (!Array.isArray(daily) || daily.length === 0) {
    return { current: 0, previous: 0, changePercent: null };
  }

  if (daily.length === 1) {
    const current = nonNegative(daily[0].cost);
    return { current, previous: 0, changePercent: null };
  }

  const mid = Math.floor(daily.length / 2);
  const previous = daily
    .slice(0, mid)
    .reduce((sum, point) => sum + nonNegative(point.cost), 0);
  const current = daily
    .slice(mid)
    .reduce((sum, point) => sum + nonNegative(point.cost), 0);

  return {
    current,
    previous,
    changePercent: percentChange(current, previous),
  };
}

export interface CostChange {
  label: string;
  current: number;
  previous: number;
  delta: number;
}

/** Per-service deltas, split into independently capped increases/decreases. */
export function biggestChanges(
  current: Record<string, number>,
  previous: Record<string, number>,
  limit = 5,
): {
  increases: CostChange[];
  decreases: CostChange[];
} {
  const safeLimit = normalizeLimit(limit, 5);
  const services = new Set([
    ...Object.keys(current ?? {}),
    ...Object.keys(previous ?? {}),
  ]);

  const changes: CostChange[] = [...services].map((label) => {
    const currentValue = nonNegative(current?.[label]);
    const previousValue = nonNegative(previous?.[label]);

    return {
      label,
      current: currentValue,
      previous: previousValue,
      delta: currentValue - previousValue,
    };
  });

  const increases = changes
    .filter((change) => change.delta > 0)
    .sort(
      (a, b) =>
        b.delta - a.delta || a.label.localeCompare(b.label),
    )
    .slice(0, safeLimit);

  const decreases = changes
    .filter((change) => change.delta < 0)
    .sort(
      (a, b) =>
        a.delta - b.delta || a.label.localeCompare(b.label),
    )
    .slice(0, safeLimit);

  return { increases, decreases };
}

/** Aggregates daily cost by usage date. Invalid cost values contribute zero. */
export function aggregateDaily(
  rows: readonly CostSnapshot[],
): { date: string; cost: number }[] {
  const byDate = new Map<string, number>();

  for (const row of rows) {
    if (!row) continue;

    const date = normalizeString(row.usage_date);
    if (!date) continue;

    const parsedCost = Number(row.unblended_cost);
    const cost = isFiniteNumber(parsedCost) ? parsedCost : 0;

    byDate.set(date, (byDate.get(date) ?? 0) + cost);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost }));
}
