import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { api, type CloudResource, type ResourceMetric } from '../lib/api';

const MONITORED_TYPES = ['ec2_instance', 'rds_instance', 'rds_cluster', 'lambda_function', 'eks_cluster', 'ecs_service', 'elasticache_cluster', 'ebs_volume'];

// Matches services/cloud-api/src/metrics.ts's METRIC_PLAN — the metric shown in the summary table per resource type.
const PRIMARY_METRIC: Record<string, string> = {
  ec2_instance: 'CPUUtilization',
  rds_instance: 'CPUUtilization',
  lambda_function: 'Invocations',
  ebs_volume: 'VolumeReadBytes',
};

function formatMetricValue(metric: string, value: number): string {
  if (metric.includes('Utilization')) return `${value.toFixed(1)}%`;
  if (metric.includes('Bytes')) {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)} GB`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)} MB`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)} KB`;
    return `${value.toFixed(0)} B`;
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function timeAgo(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function Monitoring() {
  const { account, refreshToken } = useFilters();
  const [alarms, setAlarms] = useState<CloudResource[]>([]);
  const [monitored, setMonitored] = useState<CloudResource[]>([]);
  const [metrics, setMetrics] = useState<ResourceMetric[]>([]);

  const [drawerResource, setDrawerResource] = useState<CloudResource | null>(null);
  const [metricNames, setMetricNames] = useState<string[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [seriesPoints, setSeriesPoints] = useState<{ ts: string; value: number }[]>([]);
  const [seriesUnit, setSeriesUnit] = useState<string | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [alarmRes, metricsRes, ...monitoredRes] = await Promise.all([
      api.getResources({ resourceTypeKey: 'cloudwatch_alarm', connectionId, limit: 500 }),
      api.getLatestMetrics(connectionId),
      ...MONITORED_TYPES.map(t => api.getResources({ resourceTypeKey: t, connectionId, limit: 500 })),
    ]);
    setAlarms(alarmRes.resources);
    setMetrics(metricsRes.metrics);
    setMonitored(monitoredRes.flatMap(r => r.resources));
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  useEffect(() => {
    if (!drawerResource) return;
    let cancelled = false;
    void api.getResourceMetricNames(drawerResource.id).then(res => {
      if (cancelled) return;
      setMetricNames(res.metricNames);
      const primary = PRIMARY_METRIC[drawerResource.resourceTypeKey];
      setSelectedMetric(primary && res.metricNames.includes(primary) ? primary : (res.metricNames[0] ?? ''));
    });
    return () => { cancelled = true; };
  }, [drawerResource]);

  useEffect(() => {
    if (!drawerResource || !selectedMetric) { setSeriesPoints([]); return; }
    let cancelled = false;
    setSeriesLoading(true);
    void api.getResourceMetricSeries(drawerResource.id, selectedMetric, 6).then(res => {
      if (cancelled) return;
      setSeriesPoints(res.points);
      setSeriesUnit(res.unit);
      setSeriesLoading(false);
    });
    return () => { cancelled = true; };
  }, [drawerResource, selectedMetric]);

  const alarmState = (a: CloudResource) => a.state ?? 'INSUFFICIENT_DATA';
  const byAlarmState: Record<string, number> = {};
  for (const a of alarms) byAlarmState[alarmState(a)] = (byAlarmState[alarmState(a)] ?? 0) + 1;

  const healthCounts = { Healthy: 0, Warning: 0, Critical: 0, Unknown: 0 };
  for (const r of monitored) {
    if (r.status === 'active') healthCounts.Healthy++;
    else if (r.status === 'stopped') healthCounts.Warning++;
    else if (r.status === 'terminated' || r.status === 'deleted') healthCounts.Critical++;
    else healthCounts.Unknown++;
  }

  const perServiceCounts = MONITORED_TYPES.map(t => ({ type: t, count: monitored.filter(m => m.resourceTypeKey === t).length }));

  const metricsByResourceId = new Map<string, ResourceMetric[]>();
  for (const m of metrics) {
    const list = metricsByResourceId.get(m.resource_id);
    if (list) list.push(m); else metricsByResourceId.set(m.resource_id, [m]);
  }

  interface LiveMetricRow { resource: CloudResource; metric: ResourceMetric | null }
  const liveMetricRows: LiveMetricRow[] = monitored
    .filter(r => PRIMARY_METRIC[r.resourceTypeKey])
    .map(r => {
      const own = metricsByResourceId.get(r.id) ?? [];
      const primary = own.find(m => m.metric_name === PRIMARY_METRIC[r.resourceTypeKey]) ?? own[0] ?? null;
      return { resource: r, metric: primary };
    });

  const alarmColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Alarm', render: a => a.resourceName ?? a.resourceId, sortValue: a => a.resourceName ?? '' },
    { key: 'state', header: 'State', render: a => <Badge tone={alarmState(a) === 'ALARM' ? 'critical' : alarmState(a) === 'OK' ? 'good' : 'neutral'}>{alarmState(a)}</Badge>, sortValue: a => alarmState(a) },
    { key: 'metric', header: 'Metric', render: a => (a.metadata?.metricName as string) ?? '—' },
    { key: 'namespace', header: 'Namespace', render: a => (a.metadata?.namespace as string) ?? '—' },
    { key: 'region', header: 'Region', render: a => a.region ?? 'global', sortValue: a => a.region ?? '' },
  ];

  const liveMetricColumns: Column<LiveMetricRow>[] = [
    { key: 'name', header: 'Resource', render: row => row.resource.resourceName ?? row.resource.resourceId, sortValue: row => row.resource.resourceName ?? '' },
    { key: 'type', header: 'Type', render: row => row.resource.resourceTypeKey.replace(/_/g, ' '), sortValue: row => row.resource.resourceTypeKey },
    { key: 'region', header: 'Region', render: row => row.resource.region ?? '—', sortValue: row => row.resource.region ?? '' },
    { key: 'metric', header: 'Metric', render: row => row.metric?.metric_name ?? '—' },
    {
      key: 'value', header: 'Latest value',
      render: row => row.metric ? formatMetricValue(row.metric.metric_name, row.metric.value) : <span className="text-slate-400">no data yet</span>,
      sortValue: row => row.metric?.value ?? -1,
    },
    { key: 'updated', header: 'Updated', render: row => row.metric ? timeAgo(row.metric.ts) : '—' },
  ];

  return (
    <div>
      <FilterBar title="Monitoring" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Monitored Resources" value={String(monitored.length)} />
        <StatCard label="CloudWatch Alarms" value={String(alarms.length)} />
        <StatCard label="Alarms in ALARM state" value={String(byAlarmState['ALARM'] ?? 0)} />
        <StatCard label="Healthy Resources" value={String(healthCounts.Healthy)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Health</h3>
          <Donut data={Object.entries(healthCounts).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value }))} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:col-span-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Monitored Resources by Service</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {perServiceCounts.map(({ type, count }) => (
              <li key={type} className="flex justify-between border-b border-slate-100 dark:border-slate-800 py-1.5">
                <span className="text-slate-600 dark:text-slate-300">{type.replace(/_/g, ' ')}</span>
                <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Live Metrics</h3>
        <p className="text-xs text-slate-400 mb-3">CPU, network, invocations and volume I/O, pulled automatically from CloudWatch on every sync — no manual setup per server. Click a row for the full time series.</p>
        <DataTable
          columns={liveMetricColumns}
          rows={liveMetricRows}
          rowKey={row => row.resource.id}
          onRowClick={row => setDrawerResource(row.resource)}
          emptyMessage="No CloudWatch metrics collected yet — these populate automatically on the next sync of an EC2, RDS, Lambda, or EBS resource."
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">CloudWatch Alarms</h3>
        <DataTable columns={alarmColumns} rows={alarms} rowKey={a => a.id} emptyMessage="No CloudWatch alarms discovered yet." />
      </div>

      <Drawer open={!!drawerResource} onClose={() => setDrawerResource(null)} title={drawerResource?.resourceName ?? drawerResource?.resourceId ?? ''}>
        {drawerResource && (
          <div>
            <p className="text-xs text-slate-400 mb-3">{drawerResource.resourceTypeKey.replace(/_/g, ' ')} · {drawerResource.region ?? 'global'}</p>
            {metricNames.length > 1 && (
              <select
                value={selectedMetric}
                onChange={e => setSelectedMetric(e.target.value)}
                className="mb-4 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
              >
                {metricNames.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
            {seriesLoading && <p className="text-sm text-slate-400">Loading…</p>}
            {!seriesLoading && seriesPoints.length === 0 && <p className="text-sm text-slate-400">No datapoints in the last 6 hours yet.</p>}
            {!seriesLoading && seriesPoints.length > 0 && (
              <LineChart
                series={[{
                  label: `${selectedMetric}${seriesUnit ? ` (${seriesUnit})` : ''}`,
                  points: seriesPoints.map(p => ({ x: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), y: p.value })),
                }]}
                valueFormatter={v => formatMetricValue(selectedMetric, v)}
              />
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
