import { useMemo } from 'react';

import { LineChart } from '../../charts/LineChart';
import { EmptyState } from '../../EmptyState';
import { SectionCard, SectionError } from './primitives';

import {
  resourceGrowthSeries,
  type ResourcesDashboardLike,
} from '../../../lib/cloudAccounts/overview';

interface ResourceGrowthProps {
  res: ResourcesDashboardLike | null;
  days: number;
  error?: boolean;
}

const DEFAULT_DAYS = 30;
const MIN_DAYS = 1;
const MAX_DAYS = 3650;

function normalizeDays(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_DAYS;
  }

  return Math.min(
    MAX_DAYS,
    Math.max(MIN_DAYS, Math.round(value)),
  );
}

function normalizeGrowthPoints(
  points: unknown,
) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.filter((point) => {
    if (!point || typeof point !== 'object') {
      return false;
    }

    const candidate = point as {
      label?: unknown;
      value?: unknown;
    };

    return (
      typeof candidate.label === 'string' &&
      candidate.label.trim().length > 0 &&
      typeof candidate.value === 'number' &&
      Number.isFinite(candidate.value)
    );
  });
}

/**
 * Cumulative resource growth over the selected dashboard window.
 *
 * This component intentionally does not manufacture historical values.
 * Growth is displayed only when the domain layer provides usable history.
 */
export function ResourceGrowth({
  res,
  days,
  error = false,
}: ResourceGrowthProps) {
  const normalizedDays = normalizeDays(days);

  const growthPoints = useMemo(() => {
    if (
      !res ||
      !Array.isArray(res.trend30d) ||
      res.trend30d.length === 0
    ) {
      return [];
    }

    try {
      return normalizeGrowthPoints(
        resourceGrowthSeries(res),
      );
    } catch {
      /*
       * A malformed domain response should not break the entire dashboard.
       * Centralized telemetry should capture the underlying exception at the
       * application boundary.
       */
      return [];
    }
  }, [res]);

  return (
    <SectionCard
      title="Resource Growth"
      icon="chart-area"
    >
      {error ? (
        <SectionError label="resource growth" />
      ) : !res ? (
        <EmptyState
          icon="chart-line"
          title="Not available"
          description="Resource growth data could not be loaded for this scope."
        />
      ) : growthPoints.length === 0 ? (
        <EmptyState
          icon="chart-line"
          title="Not enough history yet"
          description="Growth appears once discovery has run over several days."
        />
      ) : (
        <div className="min-w-0">
          <LineChart
            series={[
              {
                label: 'Resources',
                points: growthPoints,
              },
            ]}
            height={200}
          />

          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Net change over the last {normalizedDays} days
          </p>
        </div>
      )}
    </SectionCard>
  );
}