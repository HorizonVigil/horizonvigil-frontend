/**
 * Platform-category Overview widgets — cloud accounts, resource inventory,
 * environment / infrastructure / service / kubernetes health, folders.
 *
 * Scope note: getResourcesDashboard / getContainersDashboard / getMonitoringHealth
 * / getEnvironments take no per-connection filter server-side today (only
 * getResourcesDashboard accepts `connectionId`). They return org-wide numbers;
 * a restricted user's Overview therefore over-reports these until the
 * endpoints gain a scope parameter (tracked as a backend follow-up).
 */
import { Donut } from '../../charts/Donut';
import { LineChart } from '../../charts/LineChart';
import { api } from '../../../lib/api';
import { daysAgoISO, healthTier } from '../../../lib/format';
import { dateRangeToDays } from '../../../lib/filterContext';
import { scopedConnectionId, scopeMonitoringHealth } from '../../../lib/overview/scope';
import type { WidgetComponent } from '../../../lib/overview/types';
import { EmptyState, KpiValue, ViewAllLink, WidgetBody, useWidgetQuery } from './shared';

export const CloudAccountsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('cloud-accounts', ctx, async () => {
    const [aws, azure, gcp, dash] = await Promise.allSettled([
      api.getAccounts({ limit: 1 }), api.getAzureAccounts({ limit: 1 }), api.getGcpAccounts({ limit: 1 }),
      api.getOverviewDashboard({ region: ctx.region }),
    ]);
    const n = (r: PromiseSettledResult<{ pagination: { total: number } }>) => (r.status === 'fulfilled' ? r.value.pagination.total : 0);
    const conns = dash.status === 'fulfilled' ? dash.value.connections : { total: 0, connected: 0, error: 0 };
    return { aws: n(aws), azure: n(azure), gcp: n(gcp), total: conns.total, connected: conns.connected, error: conns.error };
  });

  return (
    <WidgetBody query={query} errorLabel="Cloud accounts couldn't be loaded." emptyTitle="No accounts connected yet"
      emptyDescription="Connect an AWS, Azure or GCP account to populate your Overview." emptyIcon="cloud"
      isEmpty={(d) => d.total === 0}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {(['aws', 'azure', 'gcp'] as const).map((p) => (
              <div key={p} className="rounded-lg border border-slate-200 dark:border-slate-800 py-2">
                <div className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{d[p]}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">{p}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {d.error > 0
              ? <span className="text-amber-600 dark:text-amber-400 font-medium">{d.error} need attention</span>
              : <span className="text-emerald-600 dark:text-emerald-400 font-medium">All {d.connected} connected</span>}
          </p>
          <ViewAllLink to="/cloud-accounts" label="Manage accounts" />
        </div>
      )}
    </WidgetBody>
  );
};

export const ResourceInventoryWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('resource-inventory', ctx, () =>
    api.getResourcesDashboard({ region: ctx.region, connectionId: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Resource inventory couldn't be loaded." emptyTitle="No resources discovered yet"
      emptyDescription="Run discovery on a connected account." emptyIcon="resources"
      isEmpty={(d) => (d.total ?? 0) === 0}>
      {(d) => {
        const rows = Object.entries(d.byCategory).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).slice(0, 6);
        return (
          <div className="flex flex-col gap-2">
            <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{d.total.toLocaleString()}</div>
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {rows.map(([cat, count]) => (
                <li key={cat} className="flex justify-between py-1.5">
                  <span className="text-slate-600 dark:text-slate-300">{cat}</span>
                  <span className="text-slate-400 tabular-nums">{count.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <ViewAllLink to="/resources" label="Open Asset Inventory" />
          </div>
        );
      }}
    </WidgetBody>
  );
};

export const ResourceDistributionWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('resource-distribution', ctx, () =>
    api.getResourcesDashboard({ region: ctx.region, connectionId: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Resource distribution couldn't be loaded." emptyTitle="No resources yet"
      emptyIcon="chart-pie" isEmpty={(d) => (d.total ?? 0) === 0}>
      {(d) => (
        <Donut
          data={Object.entries(d.byCategory).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))}
          centerLabel={{ value: String(d.total), caption: 'resources' }}
        />
      )}
    </WidgetBody>
  );
};

export const ResourceTrendWidget: WidgetComponent = ({ ctx }) => {
  const days = dateRangeToDays(ctx.dateRange);
  const query = useWidgetQuery('resource-trend', ctx, () =>
    api.getResourcesDashboard({ region: ctx.region, days, connectionId: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Resource trend couldn't be loaded." emptyTitle="No resource activity yet"
      emptyIcon="chart-line" isEmpty={(d) => (d.trend30d ?? []).length === 0}>
      {(d) => (
        <LineChart series={[
          { label: 'Created', points: d.trend30d.map((p) => ({ x: p.date, y: p.created })) },
          { label: 'Deleted', points: d.trend30d.map((p) => ({ x: p.date, y: p.deleted })) },
        ]} />
      )}
    </WidgetBody>
  );
};

export const ResourceChangesWidget: WidgetComponent = ({ ctx }) => {
  const days = dateRangeToDays(ctx.dateRange);
  const query = useWidgetQuery('resource-changes', ctx, () =>
    api.getResourcesDashboard({ region: ctx.region, days, connectionId: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Resource changes couldn't be loaded." emptyTitle="No changes recorded"
      emptyIcon="activity" isEmpty={(d) => (d.trend30d ?? []).length === 0}>
      {(d) => {
        const created = d.trend30d.reduce((s, p) => s + p.created, 0);
        const deleted = d.trend30d.reduce((s, p) => s + p.deleted, 0);
        return (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">+{created}</div>
              <div className="text-xs text-slate-400">created ({d.trendDays}d)</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <div className="text-xl font-semibold text-red-600 dark:text-red-400 tabular-nums">-{deleted}</div>
              <div className="text-xs text-slate-400">deleted ({d.trendDays}d)</div>
            </div>
          </div>
        );
      }}
    </WidgetBody>
  );
};

export const InfrastructureChangesWidget: WidgetComponent = ({ ctx }) => {
  const days = dateRangeToDays(ctx.dateRange);
  const query = useWidgetQuery('infrastructure-changes', ctx, () =>
    api.getResourceTimeline({ from: daysAgoISO(days), connectionId: scopedConnectionId(ctx.scope), limit: 8 }));
  return (
    <WidgetBody query={query} errorLabel="Infrastructure changes couldn't be loaded." emptyTitle="No infrastructure changes"
      emptyIcon="activity" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((e) => (
            <li key={e.id} className="py-1.5 flex justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{e.event_type.replace(/_/g, ' ')} · {e.aws_resource_id}</span>
              <span className="text-slate-400 shrink-0">{new Date(e.occurred_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const RecentChangesWidget: WidgetComponent = (props) => <InfrastructureChangesWidget {...props} />;

export const EnvironmentHealthWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('environment-health', ctx, async () => {
    const [envs, dash] = await Promise.all([api.getEnvironments(), api.getOverviewDashboard({ region: ctx.region })]);
    return { environments: envs.environments, connections: dash.connections };
  });
  return (
    <WidgetBody query={query} errorLabel="Environment health couldn't be loaded." emptyTitle="No environments configured"
      emptyIcon="layers" isEmpty={(d) => d.environments.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {d.environments.map((e) => (
            <li key={e.environment} className="flex justify-between py-2">
              <span className="text-slate-700 dark:text-slate-200 capitalize">{e.environment}</span>
              <span className="text-xs text-slate-400 tabular-nums">{e.count.toLocaleString()} resources</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

const HealthRollup: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('infrastructure-health', ctx, async () => scopeMonitoringHealth(await api.getMonitoringHealth(), ctx.scope));
  return (
    <WidgetBody query={query} errorLabel="Health couldn't be loaded." emptyTitle="No health data yet"
      emptyIcon="gauge" isEmpty={(d) => (d.total ?? 0) === 0}>
      {(d) => {
        const healthy = d.overallByStatus?.healthy ?? d.overallByState?.OK ?? 0;
        const pct = d.total > 0 ? Math.round((healthy / d.total) * 100) : 0;
        const tier = healthTier(pct);
        return (
          <div className="flex flex-col gap-2">
            <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{pct}%</div>
            <div className={tier.className}>{tier.label}</div>
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {Object.entries(d.overallByStatus ?? {}).map(([k, v]) => (
                <li key={k} className="flex justify-between py-1"><span className="text-slate-600 dark:text-slate-300 capitalize">{k}</span><span className="text-slate-400 tabular-nums">{v}</span></li>
              ))}
            </ul>
          </div>
        );
      }}
    </WidgetBody>
  );
};

export const InfrastructureHealthWidget: WidgetComponent = HealthRollup;
export const ServiceHealthWidget: WidgetComponent = HealthRollup;

export const KubernetesHealthWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kubernetes-health', ctx, () => api.getContainersDashboard());
  return (
    <WidgetBody query={query} errorLabel="Kubernetes health couldn't be loaded." emptyTitle="No clusters discovered"
      emptyDescription="Connect an EKS or GKE cluster." emptyIcon="containers" isEmpty={(d) => d.total === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 py-2">
              <div className="text-lg font-semibold tabular-nums">{d.eksCount}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">EKS</div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 py-2">
              <div className="text-lg font-semibold tabular-nums">{d.ecsCount}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">ECS</div>
            </div>
          </div>
          <p className="text-xs text-slate-400">{d.total.toLocaleString()} container resources tracked</p>
          <ViewAllLink to="/clusters/aws" label="Open Clusters" />
        </div>
      )}
    </WidgetBody>
  );
};

export const FoldersProjectsWidget: WidgetComponent = ({ ctx }) => {
  const { folders, projects } = ctx.scope;
  if (folders.length === 0 && projects.length === 0) {
    return <EmptyState icon="folder" title="No folders or projects" description="Set these up under Organization Management." />;
  }
  const countFor = (folderId: string) => projects.filter((p) => p.folder_id === folderId).length;
  return (
    <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
      {folders.map((f) => (
        <li key={f.id} className="flex justify-between py-2">
          <span className="text-slate-700 dark:text-slate-200">{f.name}</span>
          <span className="text-xs text-slate-400">{countFor(f.id)} project{countFor(f.id) === 1 ? '' : 's'}</span>
        </li>
      ))}
      {projects.filter((p) => !p.folder_id).map((p) => (
        <li key={p.id} className="flex justify-between py-2">
          <span className="text-slate-700 dark:text-slate-200">{p.name}</span>
          <span className="text-xs text-slate-400">project</span>
        </li>
      ))}
    </ul>
  );
};

export const PlatformHealthKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-platform-health', ctx, async () => {
    const dash = await api.getOverviewDashboard({ region: ctx.region });
    const c = dash.connections;
    const pct = c.total > 0 ? Math.round((c.connected / c.total) * 100) : null;
    return { pct, total: c.total };
  });
  if (query.isLoading || query.isError || !query.data) return <KpiValue label="Platform Health" value="—" icon="gauge" />;
  const { pct } = query.data;
  return <KpiValue label="Platform Health" value={pct === null ? '—' : `${pct}%`} icon="gauge"
    tone={pct === null ? 'neutral' : pct >= 90 ? 'good' : pct >= 60 ? 'warning' : 'critical'}
    caption={pct === null ? 'Connect an account' : healthTier(pct).label} onClick={() => ctx.navigate('/cloud-accounts')} />;
};

export const TotalAssetsKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-total-assets', ctx, () =>
    api.getResourcesDashboard({ region: ctx.region, connectionId: scopedConnectionId(ctx.scope) }));
  return <KpiValue label="Total Assets" value={query.data ? query.data.total.toLocaleString() : '—'} icon="resources"
    caption="in scope" onClick={() => ctx.navigate('/resources')} />;
};

export const ProjectsKpi: WidgetComponent = ({ ctx }) => (
  <KpiValue label="Projects" value={String(ctx.scope.projects.length)} icon="folder"
    caption={`${ctx.scope.folders.length} folders`} onClick={() => ctx.navigate('/organization?tab=Projects')} />
);
