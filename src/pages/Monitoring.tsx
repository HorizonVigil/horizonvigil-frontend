import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { RoadmapPanel } from '../components/EmptyState';
import type { IconName } from '../components/icons';
import { useFilters } from '../lib/filterContext';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type MonitoringAlarm, type ResourceMetric } from '../lib/api';

function timeAgo(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

interface MonitoringDashboard {
  alarms: { total: number; byState: Record<string, number>; note?: string };
  resourceHealth: { total: number; byState: Record<string, number>; byStatus: Record<string, number> };
}

interface HealthByConnection {
  connectionId: string;
  connectionName: string;
  total: number;
  byState: Record<string, number>;
}

interface NotIntegratedSection { key: string; label: string; reason: string }

// getMetrics is server-paginated (unlike the rest of this page's data, it
// isn't scoped by account/connectionId) -- the Metrics tab used to just
// fetch a flat `limit: 200` with no way to reach anything past that, so
// anything beyond the first 200 rows was simply unreachable. Paging keeps
// the same per-request size and adds Prev/Next, matching the pager pattern
// used on CloudAccounts.tsx's Account Inventory tab.
const METRICS_PAGE_SIZE = 200;

// Must match navConfig.ts's Monitoring children labels exactly — that file
// links here via ?tab=<value>, not derived from this array.
const TABS = ['CloudWatch', 'Metrics', 'Logs', 'Traces', 'Dashboards', 'Health', 'Service Map', 'Performance'] as const;
type Tab = typeof TABS[number];

const NOT_INTEGRATED_ICON: Record<string, IconName> = { Logs: 'file', Traces: 'activity', Dashboards: 'dashboard', 'Service Map': 'network', Performance: 'gauge' };

function NotIntegratedPanel({ tab, section }: { tab: string; section: NotIntegratedSection | undefined }) {
  return (
    <RoadmapPanel
      icon={NOT_INTEGRATED_ICON[tab] ?? 'layers'}
      title={`${section?.label ?? tab} — planned capability`}
      description={section?.reason ?? 'This capability is part of the product roadmap and will be available in a future release.'}
    />
  );
}

export function Monitoring() {
  const { account, refreshToken } = useFilters();
  const canSeeTab = useSubmenuAccess('monitoring');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'CloudWatch');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [alarms, setAlarms] = useState<MonitoringAlarm[]>([]);
  const [metrics, setMetrics] = useState<ResourceMetric[]>([]);
  const [metricsTotal, setMetricsTotal] = useState(0);
  const [metricsPage, setMetricsPage] = useState(1);
  const [healthByConnection, setHealthByConnection] = useState<HealthByConnection[]>([]);
  const [notIntegrated, setNotIntegrated] = useState<Record<string, NotIntegratedSection>>({});

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [dashboardRes, alarmsRes, healthRes, logs, traces, serviceMap, performance, dashboards] = await Promise.all([
      api.getMonitoringDashboard(),
      api.getAlarms({ connectionId, limit: 200 }),
      api.getMonitoringHealth(),
      api.getLogs(),
      api.getTraces(),
      api.getServiceMap(),
      api.getPerformance(),
      api.getCloudWatchDashboards(),
    ]);
    setDashboard(dashboardRes);
    setAlarms(alarmsRes.items);
    setHealthByConnection(healthRes.connections);
    setNotIntegrated({
      Logs: { key: 'logs', label: 'Logs', reason: logs.reason },
      Traces: { key: 'traces', label: 'Traces', reason: traces.reason },
      'Service Map': { key: 'serviceMap', label: 'Service Map', reason: serviceMap.reason },
      Performance: { key: 'performance', label: 'Performance / APM', reason: performance.reason },
      Dashboards: { key: 'dashboards', label: 'CloudWatch Dashboards', reason: dashboards.reason },
    });
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // Metrics fetch is split out from the rest of the dashboard load so paging
  // through it doesn't re-fetch alarms/health/etc. on every click.
  const loadMetrics = useCallback(async (page: number) => {
    const metricsRes = await api.getMetrics({ page, limit: METRICS_PAGE_SIZE });
    setMetrics(metricsRes.items);
    setMetricsTotal(metricsRes.pagination.total);
  }, []);

  useEffect(() => { void loadMetrics(metricsPage); }, [loadMetrics, metricsPage, refreshToken]);

  const metricsTotalPages = Math.max(1, Math.ceil(metricsTotal / METRICS_PAGE_SIZE));

  const alarmColumns: Column<MonitoringAlarm>[] = [
    { key: 'name', header: 'Alarm', render: a => a.alarm_name, sortValue: a => a.alarm_name },
    {
      key: 'state', header: 'State',
      render: a => <Badge tone={a.state === 'ALARM' ? 'critical' : a.state === 'OK' ? 'good' : 'neutral'}>{a.state}</Badge>,
      sortValue: a => a.state,
    },
    { key: 'metric', header: 'Metric', render: a => a.metric_name, sortValue: a => a.metric_name },
    { key: 'namespace', header: 'Namespace', render: a => a.namespace, sortValue: a => a.namespace },
    { key: 'region', header: 'Region', render: a => a.region ?? 'global', sortValue: a => a.region ?? '' },
    { key: 'updated', header: 'Updated', render: a => timeAgo(a.updated_at), sortValue: a => a.updated_at },
  ];

  const metricColumns: Column<ResourceMetric>[] = [
    { key: 'resource', header: 'Resource', render: m => <span className="font-mono text-xs">{m.resource_id ?? '—'}</span>, sortValue: m => m.resource_id ?? '' },
    { key: 'type', header: 'Type', render: m => m.resource_type_key.replace(/_/g, ' '), sortValue: m => m.resource_type_key },
    { key: 'metric', header: 'Metric', render: m => m.metric_name, sortValue: m => m.metric_name },
    { key: 'namespace', header: 'Namespace', render: m => m.namespace, sortValue: m => m.namespace },
    { key: 'region', header: 'Region', render: m => m.region ?? '—', sortValue: m => m.region ?? '' },
    { key: 'value', header: 'Value', render: m => `${m.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${m.unit ? ` ${m.unit}` : ''}`, sortValue: m => m.value },
    { key: 'ts', header: 'Timestamp', render: m => timeAgo(m.ts), sortValue: m => m.ts },
  ];

  const healthColumns: Column<HealthByConnection>[] = [
    { key: 'connection', header: 'Connection', render: h => h.connectionName, sortValue: h => h.connectionName },
    { key: 'total', header: 'Monitored Resources', render: h => h.total.toLocaleString(), sortValue: h => h.total },
    {
      key: 'states', header: 'By State',
      render: h => Object.entries(h.byState).length > 0
        ? <span className="text-xs">{Object.entries(h.byState).map(([state, count]) => `${state}: ${count}`).join(', ')}</span>
        : <span className="text-slate-400 text-xs">—</span>,
    },
  ];

  return (
    <div>
      <FilterBar title="Monitoring" breadcrumb={<Breadcrumb />} showRegionFilter={false} showDateFilter={false} />

      <div className="flex gap-1 mb-5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {visibleTabs.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'CloudWatch' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Monitored Resources" value={String(dashboard?.resourceHealth.total ?? 0)} />
            <StatCard label="CloudWatch Alarms" value={String(dashboard?.alarms.total ?? 0)} caption={dashboard?.alarms.note} />
            <StatCard label="Alarms in ALARM state" value={String(dashboard?.alarms.byState['ALARM'] ?? 0)} />
            <StatCard label="Metrics Collected" value={metricsTotal.toLocaleString()} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Alarms by State</h3>
            <Donut data={Object.entries(dashboard?.alarms.byState ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value }))} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">CloudWatch Alarms</h3>
            <DataTable columns={alarmColumns} rows={alarms} rowKey={a => a.id} emptyMessage="No CloudWatch alarms discovered yet." />
          </div>
        </>
      )}

      {tab === 'Metrics' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Metrics</h3>
          <p className="text-xs text-slate-400 mb-3">CloudWatch metrics collected per resource. These populate as your connected accounts sync — nothing to configure per resource.</p>
          <DataTable
            columns={metricColumns}
            rows={metrics}
            rowKey={m => m.id}
            emptyMessage="No metrics collected yet — these populate automatically once a CloudWatch pull runs for a connected account."
          />
          {metricsTotal > METRICS_PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-1 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              <span>Page {metricsPage} of {metricsTotalPages} · {metricsTotal.toLocaleString()} metrics total</span>
              <div className="flex items-center gap-1">
                <button disabled={metricsPage <= 1} onClick={() => setMetricsPage(p => Math.max(1, p - 1))} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Prev</button>
                <button disabled={metricsPage >= metricsTotalPages} onClick={() => setMetricsPage(p => Math.min(metricsTotalPages, p + 1))} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'Health' && (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources by Health State</h3>
            <Donut data={Object.entries(dashboard?.resourceHealth.byState ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value }))} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Health by Connection</h3>
            <DataTable columns={healthColumns} rows={healthByConnection} rowKey={h => h.connectionId} emptyMessage="No connections to report health for yet." />
          </div>
        </>
      )}

      {(tab === 'Logs' || tab === 'Traces' || tab === 'Dashboards' || tab === 'Service Map' || tab === 'Performance') && (
        <NotIntegratedPanel tab={tab} section={notIntegrated[tab]} />
      )}
    </div>
  );
}
