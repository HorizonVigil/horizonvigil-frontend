import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BarChart } from '../../charts/BarChart';
import { EmptyState } from '../../EmptyState';
import { SectionCard, SectionError } from './primitives';

import {
  recordToBars,
  type ResourcesDashboardLike,
} from '../../../lib/cloudAccounts/overview';

interface EnvironmentDistribution {
  environment: string;
  count: number;
}

interface DistributionPanelProps {
  res: ResourcesDashboardLike | null;
  environments: EnvironmentDistribution[] | null;
  error?: boolean;
}

interface DistributionBar {
  label: string;
  value: number;
}

const MAX_ITEMS = 8;

function normalizeNonNegativeNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeEnvironmentBars(
  environments: EnvironmentDistribution[] | null | undefined,
): DistributionBar[] {
  if (!Array.isArray(environments)) {
    return [];
  }

  return environments
    .map((environment) => ({
      label: String(
        environment?.environment ?? '',
      ).trim(),
      value: normalizeNonNegativeNumber(
        environment?.count,
      ),
    }))
    .filter(
      (item) =>
        item.label.length > 0 &&
        item.value > 0,
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_ITEMS);
}

/**
 * Resource distribution by region and environment.
 *
 * Region selection currently navigates to the existing Cloud Accounts
 * Regions view. The selected region is not added to the route because the
 * current application contract does not define a region filter parameter.
 *
 * Environment bars are informational under the current contract.
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

    const bars = recordToBars(
      res.byRegion,
      MAX_ITEMS,
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
  }, [res?.byRegion]);

  const environmentBars = useMemo(
    () =>
      normalizeEnvironmentBars(
        environments,
      ),
    [environments],
  );

  const handleRegionClick = useCallback(
    (_region: string) => {
      navigate('/cloud-accounts?tab=Regions');
    },
    [navigate],
  );

  const hasAnyDistributionData =
    regionBars.length > 0 ||
    environmentBars.length > 0;

  return (
    <SectionCard
      title="Distribution"
      icon="map-pin"
    >
      {error && !res ? (
        <SectionError label="distribution" />
      ) : !res ? (
        <SectionError label="distribution" />
      ) : !hasAnyDistributionData ? (
        <EmptyState
          icon="map-pin"
          title="Distribution data unavailable"
          description="Resource location and environment data will appear after discovery has collected the required information."
        />
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
              <BarChart
                data={environmentBars}
              />
            )}
          </section>
        </div>
      )}
    </SectionCard>
  );
}