import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useFilters } from '../lib/filterContext';
import { api, type CloudResource } from '../lib/api';

const MONITORED_TYPES = ['ec2_instance', 'rds_instance', 'rds_cluster', 'lambda_function', 'eks_cluster', 'ecs_service', 'elasticache_cluster'];

export function Monitoring() {
  const { account, refreshToken } = useFilters();
  const [alarms, setAlarms] = useState<CloudResource[]>([]);
  const [monitored, setMonitored] = useState<CloudResource[]>([]);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [alarmRes, ...monitoredRes] = await Promise.all([
      api.getResources({ resourceTypeKey: 'cloudwatch_alarm', connectionId, limit: 500 }),
      ...MONITORED_TYPES.map(t => api.getResources({ resourceTypeKey: t, connectionId, limit: 500 })),
    ]);
    setAlarms(alarmRes.resources);
    setMonitored(monitoredRes.flatMap(r => r.resources));
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

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

  const alarmColumns: Column<CloudResource>[] = [
    { key: 'name', header: 'Alarm', render: a => a.resourceName ?? a.resourceId, sortValue: a => a.resourceName ?? '' },
    { key: 'state', header: 'State', render: a => <Badge tone={alarmState(a) === 'ALARM' ? 'critical' : alarmState(a) === 'OK' ? 'good' : 'neutral'}>{alarmState(a)}</Badge>, sortValue: a => alarmState(a) },
    { key: 'metric', header: 'Metric', render: a => (a.metadata?.metricName as string) ?? '—' },
    { key: 'namespace', header: 'Namespace', render: a => (a.metadata?.namespace as string) ?? '—' },
    { key: 'region', header: 'Region', render: a => a.region ?? 'global', sortValue: a => a.region ?? '' },
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">CloudWatch Alarms</h3>
        <DataTable columns={alarmColumns} rows={alarms} rowKey={a => a.id} emptyMessage="No CloudWatch alarms discovered yet." />
      </div>
      <p className="text-xs text-slate-400 mt-3">CPU/Memory/Network time-series charts require pulling CloudWatch metric datapoints per-resource (not just alarm state) — that live-metrics pull isn't wired up yet; alarm state and resource status above are real.</p>
    </div>
  );
}
