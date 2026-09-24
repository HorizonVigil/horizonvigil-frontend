/**
 * Cloud Accounts → Overview — dynamic cloud command center.
 *
 * The overview is intentionally composed from existing backend endpoints.
 * Each section is allowed to degrade independently when one provider/module
 * is unavailable, while the page itself remains usable.
 *
 * Deferred by product scope:
 * - drag/resize/save-layout customization
 * - context-aware widget promotion
 * - organization/folder/account aggregation filters that require the
 *   §39–40 aggregation API
 */
import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '../icons';
import { StatCard } from '../StatCard';
import {
  StatCardSkeleton,
  CardSkeleton,
} from '../Skeleton';
import { useOrg } from '../../lib/orgContext';
import { deriveCapabilities } from '../../lib/overview/capabilities';
import {
  api,
  type Role,
} from '../../lib/api';
import { money } from '../../lib/format';
import {
  aggregateOverview,
  buildAttentionItems,
  mergeActivity,
  narrowToProvider,
  normalizeDashboard,
  normalizeHealth,
  normalizeResources,
  topProblemAccounts,
  PROVIDERS,
  type ProviderDashes,
  type ProviderHealth,
} from '../../lib/cloudAccounts/overview';
import {
  OverviewFilters,
  DEFAULT_OVERVIEW_FILTERS,
  TIME_DAYS,
  type OverviewFilterState,
} from './overview/OverviewFilters';
import { ProviderCards } from './overview/ProviderCards';
import {
  CloudHealthDonut,
  ProviderHealthComparison,
} from './overview/HealthPanels';
import { AttentionRequired } from './overview/AttentionRequired';
import {
  ResourceDistribution,
  ResourceGrowth,
  DistributionPanel,
} from './overview/ResourcePanels';
import { CostPanel } from './overview/CostPanel';
import { SecurityPanel } from './overview/SecurityPanel';
import { isVulnerabilityDataEnabled } from '../../lib/featureFlags';
import {
  ConnectivityHealth,
  KubernetesSummary,
} from './overview/InfraPanels';
import { SyncPanel } from './overview/SyncPanel';
import { ActivityTimeline } from './overview/ActivityTimeline';
import { TopProblemAccounts } from './overview/TopProblemAccounts';
import {
  LockedSection,
  SectionBoundary,
} from './overview/primitives';

interface OverviewPanelProps {
  refreshToken: number;
}

type Provider =
  (typeof PROVIDERS)[number];

const INITIAL_SKELETON_STATS = 8;
const INITIAL_SKELETON_SECTIONS = 4;

function fulfilledValue<T>(
  result: PromiseSettledResult<T>,
): T | null {
  return result.status === 'fulfilled'
    ? result.value
    : null;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null
  );
}

/**
 * Validates the shape the consumer actually needs.
 *
 * This returned `unknown[]` after filtering to records, which no amount of
 * downstream typing could turn into EnvironmentDistribution[]. Filtering by a
 * predicate that CHECKS the fields is both honest and assignable: a malformed
 * entry is dropped rather than cast over.
 */
function normalizeEnvironments(
  value: unknown,
): { environment: string; count: number }[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.filter(
    (entry): entry is { environment: string; count: number } =>
      isRecord(entry) &&
      typeof entry.environment === 'string' &&
      typeof entry.count === 'number' &&
      Number.isFinite(entry.count),
  );
}

function getSafeDateLabel(
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value))
  ) {
    return 'Never';
  }

  try {
    return new Intl.DateTimeFormat(
      undefined,
      { dateStyle: 'medium' },
    ).format(new Date(value));
  } catch {
    return 'Never';
  }
}

function getProviderRegionCount(
  resources: ReturnType<
    typeof normalizeResources
  >,
): number {
  if (!resources?.byRegion) {
    return 0;
  }

  return Object.keys(resources.byRegion).length;
}

export function OverviewPanel({
  refreshToken,
}: OverviewPanelProps) {
  const navigate = useNavigate();
  const {
    currentOrg,
    menuPermissions,
  } = useOrg();

  const role =
    (currentOrg?.myRole as Role) ??
    'viewer';

  const can = useMemo(
    () =>
      deriveCapabilities(
        role,
        menuPermissions,
      ),
    [role, menuPermissions],
  );

  const canCost = can.has('cost.read');
  const canSecurity =
    can.has('security.read');
  const canK8s =
    can.has('kubernetes.read');

  /*
   * Evaluate the feature flag once per render and use that same value for
   * both fetching and rendering. This avoids a fetch/render mismatch if the
   * flag implementation is ever made dynamic.
   */
  const vulnerabilityDataEnabled =
    isVulnerabilityDataEnabled();

  const [
    filters,
    setFilters,
  ] = useState<OverviewFilterState>(
    DEFAULT_OVERVIEW_FILTERS,
  );

  const days =
    TIME_DAYS[filters.time];

  const region =
    filters.region === 'all'
      ? undefined
      : filters.region;

  const query =
    useQuery({
      queryKey: [
        'cloud-accounts',
        'overview-cc',
        refreshToken,
        region ?? 'all',
        days,
        canCost,
        canSecurity,
        canK8s,
        vulnerabilityDataEnabled,
      ],

      queryFn: async () => {
        /*
         * Promise.allSettled is intentional here. A single provider/API
         * failure must not make the entire overview blank.
         */
        const [
          aws,
          azure,
          gcp,
          hAws,
          hAzure,
          hGcp,
          resources,
          containers,
          security,
          cost,
          environments,
        ] = await Promise.allSettled([
          api.getAwsAccountsDashboard(),
          api.getAzureAccountsDashboard(),
          api.getGcpAccountsDashboard(),
          api.getAwsHealthDetailed(),
          api.getAzureHealthDetailed(),
          api.getGcpHealthDetailed(),
          api.getResourcesDashboard({
            region,
            days,
          }),
          canK8s
            ? api.getContainersDashboard()
            : Promise.resolve(null),
          vulnerabilityDataEnabled &&
          canSecurity
            ? api.getVulnerabilityDashboard()
            : Promise.resolve(null),
          canCost
            ? api.getOverviewCost()
            : Promise.resolve(null),
          api.getEnvironments(),
        ]);

        const dashes:
          ProviderDashes = {
          aws: normalizeDashboard(
            fulfilledValue(aws),
          ),
          azure: normalizeDashboard(
            fulfilledValue(azure),
          ),
          gcp: normalizeDashboard(
            fulfilledValue(gcp),
          ),
        };

        const health:
          ProviderHealth = {
          aws: normalizeHealth(
            fulfilledValue(hAws),
          ),
          azure: normalizeHealth(
            fulfilledValue(hAzure),
          ),
          gcp: normalizeHealth(
            fulfilledValue(hGcp),
          ),
        };

        /*
         * Do not convert failed endpoint responses into successful empty
         * datasets. Keep explicit failure information for sections that need
         * it so they can degrade honestly.
         */
        const environmentResponse =
          fulfilledValue(environments);

        return {
          dashes,
          health,
          resources:
            normalizeResources(
              fulfilledValue(resources),
            ),
          resourcesError:
            resources.status === 'rejected',
          resourcesErrorValue:
            resources.status === 'rejected'
              ? resources.reason
              : null,

          containers:
            fulfilledValue(containers),
          containersError:
            containers.status === 'rejected',

          security:
            fulfilledValue(security),
          securityError:
            security.status === 'rejected',

          cost: fulfilledValue(cost),
          costError:
            cost.status === 'rejected',

          environments:
            normalizeEnvironments(
              environmentResponse?.environments,
            ),
          environmentsError:
            environments.status === 'rejected',

          dashboardErrors: {
            aws:
              aws.status === 'rejected',
            azure:
              azure.status === 'rejected',
            gcp:
              gcp.status === 'rejected',
          },

          healthErrors: {
            aws:
              hAws.status === 'rejected',
            azure:
              hAzure.status === 'rejected',
            gcp:
              hGcp.status === 'rejected',
          },

          /*
           * Timestamp the successful aggregation boundary, not the beginning
           * of individual network calls.
           */
          fetchedAt: Date.now(),
        };
      },

      staleTime: 60_000,

      /*
       * No automatic retries are needed here because the page intentionally
       * tolerates individual endpoint failures through Promise.allSettled.
       * Retrying the whole aggregate can produce needless traffic and does
       * not improve a deterministic authorization failure.
       */
      retry: false,

      gcTime: 5 * 60_000,
    });

  const isInitialLoading =
    query.isLoading &&
    !query.data;
  /*
   * DECLARED BEFORE THE EARLY RETURNS BELOW, AND IT MUST STAY THERE.
   *
   * These four callbacks used to sit after the loading, error and empty-
   * estate guards, so they ran on a loaded render and were skipped on every
   * other one. React compares hook counts between renders of the same
   * mounted component, so the first transition out of the loading state
   * threw "Rendered more hooks than during the previous render". The same
   * defect in SecurityPanel is reproduced in securityPanelHooks.test.tsx.
   *
   * They depend only on navigate, query and setFilters, all of which are
   * already available at this point.
   */
  /*
   * The chart components can emit either a provider identifier or a health
   * state. Keep the branching explicit so arbitrary strings cannot accidentally
   * be treated as valid providers.
   */
  const drillHealth =
    useCallback(
      (state: string) => {
        const provider =
          PROVIDERS.find(
            (candidate) =>
              candidate === state,
          );

        if (provider) {
          setFilters(
            (current) => ({
              ...current,
              provider:
                provider as Provider,
            }),
          );
          return;
        }

        navigate(
          '/cloud-accounts?tab=Health',
        );
      },
      [navigate],
    );

  const handleRefresh =
    useCallback(() => {
      void query.refetch();
    }, [query]);

  const handleProviderSelect =
    useCallback(
      // Nullable: the chip clears the filter by passing null, and a handler
      // that only accepts Provider cannot express deselection.
      (provider: Provider | null) => {
        setFilters(
          (current) => ({
            ...current,
            provider,
          }),
        );
      },
      [],
    );

  const handleSyncDrill =
    useCallback(() => {
      navigate(
        '/cloud-accounts?tab=Sync+Center',
      );
    }, [navigate]);


  if (isInitialLoading) {
    return (
      <div
        className="flex flex-col gap-5"
        aria-busy="true"
        aria-label="Loading cloud overview"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({
            length:
              INITIAL_SKELETON_STATS,
          }).map((_, index) => (
            <StatCardSkeleton
              key={`overview-stat-${index}`}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({
            length:
              INITIAL_SKELETON_SECTIONS,
          }).map((_, index) => (
            <CardSkeleton
              key={`overview-section-${index}`}
            />
          ))}
        </div>
      </div>
    );
  }

  /*
   * queryFn currently uses allSettled, so query.isError is reserved for an
   * unexpected aggregate failure (for example, local normalization throwing).
   * This should still produce a recoverable page-level error.
   */
  if (
    query.isError ||
    !query.data
  ) {
    return (
      <div
        role="alert"
        className={[
          'rounded-xl border p-6 text-center',
          'border-red-200 bg-red-50',
          'dark:border-red-900',
          'dark:bg-red-950/30',
        ].join(' ')}
      >
        <Icon
          name="alert-triangle"
          size={20}
          className="mx-auto mb-2 text-red-500"
          aria-hidden="true"
        />

        <p className="text-sm text-red-700 dark:text-red-300">
          Couldn’t load the cloud overview.
        </p>

        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className={[
            'mt-3 rounded-md px-2 py-1',
            'text-xs font-medium underline',
            'text-red-700 dark:text-red-300',
            'disabled:cursor-not-allowed',
            'disabled:opacity-50',
            'focus:outline-none',
            'focus-visible:ring-2',
            'focus-visible:ring-red-500',
          ].join(' ')}
        >
          {query.isFetching
            ? 'Retrying…'
            : 'Retry'}
        </button>
      </div>
    );
  }

  const data = query.data;

  /*
   * The full aggregate is deliberately computed before the provider filter.
   * It powers provider cards and the empty-state decision for the overall
   * organization view.
   */
  const fullAgg =
    aggregateOverview(
      data.dashes,
      data.health,
    );

  /*
   * Empty state is based on the authoritative aggregate rather than an
   * individual dashboard response.
   */
  if (
    fullAgg.totals.total === 0
  ) {
    return (
      <div
        className={[
          'flex flex-col items-center',
          'gap-3 py-20 text-center',
        ].join(' ')}
      >
        <div
          className={[
            'flex h-14 w-14 items-center',
            'justify-center rounded-full',
            'bg-brand-50',
            'dark:bg-brand-900/30',
          ].join(' ')}
        >
          <Icon
            name="cloud"
            size={24}
            className="text-brand-600 dark:text-brand-400"
            aria-hidden="true"
          />
        </div>

        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          No cloud environments
        </h2>

        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          Connect AWS, Azure or GCP to
          start discovering your cloud
          environment.
        </p>
      </div>
    );
  }

  /*
   * Provider filter is applied once at the domain aggregation boundary.
   * Every provider-derived section below uses the same narrowed dataset so
   * KPI, chart, attention, activity, and problem-account views cannot drift.
   */
  const narrowed =
    narrowToProvider(
      data.dashes,
      data.health,
      filters.provider,
    );

  const agg =
    aggregateOverview(
      narrowed.dashes,
      narrowed.health,
    );

  const attention =
    buildAttentionItems(
      agg,
      narrowed.dashes,
      {
        security:
          data.security,
      },
    );

  const activity =
    mergeActivity(
      narrowed.dashes,
    );

  const problems =
    topProblemAccounts(
      narrowed.dashes,
    );

  const potentialSavings =
    PROVIDERS.reduce(
      (total, provider) =>
        total +
        narrowed.dashes[provider]
          .potentialMonthlySavings,
      0,
    );

  const healthPct =
    agg.totals.healthPercent;

  const resourceRegionCount =
    getProviderRegionCount(
      data.resources,
    );


  return (
    <div
      className="flex flex-col gap-5"
      aria-busy={
        query.isFetching
      }
    >
      <OverviewFilters
        value={filters}
        onChange={setFilters}
        updatedAt={data.fetchedAt}
        onRefresh={handleRefresh}
        refreshing={query.isFetching}
      />

      {/*
       * When one or more background calls fail, do not silently present the
       * affected KPI as authoritative. The page still renders because
       * individual sections degrade independently.
       */}
      {(
        Object.values(
          data.dashboardErrors,
        ).some(Boolean) ||
        Object.values(
          data.healthErrors,
        ).some(Boolean) ||
        data.resourcesError ||
        data.costError ||
        data.environmentsError ||
        data.containersError ||
        data.securityError
      ) ? (
        <div
          role="status"
          aria-live="polite"
          className={[
            'rounded-md border px-3 py-2',
            'border-amber-200 bg-amber-50',
            'text-xs text-amber-800',
            'dark:border-amber-900/50',
            'dark:bg-amber-950/30',
            'dark:text-amber-300',
          ].join(' ')}
        >
          Some cloud overview data could not
          be refreshed. Available sections are
          shown from successfully retrieved
          data.
        </div>
      ) : null}

      {/* Executive KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Environments"
          value={agg.totals.total.toLocaleString()}
          icon="cloud"
        />

        <StatCard
          label="Healthy"
          value={agg.totals.healthy.toLocaleString()}
          icon="check-circle"
          iconTone="good"
        />

        <StatCard
          label="Failed"
          value={agg.totals.critical.toLocaleString()}
          icon="shield-alert"
          iconTone={
            agg.totals.critical > 0
              ? 'critical'
              : 'neutral'
          }
        />

        <StatCard
          label="Needs Attention"
          value={agg.totals.attention.toLocaleString()}
          icon="alert-triangle"
          iconTone={
            agg.totals.attention > 0
              ? 'warning'
              : 'neutral'
          }
        />

        <StatCard
          label="Resources"
          value={agg.totals.resources.toLocaleString()}
          icon="resources"
        />

        <StatCard
          label="Overall Health"
          value={
            healthPct === null
              ? '—'
              : `${healthPct}%`
          }
          icon="gauge"
          iconTone={
            healthPct === null
              ? 'neutral'
              : healthPct >= 85
                ? 'good'
                : healthPct >= 60
                  ? 'warning'
                  : 'critical'
          }
        />

        {canCost ? (
          <StatCard
            label="Cloud Cost (MTD)"
            value={money(
              data.cost?.monthToDate ??
                agg.totals.monthlyCost,
            )}
            icon="cost"
          />
        ) : (
          <StatCard
            label="Regions"
            value={resourceRegionCount.toLocaleString()}
            icon="map-pin"
          />
        )}

        <StatCard
          label="Last Discovery"
          value={getSafeDateLabel(
            fullAgg.lastDiscovery,
          )}
          icon="clock"
        />
      </div>

      {/* Provider cards */}
      <SectionBoundary name="provider cards">
        <ProviderCards
          agg={fullAgg}
          activeFilter={
            filters.provider
          }
          onSelect={handleProviderSelect}
        />
      </SectionBoundary>

      {/* Attention required */}
      <SectionBoundary name="attention required">
        <AttentionRequired
          items={attention}
        />
      </SectionBoundary>

      {/* Health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionBoundary name="cloud health">
          <CloudHealthDonut
            agg={agg}
            onDrill={drillHealth}
          />
        </SectionBoundary>

        <SectionBoundary name="provider comparison">
          <ProviderHealthComparison
            agg={agg}
            onDrill={drillHealth}
          />
        </SectionBoundary>
      </div>

      {/* Resources */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionBoundary name="resource distribution">
          <ResourceDistribution
            res={data.resources}
            error={
              data.resourcesError
            }
          />
        </SectionBoundary>

        <SectionBoundary name="resource growth">
          <ResourceGrowth
            res={data.resources}
            days={days}
            error={
              data.resourcesError
            }
          />
        </SectionBoundary>
      </div>

      {/* Cost + Security */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionBoundary name="cost">
          {canCost ? (
            <CostPanel
              agg={agg}
              monthToDate={
                data.cost?.monthToDate ??
                null
              }
              potentialSavings={
                potentialSavings
              }
            />
          ) : (
            <LockedSection
              title="Cloud Cost"
              reason="You don’t have cost access for this organization."
            />
          )}
        </SectionBoundary>

        {vulnerabilityDataEnabled ? (
          <SectionBoundary name="security">
            {canSecurity ? (
              <SecurityPanel
                security={
                  data.security
                }
              />
            ) : (
              <LockedSection
                title="Security & Risk"
                reason="You don’t have security access for this organization."
              />
            )}
          </SectionBoundary>
        ) : null}
      </div>

      {/* Infra + Kubernetes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionBoundary name="connectivity health">
          <ConnectivityHealth
            health={narrowed.health}
          />
        </SectionBoundary>

        {canK8s ? (
          <SectionBoundary name="kubernetes">
            <KubernetesSummary
              containers={
                data.containers
              }
            />
          </SectionBoundary>
        ) : null}
      </div>

      {/* Sync health */}
      <SectionBoundary name="synchronization">
        <SyncPanel
          agg={agg}
          dashes={narrowed.dashes}
          onDrill={handleSyncDrill}
        />
      </SectionBoundary>

      {/* Distribution */}
      <SectionBoundary name="distribution">
        <DistributionPanel
          res={data.resources}
          environments={
            data.environments
          }
          error={
            data.resourcesError
          }
        />
      </SectionBoundary>

      {/* Activity + problem accounts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionBoundary name="activity">
          <ActivityTimeline
            entries={activity}
          />
        </SectionBoundary>

        <SectionBoundary name="problem accounts">
          <TopProblemAccounts
            rows={problems}
          />
        </SectionBoundary>
      </div>
    </div>
  );
}
