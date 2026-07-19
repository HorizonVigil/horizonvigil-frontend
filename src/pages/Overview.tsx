import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { BarChart } from '../components/charts/BarChart';
import { useOrg } from '../lib/orgContext';
import { useFilters, dateRangeToDays } from '../lib/filterContext';
import { api, type AuditLogEntry } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function Overview() {
  const { currentOrg, folders, projects } = useOrg();
  const { account, dateRange, refreshToken } = useFilters();
  const [costSummary, setCostSummary] = useState<Awaited<ReturnType<typeof api.getCostSummary>> | null>(null);
  const [resourceStats, setResourceStats] = useState<Awaited<ReturnType<typeof api.getResourceStats>> | null>(null);
  const [connectionCount, setConnectionCount] = useState(0);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    const connectionId = account === 'all' ? undefined : account;
    const [cost, resStats, connections, log] = await Promise.all([
      api.getCostSummary(dateRangeToDays(dateRange), undefined, connectionId),
      api.getResourceStats({ connectionId }),
      api.getConnections(),
      api.getAuditLog(currentOrg.id),
    ]);
    setCostSummary(cost);
    setResourceStats(resStats);
    // "AWS Accounts" is a count of everything connected, independent of the
    // account filter — filtering it down to "1" when one account is
    // selected would misrepresent how many accounts actually exist.
    setConnectionCount(connections.connections.length);
    setAuditLog(log.entries.slice(0, 8));
  }, [currentOrg, dateRange, account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  return (
    <div>
      <FilterBar title="Overview" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="AWS Accounts" value={String(connectionCount)} />
        <StatCard label="Total Resources" value={(resourceStats?.total ?? 0).toLocaleString()} />
        <StatCard label="Cost (MTD)" value={money(costSummary?.mtdCost ?? 0)} />
        <StatCard label="Forecasted Cost" value={money(costSummary?.forecastCost ?? 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:col-span-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost Over Time</h3>
          <LineChart series={[{ label: 'Daily Cost', points: (costSummary?.daily ?? []).map(d => ({ x: d.date, y: d.cost })) }]} valueFormatter={money} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Distribution</h3>
          <Donut data={Object.entries(resourceStats?.byCategory ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(resourceStats?.total ?? 0), caption: 'resources' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Top Services by Cost</h3>
          <BarChart data={(costSummary?.byService ?? []).slice(0, 6).map(s => ({ label: s.service, value: s.cost }))} valueFormatter={money} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Folders & Projects</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {folders.map(f => (
              <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">📁 {f.name}</span>
                <span className="text-xs text-slate-400">{projects.filter(p => p.folderId === f.id).length} projects</span>
              </li>
            ))}
            {projects.filter(p => !p.folderId).map(p => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{p.name}</span>
              </li>
            ))}
            {folders.length === 0 && projects.length === 0 && (
              <li className="py-2 text-sm text-slate-400">No folders or projects yet — set these up under Organization Management.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent Activity</h3>
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {auditLog.map(entry => (
            <li key={entry.id} className="py-2 text-sm flex justify-between">
              <span className="text-slate-700 dark:text-slate-200">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')} <span className="text-slate-400">by {entry.actorEmail ?? 'system'}</span></span>
              <span className="text-xs text-slate-400 shrink-0">{new Date(entry.createdAt).toLocaleString()}</span>
            </li>
          ))}
          {auditLog.length === 0 && <li className="py-2 text-sm text-slate-400">No activity yet.</li>}
        </ul>
        <Link to="/organization" className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-2 inline-block">View full audit log →</Link>
      </div>
    </div>
  );
}
