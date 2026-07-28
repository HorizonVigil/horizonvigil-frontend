import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useFilters } from '../lib/filterContext';
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

export function Monitoring() {
  const { account, refreshToken } = useFilters();
  const [dashboard, setDashboard] = useState<MonitoringDashboard | null>(null);
  const [alarms, setAlarms] = useState<MonitoringAlarm[]>([]);
  const [metrics, setMetrics] = useState<ResourceMetric[]>([]);
  const [metricsTotal, setMetricsTotal] = useState(0);
  const [healthByConnection, setHealthByConnection] = useState<HealthByConnection[]>([]);
  const [notIntegrated, setNotIntegrated] = useState<NotIntegratedSection[]>([]);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [dashboardRes, alarmsRes, metricsRes, healthRes, logs, traces, serviceMap, performance, dashboards] = await Promise.all([
      api.getMonitoringDashboard(),
      api.getAlarms({ connectionId, limit: 200 }),
      api.getMetrics({ limit: 200 }),
      api.getMonitoringHealth(),
      api.getLogs(),
      api.getTraces(),
      api.getServiceMap(),
      api.getPerformance(),
      api.getCloudWatchDashboards(),
    ]);
    setDashboard(dashboardRes);
    setAlarms(alarmsRes.items);
    setMetrics(metricsRes.items);
    setMetricsTotal(metricsRes.pagination.total);
    setHealthByConnection(healthRes.connections);
    setNotIntegrated([
      { key: 'logs', label: 'Logs', reason: logs.reason },
      { key: 'traces', label: 'Traces', reason: traces.reason },
      { key: 'serviceMap', label: 'Service Map', reason: serviceMap.reason },
      { key: 'performance', label: 'Performance / APM', reason: performance.reason },
      { key: 'dashboards', label: 'CloudWatch Dashboards', reason: dashboards.reason },
    ]);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

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
      <FilterBar title="Monitoring" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Monitored Resources" value={String(dashboard?.resourceHealth.total ?? 0)} />
        <StatCard label="CloudWatch Alarms" value={String(dashboard?.alarms.total ?? 0)} caption={dashboard?.alarms.note} />
        <StatCard label="Alarms in ALARM state" value={String(dashboard?.alarms.byState['ALARM'] ?? 0)} />
        <StatCard label="Metrics Collected" value={metricsTotal.toLocaleString()} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources by Health State</h3>
          <Donut data={Object.entries(dashboard?.resourceHealth.byState ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value }))} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Alarms by State</h3>
          <Donut data={Object.entries(dashboard?.alarms.byState ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value }))} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Health by Connection</h3>
        <DataTable columns={healthColumns} rows={healthByConnection} rowKey={h => h.connectionId} emptyMessage="No connections to report health for yet." />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Metrics</h3>
        <p className="text-xs text-slate-400 mb-3">CloudWatch metrics collected per resource. These populate as your connected accounts sync — nothing to configure per resource.</p>
        <DataTable
          columns={metricColumns}
          rows={metrics}
          rowKey={m => m.id}
          emptyMessage="No metrics collected yet — these populate automatically once a CloudWatch pull runs for a connected account."
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">CloudWatch Alarms</h3>
        <DataTable columns={alarmColumns} rows={alarms} rowKey={a => a.id} emptyMessage="No CloudWatch alarms discovered yet." />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Additional Observability</h3>
        <p className="text-xs text-slate-400 mb-3">Logs, distributed traces, service maps, APM, and CloudWatch dashboards aren't pulled into this build yet — each section below reports honestly rather than showing a silent empty table.</p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {notIntegrated.map(section => (
            <li key={section.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2 text-sm">
              <span className="font-medium text-slate-600 dark:text-slate-300 shrink-0">{section.label}</span>
              <span className="text-xs text-slate-400">{section.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
