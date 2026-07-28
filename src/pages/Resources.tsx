import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { WorkspaceBreadcrumb } from '../components/WorkspaceBreadcrumb';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useTheme } from '../lib/theme';
import { categoryColor, categoricalColor, CHROME, STATUS, pick } from '../components/charts/palette';
import { useFilters } from '../lib/filterContext';
import { api, type CloudResource, type ResourceCatalogEntry, type ResourceLifecycleEvent } from '../lib/api';

const CORE_CATEGORIES = ['Compute', 'Storage', 'Database', 'Networking'] as const;

/** Best-effort human label for a catalog `service` key (e.g. "ec2" -> "EC2") —
 * short keys are almost always AWS's own acronym, longer ones get title-cased.
 * Not hand-curated per service; good enough for a breadcrumb/heading, not a
 * claim of authoritative AWS branding. */
export function serviceLabel(service: string): string {
  if (service.length <= 5) return service.toUpperCase();
  return service.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function CategoryIcon({ category, color }: { category: string; color: string }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (category) {
    case 'Compute':
      return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></svg>;
    case 'Storage':
      return <svg {...common}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" /><path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" /></svg>;
    case 'Database':
      return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v14c0 1.66 3.13 3 7 3s7-1.34 7-3V5" /></svg>;
    case 'Networking':
      return <svg {...common}><circle cx="5" cy="6" r="2.2" /><circle cx="19" cy="6" r="2.2" /><circle cx="12" cy="18" r="2.2" /><path d="M6.8 7.4 10.5 16.2M17.2 7.4 13.5 16.2" /></svg>;
    default:
      return <svg {...common}><circle cx="6" cy="12" r="1.6" fill={color} stroke="none" /><circle cx="12" cy="12" r="1.6" fill={color} stroke="none" /><circle cx="18" cy="12" r="1.6" fill={color} stroke="none" /></svg>;
  }
}

function CategoryStatCard({ label, value, percent, category, caption }: { label: string; value: number; percent: number; category: string; caption?: string }) {
  const { theme } = useTheme();
  const color = category === 'Total' ? pick(CHROME.primaryInk, theme === 'dark') : categoryColor(category, theme === 'dark');
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-start justify-between gap-2">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value.toLocaleString()}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{caption ?? `${percent.toFixed(1)}% of total`}</span>
      </div>
      {category !== 'Total' && (
        <span className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}1a` }}>
          <CategoryIcon category={category} color={color} />
        </span>
      )}
    </div>
  );
}

/** Ranked magnitude list with a thin progress bar per row — same accent for every bar (dataviz: color follows the entity's identity elsewhere; here rank/length alone carries the meaning). */
function RankedList({ rows, emptyMessage }: { rows: { label: string; value: number }[]; emptyMessage: string }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const barColor = categoricalColor(0, isDark);
  const trackColor = pick(CHROME.gridline, isDark);
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const max = Math.max(1, ...rows.map(r => r.value));
  if (rows.length === 0) return <p className="text-sm text-slate-400 py-6 text-center">{emptyMessage}</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className="border-b last:border-0 border-slate-100 dark:border-slate-800/60">
            <td className="py-2 pr-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.label}</td>
            <td className="py-2 pr-3 w-full">
              <div className="h-1.5 rounded-full" style={{ backgroundColor: trackColor }}>
                <div className="h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: barColor }} />
              </div>
            </td>
            <td className="py-2 pr-2 text-right tabular-nums text-slate-800 dark:text-slate-100 font-medium whitespace-nowrap">{r.value.toLocaleString()}</td>
            <td className="py-2 text-right tabular-nums text-slate-400 dark:text-slate-500 whitespace-nowrap">{((r.value / total) * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const HEALTH_ICONS: Record<string, { tone: keyof typeof STATUS | 'neutral'; icon: React.ReactNode }> = {
  Healthy: { tone: 'good', icon: <path d="M5 13l4 4L19 7" /> },
  Warning: { tone: 'warning', icon: <path d="M12 9v4m0 4h.01M10.3 3.9 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /> },
  Critical: { tone: 'critical', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></> },
  Unknown: { tone: 'neutral', icon: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2 1.8-2 3.5m0 3h.01" /></> },
};

function HealthRow({ label, count, percent }: { label: string; count: number; percent: number }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const entry = HEALTH_ICONS[label];
  const color = entry.tone === 'neutral' ? pick(CHROME.mutedInk, isDark) : pick(STATUS[entry.tone], isDark);
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 border-slate-100 dark:border-slate-800/60">
      <div className="flex items-center gap-2.5">
        <span className="h-7 w-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a` }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{entry.icon}</svg>
        </span>
        <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{count}</span>
        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums w-12 text-right">{percent.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function timeAgo(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / (60 * 24))}d ago`;
}

export function Resources() {
  // Account + Region live in the global FilterBar (top of every page) —
  // see filterContext.tsx. Category/Service/Status/Search stay local since
  // they're specific to this page's data shape.
  const { region, account, setAccount, connections, refreshToken } = useFilters();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [searchParams] = useSearchParams();
  const routeParams = useParams<{ category?: string; service?: string }>();
  // Reached two ways: /resources/all (every filter free, the "view everything"
  // fallback) or /resources/:category/:service (a service workspace, drilled
  // down from ResourcesOverview/ResourcesCategory — category+service are then
  // fixed by the URL, not user-editable dropdowns).
  const presetCategory = routeParams.category && routeParams.category !== 'all' ? routeParams.category : '';
  const presetService = routeParams.service ?? '';
  const isWorkspaceView = !!presetCategory;
  const [resources, setResources] = useState<CloudResource[]>([]);
  // Org-wide aggregate — the new resources-api only exposes unfiltered totals
  // (no per-filter aggregate endpoint), so these stat cards/charts reflect
  // the whole org, not the local category/service/search filters below.
  const [dashboard, setDashboard] = useState<{ total: number; byCategory: Record<string, number>; byStatus: Record<string, number>; byRegion: Record<string, number>; trend30d: { date: string; created: number; deleted: number }[] } | null>(null);
  // Flattened from getResourceExplorer() — exact, org-wide per-service counts.
  const [explorerServices, setExplorerServices] = useState<Record<string, number>>({});
  const [catalog, setCatalog] = useState<ResourceCatalogEntry[]>([]);
  const [recentEvents, setRecentEvents] = useState<ResourceLifecycleEvent[]>([]);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [service, setService] = useState('');
  const [selected, setSelected] = useState<CloudResource | null>(null);
  const [loading, setLoading] = useState(true);

  // ?account=<id> (e.g. "View all resources for this account" on the account
  // detail page) sets the *global* account filter once on arrival, so it's
  // reflected consistently in the top bar rather than a page-local override.
  const appliedUrlAccount = useRef(false);
  useEffect(() => {
    if (appliedUrlAccount.current) return;
    appliedUrlAccount.current = true;
    const fromUrl = searchParams.get('account');
    if (fromUrl) setAccount(fromUrl);
  }, [searchParams, setAccount]);

  // Only re-syncs when the URL's category/service actually changes (i.e. real
  // navigation between workspaces) — on /resources/all, presetCategory/
  // presetService never change, so this never fights a manual dropdown pick.
  useEffect(() => {
    setCategory(presetCategory);
    setService(presetService);
  }, [presetCategory, presetService]);

  // Guards against an older, slower load() call overwriting a newer one's
  // state if filters change again before the first request resolves —
  // without this, a stale response can land last and silently revert the
  // cards/table to an out-of-date filter's data.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setLoading(true);
    try {
      const filters = {
        category: category || undefined, status: status || undefined,
        region: region === 'all' ? undefined : region, search: search || undefined,
        service: service || undefined, connectionId: account === 'all' ? undefined : account,
      };
      // Generous limit so DataTable can page through this client-side, like before.
      const inventory = await api.getResourceInventory({ ...filters, limit: 200 });
      if (thisRequest !== requestId.current) return; // a newer request already landed
      setResources(inventory.items);
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }, [category, status, region, search, service, account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const loadGlobal = useCallback(async () => {
    const [dash, explorer] = await Promise.all([api.getResourcesDashboard(), api.getResourceExplorer()]);
    setDashboard(dash);
    const svc: Record<string, number> = {};
    for (const cat of explorer.categories) for (const s of cat.services) svc[s.service] = (svc[s.service] ?? 0) + s.count;
    setExplorerServices(svc);
  }, []);
  useEffect(() => { void loadGlobal(); }, [loadGlobal, refreshToken]);

  useEffect(() => { void api.getResourceCatalog().then(r => setCatalog(r.items)); }, []);

  // The timeline endpoint doesn't take a connectionId filter, so pull a wider
  // window and filter client-side when a specific account is selected.
  const loadEvents = useCallback(async () => {
    const timeline = await api.getResourceTimeline({ limit: 100 });
    const filtered = account === 'all' ? timeline.items : timeline.items.filter(e => e.connection_id === account);
    setRecentEvents(filtered.slice(0, 20));
  }, [account]);
  useEffect(() => { void loadEvents(); }, [loadEvents, refreshToken]);

  const catalogByKey = useMemo(() => new Map(catalog.map(c => [c.key, c])), [catalog]);
  const liveTypes = catalog.filter(c => c.scanner_status === 'live').length;
  // A service with zero live-scanned types will always return 0 rows if
  // selected — surfaced as disabled + labeled rather than left to look like
  // an unexplained empty result once picked.
  const serviceOptions = useMemo(() => {
    const liveServices = new Set(catalog.filter(c => c.scanner_status === 'live').map(c => c.service));
    return [...new Set(catalog.map(c => c.service))].sort().map(s => ({ service: s, live: liveServices.has(s) }));
  }, [catalog]);
  const accountLabel = useCallback((connectionId: string) => {
    const c = connections.find(c => c.id === connectionId);
    return c ? (c.connection_name ?? c.aws_account_id) : connectionId;
  }, [connections]);

  const total = dashboard?.total ?? 0;
  const coreCounts = CORE_CATEGORIES.map(c => ({ category: c, count: dashboard?.byCategory[c] ?? 0 }));
  const othersCount = Math.max(0, total - coreCounts.reduce((s, c) => s + c.count, 0));

  const healthCounts = useMemo(() => {
    const counts = { Healthy: 0, Warning: 0, Critical: 0, Unknown: 0 };
    for (const r of resources) {
      if (r.status === 'active') counts.Healthy++;
      else if (r.status === 'stopped') counts.Warning++;
      else if (r.status === 'terminated' || r.status === 'deleted') counts.Critical++;
      else counts.Unknown++;
    }
    return counts;
  }, [resources]);
  const healthTotal = Object.values(healthCounts).reduce((s, v) => s + v, 0) || 1;

  const topServices = Object.entries(explorerServices).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  // No org-wide by-resource-type aggregate exists in the new API — derived
  // from the currently loaded (filtered, up to 200) resource rows, same
  // sampling approach already used for Resource Health below.
  const topResourceTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of resources) {
      const label = catalogByKey.get(r.resource_type_key)?.display_name ?? r.resource_type_key;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [resources, catalogByKey]);

  const trend = dashboard?.trend30d ?? [];
  const trendAdded = trend.reduce((s, p) => s + p.created, 0);
  const trendDeleted = trend.reduce((s, p) => s + p.deleted, 0);

  const columns: Column<CloudResource>[] = [
    { key: 'displayName', header: 'Service', render: r => catalogByKey.get(r.resource_type_key)?.display_name ?? r.resource_type_key, sortValue: r => catalogByKey.get(r.resource_type_key)?.display_name ?? r.resource_type_key },
    { key: 'account', header: 'Account', render: r => <span className="text-xs">{accountLabel(r.connection_id)}</span>, sortValue: r => accountLabel(r.connection_id) },
    { key: 'resourceId', header: 'Resource ID', render: r => <span className="font-mono text-xs">{r.resource_id.length > 40 ? `${r.resource_id.slice(0, 37)}…` : r.resource_id}</span>, sortValue: r => r.resource_id },
    { key: 'resourceName', header: 'Name / Tag', render: r => r.resource_name ?? r.tags?.Name ?? '—', sortValue: r => r.resource_name ?? '' },
    { key: 'region', header: 'Region', render: r => r.region ?? 'global', sortValue: r => r.region ?? '' },
    { key: 'category', header: 'Category', render: r => r.category, sortValue: r => r.category },
    { key: 'status', header: 'Status', render: r => <Badge>{r.status}</Badge>, sortValue: r => r.status },
    { key: 'isDefault', header: 'Default', render: r => r.is_default ? <Badge tone="neutral">Default</Badge> : '—', sortValue: r => (r.is_default ? 1 : 0) },
    { key: 'firstSeenAt', header: 'First Seen', render: r => new Date(r.first_seen_at).toLocaleDateString(), sortValue: r => r.first_seen_at },
  ];

  const eventColumns: Column<ResourceLifecycleEvent>[] = [
    { key: 'resource', header: 'Resource', render: e => <span><span className="font-medium text-slate-700 dark:text-slate-200">{catalogByKey.get(e.resource_type_key)?.display_name ?? e.resource_type_key}</span> <span className="font-mono text-xs text-slate-400">{e.aws_resource_id.length > 28 ? `${e.aws_resource_id.slice(0, 25)}…` : e.aws_resource_id}</span></span> },
    { key: 'account', header: 'Account', render: e => <span className="text-xs">{accountLabel(e.connection_id)}</span>, sortValue: e => accountLabel(e.connection_id) },
    { key: 'action', header: 'Action', render: e => <Badge tone={e.event_type === 'created' ? 'good' : 'critical'}>{e.event_type === 'created' ? 'Created' : 'Deleted'}</Badge>, sortValue: e => e.event_type },
    { key: 'time', header: 'Time', render: e => timeAgo(e.occurred_at), sortValue: e => e.occurred_at },
  ];

  const workspaceCrumb = isWorkspaceView
    ? <WorkspaceBreadcrumb items={[{ label: 'Resources', to: '/resources' }, { label: presetCategory, to: `/resources/${presetCategory}` }, { label: serviceLabel(presetService) }]} />
    : <Breadcrumb />;

  return (
    <div>
      <FilterBar title={isWorkspaceView ? serviceLabel(presetService) : 'Resources'} breadcrumb={workspaceCrumb} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <CategoryStatCard label="Total Resources" value={total} percent={100} category="Total" caption={`${liveTypes} of ${catalog.length || 241} types live`} />
        {coreCounts.map(c => (
          <CategoryStatCard key={c.category} label={c.category} value={c.count} percent={total ? (c.count / total) * 100 : 0} category={c.category} />
        ))}
        <CategoryStatCard label="Others" value={othersCount} percent={total ? (othersCount / total) * 100 : 0} category="Others" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources by Service Category</h3>
          <Donut data={Object.entries(dashboard?.byCategory ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(total), caption: 'resources' }} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources Trend (30d)</h3>
          <LineChart height={180} series={[
            { label: 'Created', points: trend.map(p => ({ x: p.date, y: p.created })) },
            { label: 'Deleted', points: trend.map(p => ({ x: p.date, y: p.deleted })) },
          ]} />
          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <div><div className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100">{total.toLocaleString()}</div><div className="text-[11px] text-slate-400">Total</div></div>
            <div><div className="text-base font-semibold tabular-nums" style={{ color: pick(STATUS.good, isDark) }}>+{trendAdded}</div><div className="text-[11px] text-slate-400">Added</div></div>
            <div><div className="text-base font-semibold tabular-nums" style={{ color: pick(STATUS.critical, isDark) }}>-{trendDeleted}</div><div className="text-[11px] text-slate-400">Deleted</div></div>
            <div><div className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100">{trendAdded - trendDeleted >= 0 ? '+' : ''}{trendAdded - trendDeleted}</div><div className="text-[11px] text-slate-400">Net Change</div></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources by Region</h3>
          <Donut data={Object.entries(dashboard?.byRegion ?? {}).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))} centerLabel={{ value: String(total), caption: 'resources' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Top Services by Resource Count</h3>
          <RankedList rows={topServices} emptyMessage="No resources discovered yet." />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Distribution by Type</h3>
          <RankedList rows={topResourceTypes} emptyMessage="No resources discovered yet." />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Health</h3>
          {(Object.keys(healthCounts) as (keyof typeof healthCounts)[]).map(k => (
            <HealthRow key={k} label={k} count={healthCounts[k]} percent={(healthCounts[k] / healthTotal) * 100} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent Resource Changes</h3>
        <DataTable columns={eventColumns} rows={recentEvents} rowKey={e => `${e.aws_resource_id}:${e.event_type}:${e.occurred_at}`} emptyMessage="No resource changes recorded yet." />
      </div>

      <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">{isWorkspaceView ? `${serviceLabel(presetService)} Resources` : 'All Resources'}</h3>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Search</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or ID…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-56" />
        </label>
        {!isWorkspaceView && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Category</span>
              <select value={category} onChange={e => setCategory(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 ${category ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Categories</option>
                {['Compute', 'Storage', 'Database', 'Networking', 'Security', 'Containers', 'Analytics', 'Management', 'Others'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Service</span>
              <select value={service} onChange={e => setService(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 ${service ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Services</option>
                {serviceOptions.map(s => <option key={s.service} value={s.service} disabled={!s.live}>{s.service}{!s.live ? ' (coming soon)' : ''}</option>)}
              </select>
            </label>
          </>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Status</span>
          <select value={status} onChange={e => setStatus(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 ${status ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
            <option value="">All Statuses</option>
            {['active', 'stopped', 'terminated', 'deleted', 'unknown'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {(status || search || (!isWorkspaceView && (category || service))) && (
          <button onClick={() => { setStatus(''); setSearch(''); if (!isWorkspaceView) { setCategory(''); setService(''); } }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
        )}
        {loading && <span className="text-xs text-slate-400 pb-2">Loading…</span>}
      </div>

      <DataTable columns={columns} rows={resources} rowKey={r => r.id} onRowClick={setSelected} emptyMessage="No resources discovered yet — connect an AWS account and run a sync from AWS Accounts." />

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.resource_name ?? selected?.resource_id ?? ''}>
        {selected && (
          <div className="flex flex-col gap-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">{catalogByKey.get(selected.resource_type_key)?.display_name ?? selected.resource_type_key}</Field>
              <Field label="Category">{selected.category}</Field>
              <Field label="Region">{selected.region ?? 'global'}</Field>
              <Field label="Status"><Badge>{selected.status}</Badge></Field>
              <Field label="Account">{accountLabel(selected.connection_id)}</Field>
              <Field label="Default">{selected.is_default ? 'Yes' : 'No'}</Field>
              <Field label="First Seen">{new Date(selected.first_seen_at).toLocaleString()}</Field>
              <Field label="Last Seen">{new Date(selected.last_seen_at).toLocaleString()}</Field>
            </div>
            <div>
              <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Cost</h4>
              {selected.cost_monthly !== null ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">${selected.cost_monthly.toLocaleString(undefined, { maximumFractionDigits: 2 })} / month (estimated)</p>
              ) : (
                <p className="text-xs text-slate-400">No cost data available for this resource yet. Per-resource cost trend charts require Monitoring, which isn't part of this domain.</p>
              )}
            </div>
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
