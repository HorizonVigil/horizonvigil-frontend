/**
 * Cloud Accounts — frontend health display helpers (spec §8, §37).
 *
 * The authoritative score + signals come from the connector
 * `GET /health/detailed` endpoints (see each connector's `src/lib/health.ts`).
 * This module only maps that output onto UI tokens and rolls the three
 * providers' summaries into one. Pure + unit-tested.
 */
import type { CloudAccountsHealthResponse, HealthState, HealthSignalStatus } from '../api';

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

export function healthTierClass(percent: number | null): string {
  if (percent === null) return 'text-slate-400 dark:text-slate-500';
  if (percent >= 95) return 'text-emerald-600 dark:text-emerald-400';
  if (percent >= 85) return 'text-emerald-600 dark:text-emerald-400';
  if (percent >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}
