import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Donut } from '../components/charts/Donut';
import { useTabParam } from '../lib/useTabParam';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../lib/toast';
import { api, ApiError, type AzureConnection, type CloudResource } from '../lib/api';

const TABS = ['Overview', 'Resources', 'Cost'] as const;
type Tab = typeof TABS[number];

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/**
 * Three tabs, not AwsAccountDetail.tsx's eight — azure-accounts-api has no
 * permissions/sync-history/recommendations/activity endpoints yet (only
 * accounts + discovery + cost), same "only show what's real" reasoning as
 * GcpProjectDetail.tsx. No remediation actions either: connector-azure has
 * no remediation routes built. The Cost tab is real — Azure Cost Management
 * gives per-service granularity directly, no CUR-equivalent ingestion step
 * needed the way AWS's does.
 */
export function AzureAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncStates, startDiscovery } = useSync();
  const { toast } = useToast();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [connection, setConnection] = useState<AzureConnection | null>(null);
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceCategory, setResourceCategory] = useState('');
  const [resourceRegion, setResourceRegion] = useState('');
  const [resourceStatus, setResourceStatus] = useState('');
  const [accountCost, setAccountCost] = useState<{ monthToDate: number; byService: Record<string, number> } | null>(null);
  const [syncingCost, setSyncingCost] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [conn, resourcesRes] = await Promise.all([
      api.getAzureAccount(id),
      api.getResourceInventory({ connectionId: id, limit: 200 }),
    ]);
    setConnection(conn);
    setResources(resourcesRes.items);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useSyncCompletion(id ? [id] : [], load);

  useEffect(() => {
    if (!id || tab !== 'Cost') return;
    void api.getAzureAccountCost(id).then(setAccountCost);
  }, [tab, id]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of resources) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [resources]);

  const resourceCategories = useMemo(() => Array.from(new Set(resources.map(r => r.category))).sort(), [resources]);
  const resourceRegions = useMemo(() => Array.from(new Set(resources.map(r => r.region).filter((r): r is string => !!r))).sort(), [resources]);
  const resourceStatuses = useMemo(() => Array.from(new Set(resources.map(r => r.status))).sort(), [resources]);
  const filteredResources = useMemo(() => resources.filter(r => {
    if (resourceCategory && r.category !== resourceCategory) return false;
    if (resourceRegion && r.region !== resourceRegion) return false;
    if (resourceStatus && r.status !== resourceStatus) return false;
    if (resourceSearch) {
      const q = resourceSearch.toLowerCase();
      if (!(r.resource_name ?? r.resource_id).toLowerCase().includes(q) && !r.resource_type_key.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [resources, resourceCategory, resourceRegion, resourceStatus, resourceSearch]);

  async function syncCost() {
    if (!id) return;
    setSyncingCost(true);
    try {
      const result = await api.syncAzureAccountCost(id);
      toast(result.synced > 0 ? `Synced ${result.synced} cost line item${result.synced === 1 ? '' : 's'} from Azure` : 'Synced — no cost data found for this subscription this month', 'success');
      setAccountCost(await api.getAzureAccountCost(id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Cost sync failed', 'error');
    } finally {
      setSyncingCost(false);
    }
  }

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
      <FilterBar title={connection.connection_name ?? connection.azure_subscription_id} breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>} showAccountFilter={false} />

      <div className="flex items-center gap-2 mb-4">
        <Badge>{connection.status}</Badge>
        <Badge tone="neutral">{connection.environment}</Badge>
        <span className="text-xs text-slate-400 font-mono">{connection.azure_subscription_id}</span>
        <div className="flex-1" />
        <button onClick={() => id && startDiscovery(id, 'azureAccounts')} disabled={syncing} title="Scans this subscription for VMs, storage accounts, SQL/Cosmos DBs, AKS clusters, networking, Key Vault, and more" className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
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
            <StatCard label="Auth Method" value="Service principal" />
            <StatCard label="Tenant" value={connection.azure_tenant_id} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Breakdown</h3>
            <Donut
              data={Object.entries(connection.resource_summary?.categoryCounts ?? categoryCounts).map(([label, value]) => ({ label, value, colorCategory: label }))}
              centerLabel={{ value: (connection.resource_summary?.totalResources ?? resources.length).toLocaleString(), caption: 'resources' }}
            />
          </div>
        </>
      )}

      {tab === 'Resources' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Search</span>
              <input value={resourceSearch} onChange={e => setResourceSearch(e.target.value)} placeholder="Name or type…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-52" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Category</span>
              <select value={resourceCategory} onChange={e => setResourceCategory(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${resourceCategory ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Categories</option>
                {resourceCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Region</span>
              <select value={resourceRegion} onChange={e => setResourceRegion(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${resourceRegion ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Regions</option>
                {resourceRegions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Status</span>
              <select value={resourceStatus} onChange={e => setResourceStatus(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${resourceStatus ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Statuses</option>
                {resourceStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {(resourceSearch || resourceCategory || resourceRegion || resourceStatus) && (
              <button onClick={() => { setResourceSearch(''); setResourceCategory(''); setResourceRegion(''); setResourceStatus(''); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
            )}
            <span className="text-xs text-slate-400 pb-2 ml-auto">{filteredResources.length.toLocaleString()} of {resources.length.toLocaleString()} loaded</span>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {filteredResources.length === 0 ? (
              <EmptyState
                icon="box"
                title={resources.length === 0 ? 'No resources discovered for this subscription yet' : 'No resources match these filters'}
                description={resources.length === 0 ? 'Run Discover Resources above to scan this subscription.' : undefined}
              />
            ) : (
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
                  {filteredResources.slice(0, 200).map(r => (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.resource_name ?? r.resource_id}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">{r.resource_type_key}</td>
                      <td className="px-3 py-2"><Badge tone="neutral">{r.category}</Badge></td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.region ?? '—'}</td>
                      <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {resources.length >= 200 && (
              <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                <button onClick={() => navigate(`/resources/all?account=${connection.id}`)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">View all resources for this subscription →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Cost' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <button onClick={() => void syncCost()} disabled={syncingCost} title="Pulls real month-to-date cost from Azure Cost Management using this subscription's own credentials" className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-2.5 py-1.5">
              {syncingCost ? 'Syncing…' : 'Sync Cost from Azure'}
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Month to Date</h3>
              <div className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">{accountCost ? money(accountCost.monthToDate) : '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">By Service</h3>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(accountCost?.byService ?? {}).sort(([, a], [, b]) => b - a).map(([service, cost]) => (
                  <li key={service} className="flex justify-between py-1.5 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{service}</span>
                    <span className="text-slate-800 dark:text-slate-100 tabular-nums">{money(cost)}</span>
                  </li>
                ))}
                {(!accountCost || Object.keys(accountCost.byService).length === 0) && <li className="py-1.5 text-sm text-slate-400">No cost data synced yet — click "Sync Cost from Azure" above.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
