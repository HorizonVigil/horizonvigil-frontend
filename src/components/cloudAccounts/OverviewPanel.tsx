/**
 * Cloud Accounts → Overview — a dynamic cloud command center (spec §1–§26,
 * §44). Composed on the frontend from endpoints that already exist (each
 * connector's `/dashboard` + `/health/detailed`, plus the resources / cost /
 * security / containers dashboards). Every section renders permission- and
 * scope-gated, degrades independently on error (spec §33), and drills through
 * to the relevant tab or module (spec §31).
 *
 * Deferred (agreed): drag/resize/save-layout customization (§27) and
 * context-aware widget promotion (§30). Organization / folder / account
 * filters (§6) need the §39–40 aggregation API and are out of scope here.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../icons';
import { StatCard } from '../StatCard';
import { StatCardSkeleton, CardSkeleton } from '../Skeleton';
import { useOrg } from '../../lib/orgContext';
import { deriveCapabilities } from '../../lib/overview/capabilities';
import { api, type Role } from '../../lib/api';
import { money } from '../../lib/format';
import {
  aggregateOverview,
  buildAttentionItems,
  mergeActivity,
  narrowToProvider,
  topProblemAccounts,
  EMPTY_DASHBOARD,
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
import { CloudHealthDonut, ProviderHealthComparison } from './overview/HealthPanels';
import { AttentionRequired } from './overview/AttentionRequired';
import { ResourceDistribution, ResourceGrowth, DistributionPanel } from './overview/ResourcePanels';
import { CostPanel } from './overview/CostPanel';
import { SecurityPanel } from './overview/SecurityPanel';
import { ConnectivityHealth, KubernetesSummary } from './overview/InfraPanels';
import { SyncPanel } from './overview/SyncPanel';
import { ActivityTimeline } from './overview/ActivityTimeline';
import { TopProblemAccounts } from './overview/TopProblemAccounts';
import { LockedSection } from './overview/primitives';

const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === 'fulfilled' ? r.value : fallback);
const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

export function OverviewPanel({ refreshToken }: { refreshToken: number }) {
  const navigate = useNavigate();
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'viewer';
  const can = useMemo(() => deriveCapabilities(role, menuPermissions), [role, menuPermissions]);
  const canCost = can.has('cost.read');
  const canSecurity = can.has('security.read');
  const canK8s = can.has('kubernetes.read');

  const [filters, setFilters] = useState<OverviewFilterState>(DEFAULT_OVERVIEW_FILTERS);
  const days = TIME_DAYS[filters.time];
  const region = filters.region === 'all' ? undefined : filters.region;

  const query = useQuery({
    queryKey: ['cloud-accounts', 'overview-cc', refreshToken, region ?? 'all', days, canCost, canSecurity, canK8s],
    queryFn: async () => {
      const [aws, azure, gcp, hAws, hAzure, hGcp, res, containers, sec, cost, envs] = await Promise.allSettled([
        api.getAwsAccountsDashboard(),
        api.getAzureAccountsDashboard(),
        api.getGcpAccountsDashboard(),
        api.getAwsHealthDetailed(),
        api.getAzureHealthDetailed(),
        api.getGcpHealthDetailed(),
        api.getResourcesDashboard({ region, days }),
        canK8s ? api.getContainersDashboard() : Promise.resolve(null),
        canSecurity ? api.getVulnerabilityDashboard() : Promise.resolve(null),
        canCost ? api.getOverviewCost() : Promise.resolve(null),
        api.getEnvironments(),
      ]);

      const dashes: ProviderDashes = {
        aws: val(aws, EMPTY_DASHBOARD),
        azure: val(azure, EMPTY_DASHBOARD),
        gcp: val(gcp, EMPTY_DASHBOARD),
      };
      const health: ProviderHealth = { aws: ok(hAws), azure: ok(hAzure), gcp: ok(hGcp) };

      return {
        dashes,
        health,
        resources: ok(res),
        resourcesError: res.status === 'rejected',
        containers: ok(containers),
        security: ok(sec),
        cost: ok(cost),
        environments: ok(envs)?.environments ?? null,
        fetchedAt: Date.now(),
      };
    },
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-6 text-center">
        <Icon name="alert-triangle" size={20} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-red-700 dark:text-red-300">Couldn’t load the cloud overview.</p>
        <button onClick={() => query.refetch()} className="mt-3 text-xs font-medium text-red-700 dark:text-red-300 underline">Retry</button>
      </div>
    );
  }

  const d = query.data;
  const fullAgg = aggregateOverview(d.dashes, d.health);

  // Empty state — nothing connected at all (spec §8, §35).
  if (fullAgg.totals.total === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-20">
        <div className="h-14 w-14 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon name="cloud" size={24} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No cloud accounts</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
          Connect AWS, Azure or GCP to start discovering your cloud environment.
        </p>
      </div>
    );
  }

  // Cloud filter — narrow every provider-derived section to one provider.
  const narrowed = narrowToProvider(d.dashes, d.health, filters.provider);
  const agg = aggregateOverview(narrowed.dashes, narrowed.health);
  const attention = buildAttentionItems(agg, narrowed.dashes, { security: d.security });
  const activity = mergeActivity(narrowed.dashes);
  const problems = topProblemAccounts(narrowed.dashes);
  const potentialSavings = PROVIDERS.reduce((n, p) => n + narrowed.dashes[p].potentialMonthlySavings, 0);

  const healthPct = agg.totals.healthPercent;

  function drillHealth(state: string) {
    // 'aws'/'azure'/'gcp' from the provider-comparison chart set the Cloud filter;
    // 'healthy'/'warning'/'critical' jump to the Health tab.
    const asProvider = PROVIDERS.find((p) => p === state);
    if (asProvider) setFilters((f) => ({ ...f, provider: asProvider }));
    else navigate('/cloud-accounts?tab=Health');
  }

  return (
    <div className="flex flex-col gap-5">
      <OverviewFilters
        value={filters}
        onChange={setFilters}
        updatedAt={d.fetchedAt}
        onRefresh={() => query.refetch()}
        refreshing={query.isFetching}
      />

      {/* Executive KPI strip (spec §44.1) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Environments" value={agg.totals.total.toLocaleString()} icon="cloud" />
        <StatCard label="Healthy" value={agg.totals.healthy.toLocaleString()} icon="check-circle" iconTone="good" />
        <StatCard label="Failed" value={agg.totals.critical.toLocaleString()} icon="shield-alert" iconTone={agg.totals.critical > 0 ? 'critical' : 'neutral'} />
        <StatCard label="Needs Attention" value={agg.totals.attention.toLocaleString()} icon="alert-triangle" iconTone={agg.totals.attention > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Resources" value={agg.totals.resources.toLocaleString()} icon="resources" />
        <StatCard
          label="Overall Health"
          value={healthPct === null ? '—' : `${healthPct}%`}
          icon="gauge"
          iconTone={healthPct === null ? 'neutral' : healthPct >= 85 ? 'good' : healthPct >= 60 ? 'warning' : 'critical'}
        />
        {canCost
          ? <StatCard label="Cloud Cost (MTD)" value={money(d.cost?.monthToDate ?? agg.totals.monthlyCost)} icon="cost" />
          : <StatCard label="Regions" value={(d.resources ? Object.keys(d.resources.byRegion).length : 0).toLocaleString()} icon="map-pin" />}
        <StatCard
          label="Last Discovery"
          value={fullAgg.lastDiscovery ? new Date(fullAgg.lastDiscovery).toLocaleDateString() : 'Never'}
          icon="clock"
        />
      </div>

      {/* Provider cards (spec §7) */}
      <ProviderCards agg={fullAgg} activeFilter={filters.provider} onSelect={(p) => setFilters((f) => ({ ...f, provider: p }))} />

      {/* Attention required (spec §20) — high in the flow, before the charts */}
      <AttentionRequired items={attention} />

      {/* Health (spec §9, §10) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CloudHealthDonut agg={agg} onDrill={drillHealth} />
        <ProviderHealthComparison agg={agg} onDrill={drillHealth} />
      </div>

      {/* Resources (spec §11, §13) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ResourceDistribution res={d.resources} error={d.resourcesError} />
        <ResourceGrowth res={d.resources} days={days} error={d.resourcesError} />
      </div>

      {/* Cost + Security (spec §14–16) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {canCost
          ? <CostPanel agg={agg} monthToDate={d.cost?.monthToDate ?? null} potentialSavings={potentialSavings} />
          : <LockedSection title="Cloud Cost" reason="You don’t have cost access for this organization." />}
        {canSecurity
          ? <SecurityPanel security={d.security} />
          : <LockedSection title="Security & Risk" reason="You don’t have security access for this organization." />}
      </div>

      {/* Infra health + Kubernetes (spec §17, §18) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ConnectivityHealth health={narrowed.health} />
        {canK8s && <KubernetesSummary containers={d.containers} />}
      </div>

      {/* Sync health (spec §19) */}
      <SyncPanel agg={agg} dashes={narrowed.dashes} onDrill={() => navigate('/cloud-accounts?tab=Sync+Center')} />

      {/* Distribution — regions + environments (spec §23, §24) */}
      <DistributionPanel res={d.resources} environments={d.environments} error={d.resourcesError} />

      {/* Activity timeline + top problem accounts (spec §21, §26) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityTimeline entries={activity} />
        <TopProblemAccounts rows={problems} />
      </div>
    </div>
  );
}
