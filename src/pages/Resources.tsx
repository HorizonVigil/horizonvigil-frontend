import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useParams, useLocation } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { WorkspaceBreadcrumb } from '../components/WorkspaceBreadcrumb';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { Modal } from '../components/Modal';
import { useTheme } from '../lib/theme';
import { categoryColor, categoricalColor, CHROME, STATUS, pick } from '../components/charts/palette';
import { useTabParam } from '../lib/useTabParam';
import { useFilters } from '../lib/filterContext';
import { useResourcesUrlFilters } from '../lib/useResourcesUrlFilters';
import { api, type CloudResource, type ResourceCatalogEntry, type ResourceLifecycleEvent } from '../lib/api';

const CORE_CATEGORIES = ['Compute', 'Storage', 'Database', 'Networking'] as const;
const TABS = ['All Resources', 'Global Search', 'Resource Relationships', 'Tags Explorer', 'Resource Timeline'] as const;
type Tab = typeof TABS[number];

/** Best-effort human label for a catalog `service` key (e.g. "ec2" -> "EC2") —
 * short keys are almost always AWS's own acronym, longer ones get title-cased.
 * Not hand-curated per service; good enough for a breadcrumb/heading, not a
 * claim of authoritative AWS branding.
 *
 * `category` is an optional display-only override, not a data-model change:
 * AWS's own DescribeVpcs/DescribeSubnets/etc. are literally EC2 API calls,
 * so the catalog correctly has service='ec2' for VPC networking resources
 * too (and the backend's ?service= filter has to keep using that real
 * value) — but showing a card labeled "EC2" while browsing the Networking
 * category reads as a mistake even though the data is accurate, since
 * "EC2" already means something different (the Compute category's actual
 * instances/AMIs/volumes) one click away. */
export function serviceLabel(service: string, category?: string): string {
  if (service === 'ec2' && category === 'Networking') return 'VPC';
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
  const { region, account, connections, refreshToken } = useFilters();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  useResourcesUrlFilters();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const routeParams = useParams<{ category?: string; service?: string }>();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'All Resources');
  // Reached two ways: /resources/all (every filter free, the "view everything"
  // fallback) or /resources/:category/:service (a service workspace, drilled
  // down from ResourcesOverview/ResourcesCategory — category+service are then
  // fixed by the URL, not user-editable dropdowns).
  const presetCategory = routeParams.category && routeParams.category !== 'all' ? routeParams.category : '';
  const presetService = routeParams.service ?? '';
  const isWorkspaceView = !!presetCategory;
  const [resources, setResources] = useState<CloudResource[]>([]);
  // Exact server-side count for the current filters (category/service/etc.) —
  // `resources.length` alone is capped at the 200-row page limit, so this is
  // what a workspace view's "Total Resources" card uses instead of the
  // global `dashboard.total` (see isWorkspaceView below).
  const [filteredTotal, setFilteredTotal] = useState(0);
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
  const [providerFilter, setProviderFilter] = useState<'all' | 'aws' | 'gcp'>('all');
  const [selected, setSelected] = useState<CloudResource | null>(null);
  const [loading, setLoading] = useState(true);

  // Tags Explorer — now its own tab, fetched when opened.
  const [tagKeys, setTagKeys] = useState<{ key: string; resourceCount: number; sampleValues: string[] }[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);

  // Dependency Graph (opened from the resource Drawer)
  const [graph, setGraph] = useState<{ nodes: { id: string; resourceId: string; label: string | null; resourceTypeKey: string; category: string }[]; edges: { from: string; to: string; relation: string }[]; hops: number } | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // Bulk Operations
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkTagKey, setBulkTagKey] = useState('');
  const [bulkTagValue, setBulkTagValue] = useState('');
  const [bulkOperation, setBulkOperation] = useState<'add_tag' | 'remove_tag'>('add_tag');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  // Global Search — a real cross-category search (api.searchResources), not
  // the Inventory table's own connectionId/category-scoped filter.
  const [globalQuery, setGlobalQuery] = useState('');
  const [globalResults, setGlobalResults] = useState<CloudResource[]>([]);
  const [globalCapped, setGlobalCapped] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  // Resource Relationships — find a resource, then show its real stored
  // relationships (api.getResourceRelationships), replacing the raw JSON
  // dump that used to be the only way to see this in the Drawer.
  const [relQuery, setRelQuery] = useState('');
  const [relResults, setRelResults] = useState<CloudResource[]>([]);
  const [relSelected, setRelSelected] = useState<CloudResource | null>(null);
  const [relData, setRelData] = useState<{ resource: { id: string; resourceId: string; resourceName: string | null }; relationships: unknown } | null>(null);
  const [relLoading, setRelLoading] = useState(false);

  // Resource Timeline — the real filtered endpoint (eventType/from/to),
  // not the 20-item client-sliced "Recent Resource Changes" widget.
  const [timelineEvents, setTimelineEvents] = useState<ResourceLifecycleEvent[]>([]);
  const [timelineEventType, setTimelineEventType] = useState('');
  const [timelineFrom, setTimelineFrom] = useState('');
  const [timelineTo, setTimelineTo] = useState('');
  const [timelineLoading, setTimelineLoading] = useState(false);

  // ?account=<id>/?region=<r> (e.g. "View all resources for this account" on
  // the account detail page, or arriving from ResourcesOverview/Category with
  // filters carried in the URL) are applied to the *global* filter state, and
  // kept in sync back to the URL as they change, by useResourcesUrlFilters()
  // above -- so this stays reflected in the top bar and the address bar stays
  // bookmarkable/shareable rather than silently dropping back to "all".

  // ?search=<term> (ResourcesOverview's landing-page search box navigates
  // here with this param) seeds both the All Resources inventory filter and
  // the Global Search tab's own query box on arrival -- they're separate
  // page-local state (`search` vs `globalQuery`), and a user can land on
  // either tab, so both need the term or one of them shows an empty box
  // with no results despite the URL carrying it correctly.
  const appliedUrlSearch = useRef(false);
  useEffect(() => {
    if (appliedUrlSearch.current) return;
    appliedUrlSearch.current = true;
    const fromUrl = searchParams.get('search');
    if (fromUrl) {
      setSearch(fromUrl);
      setGlobalQuery(fromUrl);
    }
  }, [searchParams]);

  // ?bulk=1 (the sidebar's "Bulk Operations" link) pre-activates bulk select
  // mode on arrival instead of landing on a plain, indistinguishable All
  // Resources view — bulk mode itself is a toggle within this tab, not a
  // separate page.
  const appliedUrlBulk = useRef(false);
  useEffect(() => {
    if (appliedUrlBulk.current) return;
    appliedUrlBulk.current = true;
    if (searchParams.get('bulk') === '1') setBulkMode(true);
  }, [searchParams]);

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
      setFilteredTotal(inventory.pagination.total);
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }, [category, status, region, search, service, account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const loadGlobal = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const scopedRegion = region === 'all' ? undefined : region;
    const [dash, explorer] = await Promise.all([
      api.getResourcesDashboard({ region: scopedRegion, connectionId }),
      api.getResourceExplorer({ connectionId, region: scopedRegion }),
    ]);
    setDashboard(dash);
    const svc: Record<string, number> = {};
    for (const cat of explorer.categories) for (const s of cat.services) svc[s.service] = (svc[s.service] ?? 0) + s.count;
    setExplorerServices(svc);
  }, [region, account]);
  useEffect(() => { void loadGlobal(); }, [loadGlobal, refreshToken]);

  useEffect(() => { void api.getResourceCatalog().then(r => setCatalog(r.items)); }, []);

  const loadEvents = useCallback(async () => {
    const timeline = await api.getResourceTimeline({ limit: 20, connectionId: account === 'all' ? undefined : account });
    setRecentEvents(timeline.items);
  }, [account]);
  useEffect(() => { void loadEvents(); }, [loadEvents, refreshToken]);

  // Tags Explorer tab — fetched when opened, refreshed on external refresh.
  useEffect(() => {
    if (tab !== 'Tags Explorer') return;
    setTagsLoading(true);
    void api.getResourceTags().then(r => setTagKeys(r.keys)).finally(() => setTagsLoading(false));
  }, [tab, refreshToken]);

  // Resource Timeline tab — real filters, loaded on open and whenever they change.
  const loadTimeline = useCallback(async () => {
    if (tab !== 'Resource Timeline') return;
    setTimelineLoading(true);
    try {
      const res = await api.getResourceTimeline({
        eventType: timelineEventType || undefined,
        from: timelineFrom || undefined,
        to: timelineTo || undefined,
        connectionId: account === 'all' ? undefined : account,
        limit: 100,
      });
      setTimelineEvents(res.items);
    } finally {
      setTimelineLoading(false);
    }
  }, [tab, timelineEventType, timelineFrom, timelineTo, account]);
  useEffect(() => { void loadTimeline(); }, [loadTimeline, refreshToken]);

  // Global Search tab — debounced real cross-category search, scoped to the
  // top FilterBar's Account selection like every other tab on this page (it
  // used to ignore that filter entirely, so picking a specific AWS/GCP
  // account and searching still surfaced every other account's resources).
  useEffect(() => {
    if (tab !== 'Global Search' || !globalQuery.trim()) { setGlobalResults([]); return; }
    setGlobalLoading(true);
    const handle = setTimeout(() => {
      void api.searchResources(globalQuery.trim(), account === 'all' ? undefined : account)
        .then(res => { setGlobalResults(res.items); setGlobalCapped(!!res.capped); })
        .finally(() => setGlobalLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [tab, globalQuery, account]);

  // Resource Relationships tab — same debounced search to find a resource,
  // then the real relationships endpoint once one is picked.
  useEffect(() => {
    if (tab !== 'Resource Relationships' || !relQuery.trim()) { setRelResults([]); return; }
    const handle = setTimeout(() => {
      void api.searchResources(relQuery.trim(), account === 'all' ? undefined : account).then(res => setRelResults(res.items));
    }, 300);
    return () => clearTimeout(handle);
  }, [tab, relQuery, account]);

  async function pickRelationshipResource(r: CloudResource) {
    setRelSelected(r);
    setRelData(null);
    setRelLoading(true);
    try {
      const data = await api.getResourceRelationships(r.id);
      setRelData(data);
    } finally {
      setRelLoading(false);
    }
  }

  // Clear any previously-loaded graph when the drawer's target resource changes,
  // so switching resources doesn't briefly show the last one's dependency graph.
  useEffect(() => { setGraph(null); }, [selected?.id]);

  async function loadDependencyGraph(resourceId: string) {
    setGraphLoading(true);
    setGraph(null);
    try {
      const g = await api.getDependencyGraph(resourceId);
      setGraph(g);
    } finally {
      setGraphLoading(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submitBulkOperation(e: React.FormEvent) {
    e.preventDefault();
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = await api.bulkTagResources({
        resourceIds: [...selectedIds],
        operation: bulkOperation,
        tagKey: bulkTagKey.trim(),
        tagValue: bulkOperation === 'add_tag' ? bulkTagValue.trim() : undefined,
      });
      setBulkResult(`Updated ${res.updatedCount} of ${res.requestedCount} selected resources.`);
      setSelectedIds(new Set());
      await load();
    } catch (err) {
      setBulkResult(err instanceof Error ? err.message : 'Bulk operation failed.');
    } finally {
      setBulkBusy(false);
    }
  }

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
    return c ? c.name : connectionId;
  }, [connections]);
  const providerFor = useCallback((connectionId: string): 'aws' | 'gcp' | null => {
    return connections.find(c => c.id === connectionId)?.provider ?? null;
  }, [connections]);

  // Provider-filtered resources — when a provider filter is active, only
  // show resources from connections of that provider. This is the critical
  // fix for the "GCP filter shows AWS resources" bug.
  const providerFilteredResources = useMemo(() => {
    if (providerFilter === 'all') return resources;
    return resources.filter(r => providerFor(r.connection_id) === providerFilter);
  }, [resources, providerFilter, providerFor]);

  // Provider-filtered service options — only show services that have
  // resources for the selected provider.
  const providerServiceOptions = useMemo(() => {
    if (providerFilter === 'all') return serviceOptions;
    // Get the set of services that have resources for this provider
    const providerServices = new Set<string>();
    for (const r of resources) {
      if (providerFor(r.connection_id) === providerFilter) {
        const cat = catalogByKey.get(r.resource_type_key);
        if (cat) providerServices.add(cat.service);
      }
    }
    return serviceOptions.filter(s => providerServices.has(s.service));
  }, [serviceOptions, providerFilter, resources, providerFor, catalogByKey]);

  // Provider-filtered connections — used to pass the right connection IDs
  // to the API when a provider filter is active.
  const providerConnectionIds = useMemo(() => {
    if (providerFilter === 'all') return null;
    return connections.filter(c => c.provider === providerFilter).map(c => c.id);
  }, [connections, providerFilter]);

  // Provider-filtered dashboard data — when a provider filter is active,
  // derive all dashboard aggregates from providerFilteredResources instead
  // of the org-wide dashboard. This ensures charts, KPIs, and donuts only
  // show data for the selected provider.
  const providerDashboardData = useMemo(() => {
    if (providerFilter === 'all') return null;
    const byCategory: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    for (const r of providerFilteredResources) {
      byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
      if (r.region) byRegion[r.region] = (byRegion[r.region] ?? 0) + 1;
    }
    return { total: providerFilteredResources.length, byCategory, byRegion };
  }, [providerFilteredResources, providerFilter]);

  // Top services — org-wide from explorerServices, or provider-filtered
  const topServices = useMemo(() => {
    if (providerFilter !== 'all') {
      const counts: Record<string, number> = {};
      for (const r of providerFilteredResources) {
        const cat = catalogByKey.get(r.resource_type_key);
        if (cat) counts[cat.service] = (counts[cat.service] ?? 0) + 1;
      }
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
    }
    return Object.entries(explorerServices).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  }, [providerFilteredResources, providerFilter, explorerServices, catalogByKey]);

  // Provider-filtered tag keys — derive from providerFilteredResources
  // instead of the org-wide getResourceTags() API call.
  const providerTagKeys = useMemo(() => {
    if (providerFilter === 'all') return tagKeys;
    const tagMap: Record<string, { count: number; values: Set<string> }> = {};
    for (const r of providerFilteredResources) {
      if (!r.tags) continue;
      for (const [k, v] of Object.entries(r.tags)) {
        if (!tagMap[k]) tagMap[k] = { count: 0, values: new Set() };
        tagMap[k].count++;
        if (tagMap[k].values.size < 5) tagMap[k].values.add(String(v));
      }
    }
    return Object.entries(tagMap).map(([key, data]) => ({
      key,
      resourceCount: data.count,
      sampleValues: [...data.values],
    })).sort((a, b) => b.resourceCount - a.resourceCount);
  }, [providerFilteredResources, providerFilter, tagKeys]);

  // Provider-filtered recent events — filter by provider's connection IDs.
  const providerRecentEvents = useMemo(() => {
    if (providerFilter === 'all') return recentEvents;
    return recentEvents.filter(e => providerFor(e.connection_id) === providerFilter);
  }, [recentEvents, providerFilter, providerFor]);

  // dashboard/explorerServices/recentEvents (below) are org-wide aggregates
  // fetched once, unaffected by the URL's category/service filter — fine for
  // /resources/all, but showing them on a workspace page (e.g. /resources/
  // Compute/ec2) made every service's page look identical regardless of
  // which one you were on. Everything under isWorkspaceView instead derives
  // from `resources`/`filteredTotal`, the same filtered data the table below
  // already uses.
  const total = isWorkspaceView ? filteredTotal : (providerDashboardData?.total ?? dashboard?.total ?? 0);
  const activeByCategory = providerDashboardData?.byCategory ?? dashboard?.byCategory ?? {};
  const activeByRegion = providerDashboardData?.byRegion ?? dashboard?.byRegion ?? {};
  const coreCounts = CORE_CATEGORIES.map(c => ({ category: c, count: activeByCategory[c] ?? 0 }));
  const othersCount = Math.max(0, total - coreCounts.reduce((s, c) => s + c.count, 0));

  const healthCounts = useMemo(() => {
    const counts = { Healthy: 0, Warning: 0, Critical: 0, Unknown: 0 };
    for (const r of providerFilteredResources) {
      if (r.status === 'active') counts.Healthy++;
      else if (r.status === 'stopped') counts.Warning++;
      else if (r.status === 'terminated' || r.status === 'deleted') counts.Critical++;
      else counts.Unknown++;
    }
    return counts;
  }, [providerFilteredResources]);
  const healthTotal = Object.values(healthCounts).reduce((s, v) => s + v, 0) || 1;

  // No org-wide by-resource-type aggregate exists in the new API — derived
  // from the currently loaded (filtered, up to 200) resource rows, same
  // sampling approach already used for Resource Health below.
  const topResourceTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of providerFilteredResources) {
      const label = catalogByKey.get(r.resource_type_key)?.display_name ?? r.resource_type_key;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [providerFilteredResources, catalogByKey]);

  // Workspace-view (single category/service) equivalents of the org-wide
  // "Resources by Region" donut and "Recent Resource Changes" list — derived
  // client-side from data already on hand (filtered `resources`, and
  // `recentEvents` narrowed by matching each event's resource type back to
  // this service via the catalog) rather than global, unfiltered fetches.
  const workspaceByRegion = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of resources) if (r.region) counts[r.region] = (counts[r.region] ?? 0) + 1;
    return counts;
  }, [resources]);
  const workspaceRecentEvents = useMemo(() => {
    if (!isWorkspaceView) return recentEvents;
    return recentEvents.filter(e => catalogByKey.get(e.resource_type_key)?.service === presetService).slice(0, 20);
  }, [recentEvents, isWorkspaceView, catalogByKey, presetService]);

  const trend = dashboard?.trend30d ?? [];
  const trendAdded = trend.reduce((s, p) => s + p.created, 0);
  const trendDeleted = trend.reduce((s, p) => s + p.deleted, 0);

  const columns: Column<CloudResource>[] = [
    ...(bulkMode ? [{
      key: 'select', header: '', render: (r: CloudResource) => (
        <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelected(r.id)} onClick={e => e.stopPropagation()} />
      ),
    } as Column<CloudResource>] : []),
    {
      key: 'provider', header: 'Provider',
      render: r => { const p = providerFor(r.connection_id); return p ? <Badge tone="neutral">{p === 'gcp' ? 'GCP' : 'AWS'}</Badge> : '—'; },
      sortValue: r => providerFor(r.connection_id) ?? '',
    },
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

  const searchColumns: Column<CloudResource>[] = [
    { key: 'displayName', header: 'Type', render: r => catalogByKey.get(r.resource_type_key)?.display_name ?? r.resource_type_key },
    { key: 'resourceName', header: 'Name / ID', render: r => r.resource_name ?? r.resource_id },
    { key: 'category', header: 'Category', render: r => r.category },
    { key: 'region', header: 'Region', render: r => r.region ?? 'global' },
    { key: 'status', header: 'Status', render: r => <Badge>{r.status}</Badge> },
  ];

  const workspaceCrumb = isWorkspaceView
    ? <WorkspaceBreadcrumb items={[{ label: 'Resources', to: `/resources${location.search}` }, { label: presetCategory, to: `/resources/${presetCategory}${location.search}` }, { label: serviceLabel(presetService, presetCategory) }]} />
    : <Breadcrumb />;

  return (
    <div>
      <FilterBar title={isWorkspaceView ? serviceLabel(presetService, presetCategory) : 'Resources'} breadcrumb={workspaceCrumb} />

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'All Resources' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <CategoryStatCard
              label="Total Resources" value={total} percent={100} category="Total"
              caption={isWorkspaceView ? `${serviceLabel(presetService, presetCategory)} in this org` : `${liveTypes} of ${catalog.length || 241} types live`}
            />
            {!isWorkspaceView && coreCounts.map(c => (
              <CategoryStatCard key={c.category} label={c.category} value={c.count} percent={total ? (c.count / total) * 100 : 0} category={c.category} />
            ))}
            {!isWorkspaceView && <CategoryStatCard label="Others" value={othersCount} percent={total ? (othersCount / total) * 100 : 0} category="Others" />}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            {!isWorkspaceView && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources by Service Category</h3>
                <Donut data={Object.entries(activeByCategory).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(total), caption: 'resources' }} />
              </div>
            )}
            {!isWorkspaceView && (
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
            )}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resources by Region</h3>
              <Donut
                data={Object.entries(isWorkspaceView ? workspaceByRegion : activeByRegion).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))}
                centerLabel={{ value: String(total), caption: 'resources' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            {!isWorkspaceView && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Top Services by Resource Count</h3>
                <RankedList rows={topServices} emptyMessage="No resources discovered yet." />
              </div>
            )}
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
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent {isWorkspaceView ? serviceLabel(presetService, presetCategory) : ''} Resource Changes</h3>
            <DataTable columns={eventColumns} rows={providerRecentEvents} rowKey={e => `${e.aws_resource_id}:${e.event_type}:${e.occurred_at}`} emptyMessage="No resource changes recorded yet." />
            <p className="text-xs text-slate-400 mt-2">Last 20 changes — for the full filterable history, see the Resource Timeline tab.</p>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">{isWorkspaceView ? `${serviceLabel(presetService, presetCategory)} Resources` : 'All Resources'}</h3>
            <div className="flex items-center gap-2">
              {bulkMode && selectedIds.size > 0 && (
                <button onClick={() => { setBulkResult(null); setBulkModalOpen(true); }} className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">
                  Bulk Tag {selectedIds.size} selected
                </button>
              )}
              <button
                onClick={() => { setBulkMode(m => !m); setSelectedIds(new Set()); }}
                className={`text-xs rounded-md border px-3 py-1.5 ${bulkMode ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                {bulkMode ? 'Exit Bulk Operations' : 'Bulk Operations'}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Cloud Provider</span>
              <select value={providerFilter} onChange={e => setProviderFilter(e.target.value as 'all' | 'aws' | 'gcp')} className={`text-sm rounded-md border px-2 py-1.5 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 ${providerFilter !== 'all' ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="all">All Providers</option>
                <option value="aws">AWS</option>
                <option value="gcp">GCP</option>
              </select>
            </label>
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
                    {providerServiceOptions.map(s => <option key={s.service} value={s.service} disabled={!s.live}>{s.service}{!s.live ? ' (coming soon)' : ''}</option>)}
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
            {(status || search || providerFilter !== 'all' || (!isWorkspaceView && (category || service))) && (
              <button onClick={() => { setStatus(''); setSearch(''); setProviderFilter('all'); if (!isWorkspaceView) { setCategory(''); setService(''); } }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
            )}
            {loading && <span className="text-xs text-slate-400 pb-2">Loading…</span>}
          </div>

          <DataTable columns={columns} rows={providerFilteredResources} rowKey={r => r.id} onRowClick={setSelected} emptyMessage={providerFilter !== 'all' ? `No ${providerFilter === 'gcp' ? 'GCP' : 'AWS'} resources discovered yet. Connect a ${providerFilter === 'gcp' ? 'GCP' : 'AWS'} account and run a sync from Cloud Accounts.` : "No resources discovered yet — connect an AWS or GCP account and run a sync from Cloud Accounts."} />
        </>
      )}

      {tab === 'Global Search' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Global Search</h3>
          <p className="text-xs text-slate-400 mb-3">Searches every discovered resource across all connected accounts and categories at once — not scoped by the filters on All Resources.</p>
          <input value={globalQuery} onChange={e => setGlobalQuery(e.target.value)} placeholder="Search by name, ID, or type…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200 w-full max-w-md mb-3" />
          {globalLoading && <p className="text-sm text-slate-400">Searching…</p>}
          {!globalLoading && globalQuery.trim() && (
            <>
              {globalCapped && <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">Showing the first matches — narrow your search for a complete list.</p>}
              <DataTable columns={searchColumns} rows={globalResults} rowKey={r => r.id} onRowClick={setSelected} emptyMessage="No resources match this search." />
            </>
          )}
          {!globalQuery.trim() && <p className="text-sm text-slate-400">Type to search.</p>}
        </div>
      )}

      {tab === 'Resource Relationships' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Find a Resource</h3>
            <input value={relQuery} onChange={e => setRelQuery(e.target.value)} placeholder="Search by name, ID, or type…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200 w-full mb-3" />
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {relResults.map(r => (
                <li key={r.id}>
                  <button onClick={() => void pickRelationshipResource(r)} className={`w-full text-left py-2 text-sm px-2 rounded-md ${relSelected?.id === r.id ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'}`}>
                    {r.resource_name ?? r.resource_id} <span className="text-xs text-slate-400">{catalogByKey.get(r.resource_type_key)?.display_name ?? r.resource_type_key}</span>
                  </button>
                </li>
              ))}
              {relQuery.trim() && relResults.length === 0 && <li className="py-2 text-sm text-slate-400">No matches.</li>}
              {!relQuery.trim() && <li className="py-2 text-sm text-slate-400">Type to search for a resource.</li>}
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Relationships</h3>
            {relLoading && <p className="text-sm text-slate-400">Loading…</p>}
            {!relLoading && relData && (
              <div className="text-sm">
                <p className="text-slate-600 dark:text-slate-300 mb-2">{relData.resource.resourceName ?? relData.resource.resourceId}</p>
                <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(relData.relationships, null, 2)}</pre>
              </div>
            )}
            {!relLoading && !relData && <p className="text-sm text-slate-400">Pick a resource on the left to see its stored relationships.</p>}
          </div>
        </div>
      )}

      {tab === 'Tags Explorer' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Tags Explorer</h3>
          {tagsLoading ? <p className="text-sm text-slate-400">Loading…</p> : (
            <div className="flex flex-col gap-2">
              {providerTagKeys.map(t => (
                <div key={t.key} className="flex items-center justify-between border-b last:border-0 border-slate-100 dark:border-slate-800/60 py-1.5 text-sm">
                  <span className="text-slate-700 dark:text-slate-200 font-medium">{t.key}</span>
                  <span className="text-xs text-slate-400 truncate max-w-md">{t.sampleValues.slice(0, 4).join(', ')}{t.sampleValues.length > 4 ? '…' : ''}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">{t.resourceCount} resource{t.resourceCount === 1 ? '' : 's'}</span>
                </div>
              ))}
              {providerTagKeys.length === 0 && <p className="text-sm text-slate-400">No tags found across discovered resources yet.</p>}
            </div>
          )}
        </div>
      )}

      {tab === 'Resource Timeline' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Timeline</h3>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Event Type</span>
              <select value={timelineEventType} onChange={e => setTimelineEventType(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200">
                <option value="">All</option>
                <option value="created">Created</option>
                <option value="deleted">Deleted</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">From</span>
              <input type="date" value={timelineFrom} onChange={e => setTimelineFrom(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">To</span>
              <input type="date" value={timelineTo} onChange={e => setTimelineTo(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200" />
            </label>
            {(timelineEventType || timelineFrom || timelineTo) && (
              <button onClick={() => { setTimelineEventType(''); setTimelineFrom(''); setTimelineTo(''); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
            )}
            {timelineLoading && <span className="text-xs text-slate-400 pb-2">Loading…</span>}
          </div>
          <DataTable columns={eventColumns} rows={timelineEvents} rowKey={e => `${e.aws_resource_id}:${e.event_type}:${e.occurred_at}`} emptyMessage="No resource changes match these filters." />
        </div>
      )}

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
                <p className="text-[11px] text-slate-400 mt-1">See the Resource Relationships tab for the same data via its own dedicated view.</p>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="font-medium text-slate-700 dark:text-slate-200">Dependency Graph</h4>
                {!graph && !graphLoading && (
                  <button onClick={() => void loadDependencyGraph(selected.id)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Load</button>
                )}
              </div>
              {graphLoading && <p className="text-xs text-slate-400">Loading…</p>}
              {graph && (
                <div className="text-xs">
                  <p className="text-slate-400 mb-2">1-hop neighbors from this resource's stored relationships.</p>
                  {graph.nodes.length <= 1 ? (
                    <p className="text-slate-400">No related resources found for this one yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {graph.edges.map((e, i) => {
                        const target = graph.nodes.find(n => n.id === e.to);
                        return (
                          <li key={i} className="flex items-center justify-between border-b last:border-0 border-slate-100 dark:border-slate-800/60 py-1">
                            <span className="text-slate-600 dark:text-slate-300">{target?.label ?? target?.resourceId ?? e.to}</span>
                            <span className="text-slate-400">{e.relation}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div>
              <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1.5">Raw Metadata</h4>
              <pre className="text-xs bg-slate-50 dark:bg-slate-800 rounded p-2 overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
            </div>
          </div>
        )}
      </Drawer>

      <Modal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} title={`Bulk Tag ${selectedIds.size} Resources`}>
        <form onSubmit={submitBulkOperation} className="flex flex-col gap-3">
          <p className="text-xs text-slate-400">Only tag add/remove is supported — CloudOps360 has read-only AWS access, so it can't start, stop, or terminate resources in bulk.</p>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Operation</span>
            <select value={bulkOperation} onChange={e => setBulkOperation(e.target.value as 'add_tag' | 'remove_tag')} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              <option value="add_tag">Add tag</option>
              <option value="remove_tag">Remove tag</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Tag key</span>
            <input required value={bulkTagKey} onChange={e => setBulkTagKey(e.target.value)} placeholder="e.g. Owner" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          {bulkOperation === 'add_tag' && (
            <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Tag value</span>
              <input required value={bulkTagValue} onChange={e => setBulkTagValue(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
            </label>
          )}
          {bulkResult && <p className="text-xs text-slate-500 dark:text-slate-400">{bulkResult}</p>}
          <button type="submit" disabled={bulkBusy} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
            {bulkBusy ? 'Applying…' : 'Apply'}
          </button>
        </form>
      </Modal>
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
