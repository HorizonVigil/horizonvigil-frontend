/**
 * Cloud Accounts — Overview tab (spec §5–12). A per-user, high-level view of
 * every connected cloud environment: KPIs, unified provider summary +
 * health %, attention-required, recent activity, and (permission-gated)
 * top-risk + cost summaries that link into the Security and FinOps modules.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '../StatCard';
import { Badge } from '../Badge';
import { Icon } from '../icons';
import { StatCardSkeleton, CardSkeleton } from '../Skeleton';
import { useOrg } from '../../lib/orgContext';
import { deriveCapabilities } from '../../lib/overview/capabilities';
import { combineHealth, healthTierClass } from '../../lib/cloudAccounts/health';
import { api, type Role, type AwsAccountsDashboard } from '../../lib/api';
import { money } from '../../lib/format';

const EMPTY_DASH: AwsAccountsDashboard = {
  totalAccounts: 0, healthyAccounts: 0, failedAccounts: 0, disconnectedAccounts: 0, accountsNeedingAttention: 0,
  resourcesDiscovered: 0, regionsCovered: 0, lastDiscovery: null, nextScheduledDiscovery: null, discoverySuccessRate: null,
  accountsNeedingAttentionList: [], permissionErrors: 0, syncFailures: 0, monthlyCost: 0, topCostAccounts: [],
  topGrowingAccounts: [], openRecommendations: 0, potentialMonthlySavings: 0, rotationDue: 0, recentActivity: [], recentAlerts: [],
};

export function OverviewPanel({ refreshToken, onProviderClick }: { refreshToken: number; onProviderClick: (p: 'aws' | 'azure' | 'gcp') => void }) {
  const navigate = useNavigate();
  const { currentOrg, menuPermissions } = useOrg();
  const role = (currentOrg?.myRole as Role) ?? 'viewer';
  const can = useMemo(() => deriveCapabilities(role, menuPermissions), [role, menuPermissions]);

  const query = useQuery({
    queryKey: ['cloud-accounts', 'overview', refreshToken, can.has('security.read'), can.has('cost.read')],
    queryFn: async () => {
      const [aws, azure, gcp, hAws, hAzure, hGcp, sec, cost] = await Promise.allSettled([
        api.getAwsAccountsDashboard(), api.getAzureAccountsDashboard(), api.getGcpAccountsDashboard(),
        api.getAwsHealthDetailed(), api.getAzureHealthDetailed(), api.getGcpHealthDetailed(),
        can.has('security.read') ? api.getVulnerabilityDashboard() : Promise.resolve(null),
        can.has('cost.read') ? api.getOverviewCost() : Promise.resolve(null),
      ]);
      const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T => (r.status === 'fulfilled' ? r.value : fallback);
      const dashes = { aws: val(aws, EMPTY_DASH), azure: val(azure, EMPTY_DASH), gcp: val(gcp, EMPTY_DASH) };
      const health = combineHealth([
        hAws.status === 'fulfilled' ? hAws.value : null,
        hAzure.status === 'fulfilled' ? hAzure.value : null,
        hGcp.status === 'fulfilled' ? hGcp.value : null,
      ]);
      return { dashes, health, security: val(sec, null), cost: val(cost, null) };
    },
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  const d = query.data!;
  const totals = (['aws', 'azure', 'gcp'] as const).reduce(
    (acc, p) => {
      acc.total += d.dashes[p].totalAccounts;
      acc.healthy += d.dashes[p].healthyAccounts;
      acc.failed += d.dashes[p].failedAccounts;
      acc.attention += d.dashes[p].accountsNeedingAttention;
      acc.resources += d.dashes[p].resourcesDiscovered;
      acc.cost += d.dashes[p].monthlyCost;
      return acc;
    },
    { total: 0, healthy: 0, failed: 0, attention: 0, resources: 0, cost: 0 },
  );
  const lastDiscovery = [d.dashes.aws.lastDiscovery, d.dashes.azure.lastDiscovery, d.dashes.gcp.lastDiscovery].filter(Boolean).sort().at(-1) ?? null;
  const attentionList = [...d.dashes.aws.accountsNeedingAttentionList, ...d.dashes.azure.accountsNeedingAttentionList, ...d.dashes.gcp.accountsNeedingAttentionList];
  const recentActivity = [...d.dashes.aws.recentActivity, ...d.dashes.azure.recentActivity, ...d.dashes.gcp.recentActivity]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1)).slice(0, 8);

  if (totals.total === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-16">
        <div className="h-14 w-14 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon name="cloud" size={24} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">No cloud environments connected</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">Connect an AWS account, Azure subscription or GCP project to see your unified cloud control plane here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Environments" value={totals.total.toLocaleString()} icon="cloud" />
        <StatCard label="Healthy" value={totals.healthy.toLocaleString()} icon="check-circle" iconTone="good" />
        <StatCard label="Failed" value={totals.failed.toLocaleString()} icon="shield-alert" iconTone={totals.failed > 0 ? 'critical' : 'neutral'} />
        <StatCard label="Needs Attention" value={totals.attention.toLocaleString()} icon="alert-triangle" iconTone={totals.attention > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Total Resources" value={totals.resources.toLocaleString()} icon="resources" />
        <StatCard label="Overall Health" value={d.health.healthPercent === null ? '—' : `${d.health.healthPercent}%`} icon="gauge"
          iconTone={d.health.healthPercent !== null && d.health.healthPercent >= 85 ? 'good' : d.health.healthPercent !== null && d.health.healthPercent >= 60 ? 'warning' : 'critical'} />
        {can.has('cost.read') && <StatCard label="Cloud Cost (MTD)" value={money(d.cost?.monthToDate ?? totals.cost)} icon="cost" />}
        <StatCard label="Last Discovery" value={lastDiscovery ? new Date(lastDiscovery).toLocaleDateString() : 'Never'} icon="clock" />
      </div>

      {/* Provider summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['aws', 'azure', 'gcp'] as const).map((p) => {
          const dash = d.dashes[p];
          const ph = d.health.perProvider.find((x) => x.provider === p);
          const providerLabel = p === 'aws' ? 'AWS' : p === 'azure' ? 'Azure' : 'GCP';
          const unit = p === 'aws' ? 'accounts' : p === 'azure' ? 'subscriptions' : 'projects';
          return (
            <button key={p} type="button" onClick={() => onProviderClick(p)}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-left hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{providerLabel}</span>
                <span className={`text-sm font-semibold tabular-nums ${healthTierClass(ph?.healthPercent ?? null)}`}>{ph?.healthPercent === null || ph === undefined ? '—' : `${ph.healthPercent}%`}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{dash.totalAccounts.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mb-2">{unit}</div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="good">{dash.healthyAccounts} healthy</Badge>
                {dash.accountsNeedingAttention > 0 && <Badge tone="warning">{dash.accountsNeedingAttention} attention</Badge>}
                {dash.failedAccounts > 0 && <Badge tone="critical">{dash.failedAccounts} failed</Badge>}
              </div>
            </button>
          );
        })}
      </div>

      {/* Attention required */}
      {attentionList.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 p-4">
          <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-1.5"><Icon name="alert-triangle" size={14} /> Attention Required</h3>
          <ul className="flex flex-col divide-y divide-amber-100 dark:divide-amber-900/40">
            {attentionList.slice(0, 8).map((a) => (
              <li key={a.connectionId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <button onClick={() => navigate(`/cloud-accounts/${a.connectionId}`)} className="text-slate-700 dark:text-slate-200 hover:underline font-medium truncate">{a.connectionName}</button>
                <span className="text-slate-500 dark:text-slate-400 text-xs shrink-0">{a.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk + Cost + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {can.has('security.read') && d.security && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
              Top Risk Summary
              <button onClick={() => navigate('/vulnerability-management')} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Security →</button>
            </h3>
            <dl className="text-sm flex flex-col gap-2">
              <Row label="Critical" value={d.security.bySeverity?.critical ?? 0} />
              <Row label="High" value={d.security.bySeverity?.high ?? 0} />
              <Row label="Open findings" value={d.security.openFindings} />
              <Row label="Risk score" value={d.security.riskScore} />
            </dl>
          </div>
        )}
        {can.has('cost.read') && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3 flex items-center justify-between">
              Cost Summary
              <button onClick={() => navigate('/cost-management')} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">FinOps →</button>
            </h3>
            <dl className="text-sm flex flex-col gap-2">
              <Row label="AWS" value={money(d.dashes.aws.monthlyCost)} />
              <Row label="Azure" value={money(d.dashes.azure.monthlyCost)} />
              <Row label="GCP" value="not tracked" />
              <Row label="Potential savings/mo" value={money(d.dashes.aws.potentialMonthlySavings + d.dashes.azure.potentialMonthlySavings)} />
            </dl>
          </div>
        )}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent Cloud Activity</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {recentActivity.map((e) => (
              <li key={e.id} className="py-2 text-sm flex justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-200 truncate">{e.action.replace(/_/g, ' ').replace(/\./g, ' — ')}</span>
                <span className="text-xs text-slate-400 shrink-0">{new Date(e.occurredAt).toLocaleDateString()}</span>
              </li>
            ))}
            {recentActivity.length === 0 && <li className="py-2 text-sm text-slate-400">No activity yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-slate-800 dark:text-slate-100 tabular-nums">{value}</dd>
    </div>
  );
}
