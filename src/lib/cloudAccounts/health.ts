/**
 * Cloud Accounts — frontend health display helpers (spec §8, §37).
 *
 * The authoritative score + signals come from the connector
 * `GET /health/detailed` endpoints (see each connector's `src/lib/health.ts`).
 * This module only maps that output onto UI tokens and rolls the three
 * providers' summaries into one. Pure + unit-tested.
 */
import type { CloudAccountHealthRow, CloudAccountsHealthResponse, HealthState, HealthSignalStatus } from '../api';

type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export const HEALTH_STATE_TONE: Record<HealthState, Tone> = {
  healthy: 'good',
  warning: 'warning',
  critical: 'critical',
  unknown: 'neutral',
};

export const SIGNAL_STATUS_TONE: Record<HealthSignalStatus, Tone> = {
  ok: 'good',
  warn: 'warning',
  fail: 'critical',
  unknown: 'neutral',
};

export const HEALTH_STATE_LABEL: Record<HealthState, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

export interface CombinedHealth {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;
  /** healthy / (rated) across all providers, or null when nothing is rated */
  healthPercent: number | null;
  perProvider: { provider: 'aws' | 'azure' | 'gcp'; healthPercent: number | null; total: number }[];
}

/** Combine the per-provider `GET /health/detailed` responses (any of which may have failed → pass null). */
export function combineHealth(responses: (CloudAccountsHealthResponse | null)[]): CombinedHealth {
  const acc: CombinedHealth = { total: 0, healthy: 0, warning: 0, critical: 0, unknown: 0, healthPercent: null, perProvider: [] };
  let ratedTotal = 0;
  let healthyTotal = 0;

  for (const r of responses) {
    if (!r) continue;
    acc.total += r.summary.total;
    acc.healthy += r.summary.healthy;
    acc.warning += r.summary.warning;
    acc.critical += r.summary.critical;
    acc.unknown += r.summary.unknown;
    const rated = r.summary.total - r.summary.unknown;
    ratedTotal += rated;
    healthyTotal += r.summary.healthy;
    acc.perProvider.push({ provider: r.provider, healthPercent: r.summary.healthPercent, total: r.summary.total });
  }

  acc.healthPercent = ratedTotal === 0 ? null : Math.round((healthyTotal / ratedTotal) * 100);
  return acc;
}

/**
 * Recomputes {@link CombinedHealth} from a (possibly scope-filtered) flat
 * row list, instead of the unfiltered per-provider summaries `combineHealth`
 * reads. Used by the Health tab so a folder/project scope selection changes
 * the KPI numbers too, not just which table rows show.
 */
export function summarizeHealthRows(rows: CloudAccountHealthRow[]): CombinedHealth {
  const acc: CombinedHealth = { total: 0, healthy: 0, warning: 0, critical: 0, unknown: 0, healthPercent: null, perProvider: [] };
  const byProvider = new Map<'aws' | 'azure' | 'gcp', { total: number; healthy: number; unknown: number }>();

  for (const r of rows) {
    acc.total += 1;
    if (r.state === 'healthy') acc.healthy += 1;
    else if (r.state === 'warning') acc.warning += 1;
    else if (r.state === 'critical') acc.critical += 1;
    else acc.unknown += 1;

    const p = byProvider.get(r.provider) ?? { total: 0, healthy: 0, unknown: 0 };
    p.total += 1;
    if (r.state === 'healthy') p.healthy += 1;
    if (r.state === 'unknown') p.unknown += 1;
    byProvider.set(r.provider, p);
  }

  const ratedTotal = acc.total - acc.unknown;
  acc.healthPercent = ratedTotal === 0 ? null : Math.round((acc.healthy / ratedTotal) * 100);
  acc.perProvider = (['aws', 'azure', 'gcp'] as const)
    .filter((p) => byProvider.has(p))
    .map((p) => {
      const s = byProvider.get(p)!;
      const rated = s.total - s.unknown;
      return { provider: p, total: s.total, healthPercent: rated === 0 ? null : Math.round((s.healthy / rated) * 100) };
    });
  return acc;
}

export function healthTierClass(percent: number | null): string {
  if (percent === null) return 'text-slate-400 dark:text-slate-500';
  if (percent >= 95) return 'text-emerald-600 dark:text-emerald-400';
  if (percent >= 85) return 'text-emerald-600 dark:text-emerald-400';
  if (percent >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}
