import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { BarChart } from '../components/charts/BarChart';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { api, type CloudResource, type ResourceCatalogEntry, type CloudConnection } from '../lib/api';

export function Resources() {
  const { region, refreshToken } = useFilters();
  const [searchParams, setSearchParams] = useSearchParams();
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [stats, setStats] = useState<{ total: number; byCategory: Record<string, number>; byRegion: Record<string, number>; defaultCount: number } | null>(null);
  const [trend, setTrend] = useState<{ date: string; created: number; deleted: number; net: number }[]>([]);
  const [catalog, setCatalog] = useState<ResourceCatalogEntry[]>([]);
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  // Pre-populated from ?account=<id>, e.g. the "View all resources for this
  // account" link on the account detail page — without this the page always
  // showed every connected account's resources merged together with no way
  // to scope down to one.
  const [account, setAccount] = useState(searchParams.get('account') ?? '');
  const [selected, setSelected] = useState<CloudResource | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        category: category || undefined, status: status || undefined,
        region: region === 'all' ? undefined : region, search: search || undefined,
        service: service || undefined, connectionId: account || undefined,
      };
      const [resourcesRes, statsRes, trendRes] = await Promise.all([
        api.getResources({ ...filters, limit: 500 }),
        api.getResourceStats(filters),
        api.getResourceTrend(30, filters),
      ]);
      setResources(resourcesRes.resources);
      setStats(statsRes);
      setTrend(trendRes.points);
    } finally {
      setLoading(false);
    }
  }, [category, status, region, search, service, account]);

  useEffect(() => { void load(); }, [load, refreshToken]);
  useEffect(() => { void api.getResourceCatalog().then(r => setCatalog(r.catalog)); }, []);
  useEffect(() => { void api.getConnections().then(r => setConnections(r.connections)); }, []);

  // Keep the URL in sync so the account filter survives a refresh/share, but
  // don't fight the user typing into other filters.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (account) next.set('account', account); else next.delete('account');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const liveTypes = catalog.filter(c => c.scannerStatus === 'live').length;
  const serviceOptions = useMemo(() => [...new Set(catalog.map(c => c.service))].sort(), [catalog]);
  const accountLabel = useCallback((connectionId: string) => {
    const c = connections.find(c => c.id === connectionId);
    return c ? (c.connectionName ?? c.awsAccountId) : connectionId;
  }, [connections]);

  const columns: Column<CloudResource>[] = [
    { key: 'displayName', header: 'Service', render: r => r.displayName, sortValue: r => r.displayName },
    { key: 'account', header: 'Account', render: r => <span className="text-xs">{accountLabel(r.connectionId)}</span>, sortValue: r => accountLabel(r.connectionId) },
    { key: 'resourceId', header: 'Resource ID', render: r => <span className="font-mono text-xs">{r.resourceId.length > 40 ? `${r.resourceId.slice(0, 37)}…` : r.resourceId}</span>, sortValue: r => r.resourceId },
    { key: 'resourceName', header: 'Name / Tag', render: r => r.resourceName ?? r.tags?.Name ?? '—', sortValue: r => r.resourceName ?? '' },
    { key: 'region', header: 'Region', render: r => r.region ?? 'global', sortValue: r => r.region ?? '' },
    { key: 'category', header: 'Category', render: r => r.category, sortValue: r => r.category },
    { key: 'status', header: 'Status', render: r => <Badge>{r.status}</Badge>, sortValue: r => r.status },
    { key: 'isDefault', header: 'Default', render: r => r.isDefault ? <Badge tone="neutral">Default</Badge> : '—', sortValue: r => (r.isDefault ? 1 : 0) },
    { key: 'firstSeenAt', header: 'First Seen', render: r => new Date(r.firstSeenAt).toLocaleDateString(), sortValue: r => r.firstSeenAt },
  ];

  return (
    <div>
      <FilterBar title="Resources" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Resources" value={(stats?.total ?? 0).toLocaleString()} caption={`${catalog.length || 241} types catalogued`} />
        <StatCard label="Live-Scanned Types" value={String(liveTypes)} caption={`of ${catalog.length || 241} in taxonomy`} />
        <StatCard label="Default Resources" value={(stats?.defaultCount ?? 0).toLocaleString()} caption="AWS-created, not hidden" />
        <StatCard label="Regions With Resources" value={String(Object.keys(stats?.byRegion ?? {}).length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Distribution by Category</h3>
          <Donut data={Object.entries(stats?.byCategory ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(stats?.total ?? 0), caption: 'resources' }} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:col-span-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources Trend — Added / Deleted (30d)</h3>
          <LineChart series={[
            { label: 'Created', points: trend.map(p => ({ x: p.date, y: p.created })) },
            { label: 'Deleted', points: trend.map(p => ({ x: p.date, y: p.deleted })) },
          ]} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources by Region</h3>
        <BarChart data={Object.entries(stats?.byRegion ?? {}).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-56" />
        <select value={account} onChange={e => setAccount(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200">
          <option value="">All Accounts</option>
          {connections.map(c => <option key={c.id} value={c.id}>{c.connectionName ?? c.awsAccountId}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200">
          <option value="">All Categories</option>
          {['Compute', 'Storage', 'Database', 'Networking', 'Security', 'Containers', 'Analytics', 'Management', 'Others'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={service} onChange={e => setService(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200">
          <option value="">All Services</option>
          {serviceOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200">
          <option value="">All Statuses</option>
          {['active', 'stopped', 'terminated', 'deleted', 'unknown'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(account || category || service || status || search) && (
          <button onClick={() => { setAccount(''); setCategory(''); setService(''); setStatus(''); setSearch(''); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline">Clear filters</button>
        )}
        {loading && <span className="text-xs text-slate-400">Loading…</span>}
      </div>

      <DataTable columns={columns} rows={resources} rowKey={r => r.id} onRowClick={setSelected} emptyMessage="No resources discovered yet — connect an AWS account and run a sync from AWS Accounts." />

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.resourceName ?? selected?.resourceId ?? ''}>
        {selected && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">{selected.displayName}</Field>
              <Field label="Category">{selected.category}</Field>
              <Field label="Region">{selected.region ?? 'global'}</Field>
              <Field label="Status"><Badge>{selected.status}</Badge></Field>
              <Field label="Account">{accountLabel(selected.connectionId)}</Field>
              <Field label="Default">{selected.isDefault ? 'Yes' : 'No'}</Field>
              <Field label="First Seen">{new Date(selected.firstSeenAt).toLocaleString()}</Field>
              <Field label="Last Seen">{new Date(selected.lastSeenAt).toLocaleString()}</Field>
            </div>
            {selected.consoleUrl && (
              <a href={selected.consoleUrl} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline text-xs">Open in AWS Console ↗</a>
            )}
            {Object.keys(selected.tags ?? {}).length > 0 && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(selected.tags).map(([k, v]) => <span key={k} className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300">{k}={v}</span>)}
                </div>
              </div>
            )}
            {Object.keys(selected.relationships ?? {}).length > 0 && (
              <div>
                <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Relationships</h4>
                <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(selected.relationships, null, 2)}</pre>
              </div>
            )}
            <div>
              <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Raw Metadata</h4>
              <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400 dark:text-slate-500">{label}</div>
      <div className="text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  );
}
