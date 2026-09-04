/**
 * FinOps → Overview — pure aggregation layer (spec §8–9, §11–15, §19–22,
 * §27–29). Composed on the frontend from the same endpoints Cost Management
 * and Cost Optimization already use (getCostAnalytics, getCostForecast,
 * getCostExplorer, getBudgets, getCostOptimizationDashboard,
 * getCostAnomalies, getSavingsOpportunities) — no new backend calls.
 *
 * No fabricated numbers: a metric this compose layer genuinely can't
 * produce (true resource-level cost — CostSnapshot is service+account+date
 * granularity, not per-resource) is simply not offered, rather than
 * approximated.
 */
import type { Budget, CostAnomaly, CostRecommendation, CostSnapshot } from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';
import type { BarDatum } from '../../components/charts/BarChart';
import type { DateRangePreset } from '../filterContext';

// Not imported from filterContext.tsx on purpose: that module has a real
// (non-type) `import { api } from './api'` at its top, which throws at
// vitest module-load time with no VITE_SUPABASE_URL set (see lib/supabase.ts)
// — the same reason lib/overview/scopeLogic.ts exists as its own file.
function dateRangeToDays(range: DateRangePreset): number {
  switch (range) {
    case '1h': return 1;
    case '7d': return 7;
    case '30d': return 30;
    case 'mtd': return new Date().getDate();
  }
}

export type Provider = 'aws' | 'azure' | 'gcp';
export const PROVIDER_LABEL: Record<Provider, string> = { aws: 'AWS', azure: 'Azure', gcp: 'GCP' };

/** Converts the FilterBar's day-count preset into ISO from/to dates for the cost-management-api's date-scoped endpoints. Shared with Cost Management's own copy. */
export function rangeToFromTo(range: DateRangePreset): { from: string; to: string } {
  const days = dateRangeToDays(range);
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** The immediately-preceding, equal-length window before `{from, to}` — spec §11/§39's "vs Previous Period". */
export function previousRange({ from, to }: { from: string; to: string }): { from: string; to: string } {
  const fromD = new Date(`${from}T00:00:00Z`);
  const toD = new Date(`${to}T00:00:00Z`);
  const days = Math.round((toD.getTime() - fromD.getTime()) / 86_400_000) + 1;
  const prevTo = new Date(fromD);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - days + 1);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

/** % change from `previous` to `current`, or null when there's nothing to compare against (avoids a divide-by-zero reading as -100%/+Infinity). */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function aggregateDaily(rows: CostSnapshot[]): { date: string; cost: number }[] {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.usage_date, (byDate.get(r.usage_date) ?? 0) + Number(r.unblended_cost));
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, cost]) => ({ date, cost }));
}

/** Resolve which provider an analytics `byAccount` key belongs to — keys are native account/subscription/project ids OR connection ids depending on the source, so check both. */
function providerOf(accountKey: string, connections: UnifiedAccountRow[]): Provider | null {
  const row = connections.find((c) => c.id === accountKey || c.identifier === accountKey);
  return row ? row.provider : null;
}

/** Cost by cloud (spec §12) — sums `byAccount` entries per resolved provider. Unresolvable keys (no matching connection) are dropped rather than guessed. */
export function costByCloudBars(byAccount: Record<string, number>, connections: UnifiedAccountRow[]): BarDatum[] {
  const sums = new Map<Provider, number>();
  for (const [key, cost] of Object.entries(byAccount)) {
    const p = providerOf(key, connections);
    if (!p) continue;
    sums.set(p, (sums.get(p) ?? 0) + cost);
  }
  return (['aws', 'azure', 'gcp'] as const)
    .filter((p) => sums.has(p))
    .map((p) => ({ label: PROVIDER_LABEL[p], value: sums.get(p)! }))
    .sort((a, b) => b.value - a.value);
}

/** Cost by account/subscription/project (spec §13) — top N, resolved to a display name where possible. */
export function costByAccountBars(byAccount: Record<string, number>, connections: UnifiedAccountRow[], limit = 10): BarDatum[] {
  return Object.entries(byAccount)
    .map(([key, value]) => {
      const row = connections.find((c) => c.id === key || c.identifier === key);
      return { label: row ? row.name : key, value };
    })
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** Cost by environment (spec §17) — sums `byAccount` per connection's environment. Unresolvable keys are dropped, same as costByCloudBars. */
export function costByEnvironmentBars(byAccount: Record<string, number>, connections: UnifiedAccountRow[]): BarDatum[] {
  const sums = new Map<string, number>();
  for (const [key, cost] of Object.entries(byAccount)) {
    const row = connections.find((c) => c.id === key || c.identifier === key);
    if (!row) continue;
    sums.set(row.environment, (sums.get(row.environment) ?? 0) + cost);
  }
  return [...sums.entries()].map(([label, value]) => ({ label, value })).filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
}

export function recordToBars(record: Record<string, number> | null | undefined, limit = 8): BarDatum[] {
  return Object.entries(record ?? {})
    .map(([label, value]) => ({ label, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// ── Budget rollup (spec §19) ────────────────────────────────────────────────

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

const STATUS_RANK: Record<Budget['status'], number> = { ok: 0, warning: 1, exceeded: 2 };

export function summarizeBudgets(budgets: Budget[]): BudgetRollup {
  if (budgets.length === 0) {
    return { count: 0, totalLimit: 0, totalSpend: 0, totalForecast: 0, usedPercent: null, worst: null, exceededCount: 0, warningCount: 0 };
  }
  const totalLimit = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpend = budgets.reduce((s, b) => s + b.currentSpend, 0);
  const totalForecast = budgets.reduce((s, b) => s + b.projectedSpend, 0);
  const worst = budgets.reduce<Budget['status']>((w, b) => (STATUS_RANK[b.status] > STATUS_RANK[w] ? b.status : w), 'ok');
  return {
    count: budgets.length,
    totalLimit,
    totalSpend,
    totalForecast,
    usedPercent: totalLimit > 0 ? Math.round((totalSpend / totalLimit) * 100) : null,
    worst,
    exceededCount: budgets.filter((b) => b.status === 'exceeded').length,
    warningCount: budgets.filter((b) => b.status === 'warning').length,
  };
}

// ── Optimization breakdown (spec §22) ───────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  rightsizing: 'Rightsizing',
  idle: 'Idle Resources',
  unused_storage: 'Unused Storage',
  reserved_instance: 'Reservations',
  savings_plan: 'Savings Plans',
};

export function optimizationByCategory(recs: CostRecommendation[]): BarDatum[] {
  const sums = new Map<string, number>();
  for (const r of recs) sums.set(r.category, (sums.get(r.category) ?? 0) + r.potential_monthly_savings);
  return [...sums.entries()]
    .map(([category, value]) => ({ label: CATEGORY_LABEL[category] ?? category.replace(/_/g, ' '), value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
}

// ── Anomaly severity (spec §21) ─────────────────────────────────────────────

export type AnomalySeverity = 'critical' | 'warning';

export function anomalySeverity(percentChange: number): AnomalySeverity {
  return percentChange >= 50 ? 'critical' : 'warning';
}

export function sortAnomalies(anomalies: CostAnomaly[]): CostAnomaly[] {
  return [...anomalies].sort((a, b) => b.dollar_impact - a.dollar_impact);
}

// ── Cost trend (spec §11) — cumulative-vs-previous not derivable without a
// second fetch, so this exposes what the compose layer has: the daily series
// itself plus a simple split at the midpoint for a period-over-period read.

export function periodOverPeriod(daily: { date: string; cost: number }[]): { current: number; previous: number; changePercent: number | null } {
  if (daily.length < 2) {
    const current = daily.reduce((s, d) => s + d.cost, 0);
    return { current, previous: 0, changePercent: null };
  }
  const mid = Math.floor(daily.length / 2);
  const previous = daily.slice(0, mid).reduce((s, d) => s + d.cost, 0);
  const current = daily.slice(mid).reduce((s, d) => s + d.cost, 0);
  return { current, previous, changePercent: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null };
}

// ── Biggest increases / decreases (spec §29) ────────────────────────────────

export interface CostChange {
  label: string;
  current: number;
  previous: number;
  delta: number;
}

/** Per-service delta between two `byService` snapshots, split into increases and decreases, each sorted by absolute dollar impact. A service present in only one period is a full increase/decrease from/to zero, not dropped. */
export function biggestChanges(
  current: Record<string, number>,
  previous: Record<string, number>,
  limit = 5,
): { increases: CostChange[]; decreases: CostChange[] } {
  const services = new Set([...Object.keys(current), ...Object.keys(previous)]);
  const changes: CostChange[] = [...services].map((label) => {
    const cur = current[label] ?? 0;
    const prev = previous[label] ?? 0;
    return { label, current: cur, previous: prev, delta: cur - prev };
  });
  const increases = changes.filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit);
  const decreases = changes.filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit);
  return { increases, decreases };
}
