/**
 * Cloud Accounts — frontend health display helpers (spec §8, §37).
 *
 * The authoritative score + signals come from the connector
 * `GET /health/detailed` endpoints (see each connector's `src/lib/health.ts`).
 * This module only:
 * - maps authoritative health states to UI tones/labels;
 * - combines provider summaries;
 * - recomputes scope-aware KPIs from flat health rows.
 *
 * It intentionally does not invent health state, recalculate an authoritative
 * connector score, or turn unavailable data into a healthy result.
 *
 * Pure module: no React, network, or mutable global state.
 */

import type {
  CloudAccountHealthRow,
  CloudAccountsHealthResponse,
  HealthSignalStatus,
  HealthState,
} from '../api';

export type Tone =
  | 'good'
  | 'warning'
  | 'serious'
  | 'critical'
  | 'neutral';

export type Provider =
  | 'aws'
  | 'azure'
  | 'gcp';

export const PROVIDERS: readonly Provider[] = [
  'aws',
  'azure',
  'gcp',
];

export const HEALTH_STATE_TONE: Record<
  HealthState,
  Tone
> = {
  healthy: 'good',
  warning: 'warning',
  critical: 'critical',
  unknown: 'neutral',
};

export const SIGNAL_STATUS_TONE: Record<
  HealthSignalStatus,
  Tone
> = {
  ok: 'good',
  warn: 'warning',
  fail: 'critical',
  unknown: 'neutral',
};

export const HEALTH_STATE_LABEL: Record<
  HealthState,
  string
> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
  unknown: 'Unknown',
};

export interface ProviderHealthSummary {
  provider: Provider;
  healthPercent: number | null;
  total: number;
}

export interface CombinedHealth {
  total: number;
  healthy: number;
  warning: number;
  critical: number;
  unknown: number;

  /**
   * Healthy / rated environments across all available providers.
   *
   * `null` means there are no rated environments, so the percentage cannot
   * honestly be calculated.
   */
  healthPercent: number | null;

  perProvider: ProviderHealthSummary[];
}

interface MutableProviderSummary {
  total: number;
  healthy: number;
  unknown: number;
}

function isProvider(
  value: unknown,
): value is Provider {
  return (
    value === 'aws' ||
    value === 'azure' ||
    value === 'gcp'
  );
}

function isHealthState(
  value: unknown,
): value is HealthState {
  return (
    value === 'healthy' ||
    value === 'warning' ||
    value === 'critical' ||
    value === 'unknown'
  );
}

function normalizeNonNegativeInteger(
  value: unknown,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return Math.floor(value);
}

function normalizePercent(
  value: unknown,
): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.round(
    Math.min(100, Math.max(0, value)),
  );
}

function calculateHealthPercent(
  healthy: number,
  total: number,
  unknown: number,
): number | null {
  const normalizedTotal =
    normalizeNonNegativeInteger(total);

  const normalizedUnknown =
    Math.min(
      normalizedTotal,
      normalizeNonNegativeInteger(
        unknown,
      ),
    );

  const normalizedHealthy =
    Math.min(
      Math.max(
        0,
        normalizeNonNegativeInteger(
          healthy,
        ),
      ),
      normalizedTotal -
        normalizedUnknown,
    );

  const ratedTotal =
    normalizedTotal -
    normalizedUnknown;

  if (ratedTotal <= 0) {
    return null;
  }

  return Math.round(
    (normalizedHealthy /
      ratedTotal) *
      100,
  );
}

function createCombinedHealth(): CombinedHealth {
  return {
    total: 0,
    healthy: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
    healthPercent: null,
    perProvider: [],
  };
}

function appendProviderSummary(
  accumulator: CombinedHealth,
  response: CloudAccountsHealthResponse,
): void {
  const total =
    normalizeNonNegativeInteger(
      response.summary?.total,
    );

  const healthy =
    Math.min(
      normalizeNonNegativeInteger(
        response.summary?.healthy,
      ),
      total,
    );

  const warning =
    Math.min(
      normalizeNonNegativeInteger(
        response.summary?.warning,
      ),
      total,
    );

  const critical =
    Math.min(
      normalizeNonNegativeInteger(
        response.summary?.critical,
      ),
      total,
    );

  const unknown =
    Math.min(
      normalizeNonNegativeInteger(
        response.summary?.unknown,
      ),
      total,
    );

  /*
   * The API should provide internally consistent buckets. The frontend
   * normalizes individual values defensively, but intentionally does not try
   * to invent missing bucket values to force a total to match.
   */
  accumulator.total += total;
  accumulator.healthy += healthy;
  accumulator.warning += warning;
  accumulator.critical += critical;
  accumulator.unknown += unknown;

  if (isProvider(response.provider)) {
    accumulator.perProvider.push({
      provider: response.provider,
      healthPercent:
        normalizePercent(
          response.summary?.healthPercent,
        ) ??
        calculateHealthPercent(
          healthy,
          total,
          unknown,
        ),
      total,
    });
  }
}

/**
 * Combines per-provider `GET /health/detailed` responses.
 *
 * Any unavailable provider can be represented by `null` and is omitted from
 * the aggregate. A missing provider is not converted into zero healthy or zero
 * unhealthy environments.
 */
export function combineHealth(
  responses: readonly (
    | CloudAccountsHealthResponse
    | null
    | undefined
  )[],
): CombinedHealth {
  const result =
    createCombinedHealth();

  for (const response of responses) {
    if (!response) {
      continue;
    }

    appendProviderSummary(
      result,
      response,
    );
  }

  result.perProvider.sort(
    (a, b) =>
      PROVIDERS.indexOf(
        a.provider,
      ) -
      PROVIDERS.indexOf(
        b.provider,
      ),
  );

  result.healthPercent =
    calculateHealthPercent(
      result.healthy,
      result.total,
      result.unknown,
    );

  return result;
}

/**
 * Recomputes CombinedHealth from a scope-filtered flat row list.
 *
 * This is intentionally separate from `combineHealth`: the Health tab may
 * already have applied an organization/folder/project scope, so using the
 * original provider summaries here would produce misleading KPI values.
 */
export function summarizeHealthRows(
  rows: readonly CloudAccountHealthRow[],
): CombinedHealth {
  const result =
    createCombinedHealth();

  const byProvider =
    new Map<
      Provider,
      MutableProviderSummary
    >();

  for (const row of rows) {
    if (
      !row ||
      !isProvider(row.provider)
    ) {
      continue;
    }

    const state: HealthState =
      isHealthState(row.state)
        ? row.state
        : 'unknown';

    result.total += 1;

    if (state === 'healthy') {
      result.healthy += 1;
    } else if (
      state === 'warning'
    ) {
      result.warning += 1;
    } else if (
      state === 'critical'
    ) {
      result.critical += 1;
    } else {
      result.unknown += 1;
    }

    const current =
      byProvider.get(
        row.provider,
      ) ?? {
        total: 0,
        healthy: 0,
        unknown: 0,
      };

    current.total += 1;

    if (state === 'healthy') {
      current.healthy += 1;
    }

    if (state === 'unknown') {
      current.unknown += 1;
    }

    byProvider.set(
      row.provider,
      current,
    );
  }

  result.healthPercent =
    calculateHealthPercent(
      result.healthy,
      result.total,
      result.unknown,
    );

  result.perProvider =
    PROVIDERS.filter(
      (provider) =>
        byProvider.has(provider),
    ).map((provider) => {
      const summary =
        byProvider.get(provider)!;

      return {
        provider,
        total: summary.total,
        healthPercent:
          calculateHealthPercent(
            summary.healthy,
            summary.total,
            summary.unknown,
          ),
      };
    });

  return result;
}

export function healthTierClass(
  percent: number | null,
): string {
  const normalized =
    normalizePercent(percent);

  if (normalized === null) {
    return 'text-slate-400 dark:text-slate-500';
  }

  if (normalized >= 85) {
    return 'text-emerald-600 dark:text-emerald-400';
  }

  if (normalized >= 60) {
    return 'text-amber-600 dark:text-amber-400';
  }

  return 'text-red-600 dark:text-red-400';
}
