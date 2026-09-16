import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BarChart } from '../../charts/BarChart';
import { LineChart } from '../../charts/LineChart';
import { EmptyState } from '../../EmptyState';
import { SectionCard, SectionError } from './primitives';

import {
  recordToBars,
  resourceGrowthSeries,
  type ResourcesDashboardLike,
} from '../../../lib/cloudAccounts/overview';

interface ResourceDistributionProps {
  res: ResourcesDashboardLike | null;
  error?: boolean;
}

interface ResourceGrowthProps {
  res: ResourcesDashboardLike | null;
  days: number;
  error?: boolean;
}

interface DistributionPanelProps {
  res: ResourcesDashboardLike | null;
  environments: EnvironmentDistribution[] | null;
  error?: boolean;
}

interface EnvironmentDistribution {
  environment: string;
  count: number;
}

interface BarData {
  label: string;
  value: number;
}

const DEFAULT_DAYS = 30;
const MAX_DAYS = 3650;
const MAX_DISTRIBUTION_ITEMS = 8;

function normalizeNonNegativeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeDays(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_DAYS;
  }

  return Math.min(MAX_DAYS, Math.max(1, Math.round(value)));
}

function normalizeEnvironmentBars(
  environments: EnvironmentDistribution[] | null | undefined,
): BarData[] {
  if (!Array.isArray(environments)) {
    return [];
  }

  return environments
    .map((environment) => {
      const label = String(environment?.environment ?? '').trim();
      const value = normalizeNonNegativeNumber(environment?.count);

      return {
        label,
        value,
      };
    })
    .filter((item) => item.label.length > 0 && item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_DISTRIBUTION_ITEMS);
}

function safeEncodeQueryValue(value: string): string {
  return encodeURIComponent(value.trim());
}

/**
 * Resource distribution by resource category.
 *
 * Clicking a category navigates to the Resources module with the selected
 * category encoded in the query string.
 */
export function ResourceDistribution({
  res,
  error = false,
}: ResourceDistributionProps) {
  const navigate = useNavigate();

  const categoryBars = useMemo(() => {
    if (!res || res.total <= 0) {
      return [];
    }

    return recordToBars(
      res.byCategory,
      MAX_DISTRIBUTION_ITEMS,
    );
  }, [res]);

  const handleCategoryClick = useCallback(
    (category: string) => {
      const normalizedCategory = String(category ?? '').trim();

      if (!normalizedCategory) {
        return;
      }

      navigate(
        `/resources?category=${safeEncodeQueryValue(normalizedCategory)}`,
      );
    },
    [navigate],
  );

  const totalResources = useMemo(
    () => normalizeNonNegativeNumber(res?.total),
    [res?.total],
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
      ) : !res || totalResources === 0 ? (
        <EmptyState
          icon="resources"
          title="No resources discovered yet"
          description="Run discovery on a connected environment to populate this."
        />
      ) : (
        <div>
          {categoryBars.length > 0 ? (
            <BarChart
              data={categoryBars}
              onBarClick={handleCategoryClick}
            />
          ) : (
            <EmptyState
              icon="resources"
              title="No category data available"
              description="Resources were discovered, but category information is not available yet."
            />
          )}

          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            {totalResources.toLocaleString()} resources across all connected
            environments
          </p>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Cumulative resource growth over the selected dashboard window.
 */
export function ResourceGrowth({
  res,
  days,
  error = false,
}: ResourceGrowthProps) {
  const normalizedDays = normalizeDays(days);

  const growthPoints = useMemo(() => {
    if (!res || !Array.isArray(res.trend30d) || res.trend30d.length === 0) {
      return [];
    }

    return resourceGrowthSeries(res);
  }, [res]);

  return (
    <SectionCard title="Resource Growth" icon="chart-area">
      {error ? (
        <SectionError label="resource growth" />
      ) : growthPoints.length === 0 ? (
        <EmptyState
          icon="chart-line"
          title="Not enough history yet"
          description="Growth appears once discovery has run over several days."
        />
      ) : (
        <>
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
        </>
      )}
    </SectionCard>
  );
}

/**
 * Resource distribution by region and environment.
 *
 * Region clicks intentionally navigate to the Cloud Accounts Regions view.
 * Environment bars are informational because the current component contract
 * does not define a stable environment filter route.
 */
export function DistributionPanel({
  res,
  environments,
  error = false,
}: DistributionPanelProps) {
  const navigate = useNavigate();

  const regionBars = useMemo(() => {
    if (!res?.byRegion) {
      return [];
    }

    return recordToBars(
      res.byRegion,
      MAX_DISTRIBUTION_ITEMS,
    );
  }, [res?.byRegion]);

  const environmentBars = useMemo(
    () => normalizeEnvironmentBars(environments),
    [environments],
  );

  const handleRegionClick = useCallback(
    (_region: string) => {
      navigate('/cloud-accounts?tab=Regions');
    },
    [navigate],
  );

  return (
    <SectionCard title="Distribution" icon="map-pin">
      {error && !res ? (
        <SectionError label="distribution" />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <section
            aria-labelledby="distribution-by-region"
            className="min-w-0"
          >
            <h3
              id="distribution-by-region"
              className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              By region
            </h3>

            {regionBars.length === 0 ? (
              <p
                role="status"
                className="text-xs text-slate-400 dark:text-slate-500"
              >
                No regional data yet.
              </p>
            ) : (
              <BarChart
                data={regionBars}
                onBarClick={handleRegionClick}
              />
            )}
          </section>

          <section
            aria-labelledby="distribution-by-environment"
            className="min-w-0"
          >
            <h3
              id="distribution-by-environment"
              className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              By environment
            </h3>

            {environmentBars.length === 0 ? (
              <p
                role="status"
                className="text-xs text-slate-400 dark:text-slate-500"
              >
                No environment data yet.
              </p>
            ) : (
              <BarChart data={environmentBars} />
            )}
          </section>
        </div>
      )}
    </SectionCard>
  );
}