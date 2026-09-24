import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BarChart } from '../../charts/BarChart';
import { EmptyState } from '../../EmptyState';
import { SectionCard, SectionError } from './primitives';

import {
  recordToBars,
  type ResourcesDashboardLike,
} from '../../../lib/cloudAccounts/overview';

interface ResourceDistributionProps {
  res: ResourcesDashboardLike | null;
  error?: boolean;
}

const MAX_CATEGORIES = 8;

function normalizeNonNegativeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

/**
 * Resource distribution by resource category.
 *
 * Clicking a category opens the Resources module filtered by category.
 *
 * Data states:
 * - error      → explicit error state
 * - null       → no loaded data
 * - total = 0  → genuinely no resources
 * - resources + no category data → explicit incomplete-data state
 */
export function ResourceDistribution({
  res,
  error = false,
}: ResourceDistributionProps) {
  const navigate = useNavigate();

  const totalResources = useMemo(
    () => normalizeNonNegativeNumber(res?.total),
    [res?.total],
  );

  const categoryBars = useMemo(() => {
    if (!res || totalResources <= 0) {
      return [];
    }

    const bars = recordToBars(
      res.byCategory,
      MAX_CATEGORIES,
    );

    return Array.isArray(bars)
      ? bars.filter(
          (bar) =>
            typeof bar?.label === 'string' &&
            bar.label.trim().length > 0 &&
            typeof bar?.value === 'number' &&
            Number.isFinite(bar.value) &&
            bar.value > 0,
        )
      : [];
  }, [res, totalResources]);

  const handleCategoryClick = useCallback(
    (category: string) => {
      const normalizedCategory = String(category ?? '').trim();

      if (!normalizedCategory) {
        return;
      }

      navigate(
        `/resources?category=${encodeURIComponent(
          normalizedCategory,
        )}`,
      );
    },
    [navigate],
  );

  return (
    <SectionCard
      title="Resource Distribution"
      icon="resources"
      to="/resources"
      linkLabel="Resources"
    >
      {error ? (
        <SectionError label="resource distribution" />
      ) : !res ? (
        <EmptyState
          icon="resources"
          title="Not available"
          description="Resource distribution data could not be loaded for this scope."
        />
      ) : totalResources === 0 ? (
        <EmptyState
          icon="resources"
          title="No resources discovered yet"
          description="Run discovery on a connected environment to populate this."
        />
      ) : categoryBars.length === 0 ? (
        <div className="flex flex-col gap-2">
          <EmptyState
            icon="resources"
            title="Category data unavailable"
            description="Resources were discovered, but category information is not available yet."
          />

          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
            {totalResources.toLocaleString()} resources discovered
          </p>
        </div>
      ) : (
        <div className="min-w-0">
          <BarChart
            data={categoryBars}
            onBarClick={handleCategoryClick}
          />

          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            {totalResources.toLocaleString()} resources across all connected
            environments
          </p>
        </div>
      )}
    </SectionCard>
  );
}