import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Donut } from '../components/charts/Donut';
import { useTabParam } from '../lib/useTabParam';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { api, type GcpConnection, type CloudResource } from '../lib/api';

const TABS = ['Overview', 'Resources'] as const;
type Tab = typeof TABS[number];

/**
 * Deliberately two tabs, not a mirror of AwsAccountDetail.tsx's eight — GCP
 * Phase 1 has no cost/permissions/sync-history/activity backend endpoints
 * (see gcp-accounts-api/src/routes — only accounts + discovery exist), so
 * this only shows what's real. The Resources tab reuses the existing
 * provider-agnostic api.getResourceInventory (cloud_resources has no
 * AWS-specific columns), same as AwsAccountDetail.tsx does.
 *
 * All hooks (including the two useMemo below) run unconditionally before
 * the `!connection` early return — see the exact bug this avoids, found
 * and fixed in AwsAccountDetail.tsx this session.
 */
export function GcpProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncStates, startDiscovery } = useSync();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [connection, setConnection] = useState<GcpConnection | null>(null);
  const [resources, setResources] = useState<CloudResource[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const [conn, resourcesRes] = await Promise.all([
      api.getGcpAccount(id),
      api.getResourceInventory({ connectionId: id, limit: 200 }),
    ]);
    setConnection(conn);
    setResources(resourcesRes.items);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useSyncCompletion(id ? [id] : [], load);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of resources) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [resources]);

  if (!connection) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  const sync = id ? syncStates[id] : undefined;
  const syncing = sync?.status === 'running';

  return (
    <div>
      <FilterBar title={connection.connection_name ?? connection.gcp_project_id} breadcrumb={<Link to="/gcp-projects" className="text-xs text-slate-400 hover:underline">← GCP Projects</Link>} showAccountFilter={false} />

      <div className="flex items-center gap-2 mb-4">
        <Badge>{connection.status}</Badge>
        <Badge tone="neutral">{connection.environment}</Badge>
        <span className="text-xs text-slate-400 font-mono">{connection.gcp_project_id}</span>
        <div className="flex-1" />
        <button onClick={() => id && startDiscovery(id, 'gcpAccounts')} disabled={syncing} title="Scans this project for Compute Engine instances, Cloud Storage buckets, Cloud SQL instances, and GKE clusters" className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          {syncing ? 'Working…' : 'Discover Resources'}
        </button>
      </div>
      {sync?.status === 'running' && sync.total > 1 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 -mt-2">Scanning… step {sync.done + 1} of {sync.total} ({sync.stepId})</p>
      )}
      {sync?.status === 'done' && sync.warning && <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 -mt-2">{sync.warning}</p>}
      {sync?.status === 'error' && sync.error && (
        <div className="mb-4 -mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {sync.error}
        </div>
      )}
      {connection.status === 'error' && connection.error_message && (
        <div className="mb-4 -mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {connection.error_message}
        </div>
      )}

      <div className="flex gap-1 text-sm flex-wrap mb-5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Total Resources" value={(connection.resource_summary?.totalResources ?? resources.length).toLocaleString()} />
            <StatCard label="Last Sync" value={connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleDateString() : 'Never'} />
            <StatCard label="Auth Method" value={connection.connection_method === 'service_account_impersonation' ? 'Impersonation' : 'Service account key'} />
            <StatCard label="Default Region" value={connection.default_region} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Breakdown</h3>
            <Donut data={Object.entries(categoryCounts).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(resources.length), caption: 'resources' }} />
          </div>
        </>
      )}

      {tab === 'Resources' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {resources.slice(0, 200).map(r => (
                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.resource_name ?? r.resource_id}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">{r.resource_type_key}</td>
                  <td className="px-3 py-2"><Badge tone="neutral">{r.category}</Badge></td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.region ?? '—'}</td>
                  <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
                </tr>
              ))}
              {resources.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No resources discovered for this project yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
