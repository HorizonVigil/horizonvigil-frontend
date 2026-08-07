import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { BarChart } from '../components/charts/BarChart';
import { useTabParam } from '../lib/useTabParam';
import {
  api, type CustomDashboard, type DashboardWidgetCatalogEntry, type ActivityEntry, type MonitoringAlarm,
  type CloudConnection, type GcpConnection,
} from '../lib/api';
import { useAuth } from '../lib/auth';

/** react-grid-layout's own WidthProvider HOC is typed as a default-only
 * export by @types/react-grid-layout under this project's module/bundler
 * settings, so this measures the container itself instead — a plain
 * ResizeObserver is simpler than fighting the type declaration. */
function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/**
 * A widget instance as stored in `custom_dashboards.widgets` jsonb. `widgets`
 * has no schema/CHECK constraint (it's a free-form jsonb array), so adding
 * id/x/y/w/h/connectionIds is an application-level convention change, not a
 * migration — legacy `{key, config}`-only rows (pre-rebuild dashboards) are
 * normalized on load in `normalizeWidgets` below rather than requiring a
 * backfill.
 */
interface DashboardWidgetInstance {
  id: string;
  key: string;
  config: unknown;
  x: number; y: number; w: number; h: number;
  /** Which accounts/projects this widget aggregates. Empty/undefined = every connection in the org (today's only behavior, kept as the default). */
  connectionIds?: string[];
}

const DEFAULT_W = 4;
const DEFAULT_H = 4;
const GRID_COLS = 12;

function normalizeWidgets(raw: unknown[]): DashboardWidgetInstance[] {
  return raw.map((item, i) => {
    const w = item as Partial<DashboardWidgetInstance> & { key: string };
    const hasPosition = typeof w.x === 'number' && typeof w.y === 'number';
    return {
      id: w.id ?? `w${i}-${Math.random().toString(36).slice(2, 9)}`,
      key: w.key,
      config: w.config ?? {},
      x: hasPosition ? w.x! : (i * DEFAULT_W) % GRID_COLS,
      y: hasPosition ? w.y! : Math.floor((i * DEFAULT_W) / GRID_COLS) * DEFAULT_H,
      w: w.w ?? DEFAULT_W,
      h: w.h ?? DEFAULT_H,
      connectionIds: w.connectionIds,
    };
  });
}

function scopeKeyFor(w: DashboardWidgetInstance): string {
  return w.connectionIds && w.connectionIds.length > 0 ? [...w.connectionIds].sort().join(',') : '__all__';
}

/** Live data backing widget previews — one fetch per unique account-scope among the dashboard's widgets, reusing the same aggregate endpoints Overview.tsx already calls, so a widget shows the same real numbers a user would see there (or a real subset of them), not a separate mock. */
interface WidgetData {
  resourceTotal: number;
  resourceByCategory: Record<string, number>;
  costMtd: number;
  costByService: Record<string, number>;
  openFindings: number;
  activity: ActivityEntry[];
  alarms: MonitoringAlarm[];
  k8sClusters: number;
  k8sNodes: number;
  k8sPods: number;
}

async function fetchWidgetData(connectionIds: string[] | undefined): Promise<WidgetData> {
  const scope = connectionIds && connectionIds.length > 0 ? connectionIds : undefined;
  const [resources, cost, costAnalytics, security, activityRes, alarmsRes, k8s] = await Promise.all([
    api.getOverviewResources(scope),
    api.getOverviewCost(scope),
    api.getCostAnalytics({ connectionIds: scope }),
    api.getOverviewSecurity(scope),
    api.getRecentActivity(1, 5),
    // getAlarms only takes one connectionId — for a multi-account scope this
    // shows alarms from the first selected account rather than all of them;
    // a real multi-id alarms filter is a small backend follow-up, not done here.
    api.getAlarms(scope ? { connectionId: scope[0], limit: 5 } : { limit: 5 }),
    fetchK8sCounts(scope),
  ]);
  return {
    resourceTotal: resources.total, resourceByCategory: resources.byCategory,
    costMtd: cost.monthToDate, costByService: costAnalytics.byService,
    openFindings: security.openFindings, activity: activityRes.items, alarms: alarmsRes.items,
    ...k8s,
  };
}

async function fetchK8sCounts(scope: string[] | undefined): Promise<{ k8sClusters: number; k8sNodes: number; k8sPods: number }> {
  if (!scope) {
    const [eksC, gkeC, eksN, eksP, gkeP] = await Promise.all([
      api.getEksClusters({ limit: 1 }), api.getGkeClusters({ limit: 1 }),
      api.getEksNodes({ limit: 1 }), api.getEksPods({ limit: 1 }), api.getGkePods({ limit: 1 }),
    ]);
    return {
      k8sClusters: eksC.pagination.total + gkeC.pagination.total,
      k8sNodes: eksN.pagination.total,
      k8sPods: eksP.pagination.total + gkeP.pagination.total,
    };
  }
  const perAccount = await Promise.all(scope.map(async (connectionId) => {
    const [eksC, gkeC, eksN, eksP, gkeP] = await Promise.all([
      api.getEksClusters({ connectionId, limit: 1 }), api.getGkeClusters({ connectionId, limit: 1 }),
      api.getEksNodes({ connectionId, limit: 1 }), api.getEksPods({ connectionId, limit: 1 }), api.getGkePods({ connectionId, limit: 1 }),
    ]);
    return {
      clusters: eksC.pagination.total + gkeC.pagination.total,
      nodes: eksN.pagination.total,
      pods: eksP.pagination.total + gkeP.pagination.total,
    };
  }));
  return {
    k8sClusters: perAccount.reduce((s, a) => s + a.clusters, 0),
    k8sNodes: perAccount.reduce((s, a) => s + a.nodes, 0),
    k8sPods: perAccount.reduce((s, a) => s + a.pods, 0),
  };
}

function WidgetPreview({ widget, data }: { widget: DashboardWidgetInstance; data: WidgetData | null }) {
  if (!data) return <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;

  switch (widget.key) {
    case 'kpi_cost_mtd':
      return <StatCard label="Cost (Month to Date)" value={money(data.costMtd)} />;
    case 'kpi_resource_count':
      return <StatCard label="Resource Count" value={data.resourceTotal.toLocaleString()} />;
    case 'kpi_open_findings':
      return <StatCard label="Open Security Findings" value={data.openFindings.toLocaleString()} />;
    case 'kpi_k8s_clusters':
      return <StatCard label="Kubernetes Clusters" value={data.k8sClusters.toLocaleString()} />;
    case 'kpi_k8s_nodes':
      return <StatCard label="Kubernetes Nodes" value={data.k8sNodes.toLocaleString()} />;
    case 'kpi_k8s_pods':
      return <StatCard label="Kubernetes Pods" value={data.k8sPods.toLocaleString()} />;
    case 'resource_distribution_pie':
      return Object.keys(data.resourceByCategory).length > 0
        ? <Donut size={100} thickness={16} data={Object.entries(data.resourceByCategory).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} />
        : <EmptyState icon="◔" title="No resources yet" />;
    case 'cost_by_service_bar':
      return Object.keys(data.costByService).length > 0
        ? <BarChart data={Object.entries(data.costByService).sort(([, a], [, b]) => b - a).slice(0, 5).map(([label, value]) => ({ label, value }))} valueFormatter={money} />
        : <EmptyState icon="$" title="No cost data yet" />;
    case 'resource_inventory_table':
      return Object.keys(data.resourceByCategory).length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {Object.entries(data.resourceByCategory).filter(([, v]) => v > 0).slice(0, 5).map(([cat, count]) => (
            <li key={cat} className="flex justify-between py-1.5"><span className="text-slate-600 dark:text-slate-300">{cat}</span><span className="text-slate-400 tabular-nums">{count}</span></li>
          ))}
        </ul>
      ) : <EmptyState icon="▤" title="No resources yet" />;
    case 'recent_alerts_list':
      return data.alarms.length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {data.alarms.slice(0, 4).map(a => <li key={a.id} className="flex justify-between py-1.5"><span className="text-slate-600 dark:text-slate-300 truncate">{a.alarm_name}</span><span className={a.state === 'ALARM' ? 'text-red-500' : 'text-slate-400'}>{a.state}</span></li>)}
        </ul>
      ) : <EmptyState icon="⚠" title="No alarms yet" />;
    case 'audit_activity_list':
      return data.activity.length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {data.activity.slice(0, 4).map(entry => <li key={entry.id} className="py-1.5 text-slate-600 dark:text-slate-300 truncate">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')}</li>)}
        </ul>
      ) : <EmptyState icon="▤" title="No activity yet" />;
    case 'cost_trend_line':
      return <EmptyState icon="∿" title="Trend not available yet" description="Daily cost history isn't collected yet — only period totals are, which is what the other cost widgets use." />;
    default:
      return <EmptyState icon="○" title="Preview not available for this widget type" />;
  }
}

/** One connection, tagged with its provider — the flat shape the scope picker renders regardless of whether it came from the AWS or GCP accounts list. */
interface ScopableAccount { id: string; label: string; provider: 'aws' | 'gcp' }

function ScopePicker({ widget, accounts, onChange, onClose }: { widget: DashboardWidgetInstance; accounts: ScopableAccount[]; onChange: (ids: string[] | undefined) => void; onClose: () => void }) {
  const selected = new Set(widget.connectionIds ?? []);
  const aws = accounts.filter(a => a.provider === 'aws');
  const gcp = accounts.filter(a => a.provider === 'gcp');

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next.size > 0 ? [...next] : undefined);
  }

  return (
    <div className="absolute z-20 mt-1 w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-slate-600 dark:text-slate-300">Scope this widget</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
      </div>
      <button onClick={() => onChange(undefined)} className={`w-full text-left rounded px-2 py-1 mb-2 ${!widget.connectionIds ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
        All accounts (org-wide)
      </button>
      {aws.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">AWS</div>
          {aws.map(a => (
            <label key={a.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
              <span className="truncate">{a.label}</span>
            </label>
          ))}
        </div>
      )}
      {gcp.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Google Cloud</div>
          {gcp.map(a => (
            <label key={a.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} />
              <span className="truncate">{a.label}</span>
            </label>
          ))}
        </div>
      )}
      {accounts.length === 0 && <p className="text-slate-400">No connected accounts yet.</p>}
      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400">
        Azure isn't a supported provider yet — nothing to scope to there.
      </div>
    </div>
  );
}

type Tab = 'mine' | 'shared' | 'templates' | 'widgets';
const TAB_KEYS: Tab[] = ['mine', 'shared', 'templates', 'widgets'];

export function CustomDashboards() {
  const { user } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useTabParam<Tab>(TAB_KEYS, 'mine');
  const [mine, setMine] = useState<CustomDashboard[]>([]);
  const [shared, setShared] = useState<CustomDashboard[]>([]);
  const [templates, setTemplates] = useState<CustomDashboard[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidgetCatalogEntry[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<CustomDashboard | null>(null);
  const [widgetInstances, setWidgetInstances] = useState<DashboardWidgetInstance[]>([]);
  const [scopedData, setScopedData] = useState<Record<string, WidgetData>>({});
  const [accounts, setAccounts] = useState<ScopableAccount[]>([]);
  const [scopePickerFor, setScopePickerFor] = useState<string | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { ref: gridContainerRef, width: gridWidth } = useContainerWidth<HTMLDivElement>();

  const load = useCallback(async () => {
    const [m, s, t, w] = await Promise.all([
      api.getMyDashboards({ limit: 100 }),
      api.getSharedDashboards({ limit: 100 }),
      api.getDashboardTemplates({ limit: 100 }),
      api.getWidgetLibrary(),
    ]);
    setMine(m.items);
    setShared(s.items);
    setTemplates(t.items);
    setWidgets(w.widgets);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Widget instances are the local, editable copy of detail.widgets —
  // normalized once when a dashboard is opened, then mutated locally as the
  // user drags/resizes/rescopes, and persisted back with a debounced PUT.
  useEffect(() => {
    if (!detail) { setWidgetInstances([]); setScopedData({}); return; }
    setWidgetInstances(normalizeWidgets(Array.isArray(detail.widgets) ? detail.widgets : []));
    void Promise.all([api.getAccounts({ limit: 200 }), api.getGcpAccounts({ limit: 200 })]).then(([awsRes, gcpRes]) => {
      setAccounts([
        ...awsRes.items.map((a: CloudConnection) => ({ id: a.id, label: a.connection_name ?? a.aws_account_id, provider: 'aws' as const })),
        ...gcpRes.items.map((a: GcpConnection) => ({ id: a.id, label: a.connection_name ?? a.gcp_project_id, provider: 'gcp' as const })),
      ]);
    });
  }, [detail?.id]);

  // Fetch (once) for every unique account-scope currently in use among this
  // dashboard's widgets — several widgets sharing the same scope share one
  // fetch rather than each firing the same 7 calls redundantly.
  const scopeSignature = useMemo(() => [...new Set(widgetInstances.map(scopeKeyFor))].sort().join('|'), [widgetInstances]);
  useEffect(() => {
    if (widgetInstances.length === 0) return;
    let cancelled = false;
    const uniqueScopes = new Map<string, string[] | undefined>();
    for (const w of widgetInstances) uniqueScopes.set(scopeKeyFor(w), w.connectionIds && w.connectionIds.length > 0 ? w.connectionIds : undefined);
    void Promise.all([...uniqueScopes.entries()].map(async ([key, ids]) => [key, await fetchWidgetData(ids)] as const)).then(entries => {
      if (cancelled) return;
      setScopedData(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeSignature]);

  function scheduleSave(next: DashboardWidgetInstance[]) {
    if (!detail) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSavingLayout(true);
      try {
        const updated = await api.updateDashboard(detail.id, { widgets: next });
        setDetail(updated);
      } finally {
        setSavingLayout(false);
      }
    }, 600);
  }

  function handleLayoutChange(layout: readonly { i: string; x: number; y: number; w: number; h: number }[]) {
    setWidgetInstances(prev => {
      const next = prev.map(w => {
        const l = layout.find(item => item.i === w.id);
        return l ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
      });
      scheduleSave(next);
      return next;
    });
  }

  function handleScopeChange(widgetId: string, connectionIds: string[] | undefined) {
    setWidgetInstances(prev => {
      const next = prev.map(w => (w.id === widgetId ? { ...w, connectionIds } : w));
      scheduleSave(next);
      return next;
    });
  }

  async function handleAddWidget(catalogEntry: DashboardWidgetCatalogEntry) {
    if (!detail) return;
    const maxY = widgetInstances.reduce((m, w) => Math.max(m, w.y + w.h), 0);
    const next = [...widgetInstances, {
      id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      key: catalogEntry.key, config: catalogEntry.default_config,
      x: 0, y: maxY, w: DEFAULT_W, h: DEFAULT_H,
    }];
    setWidgetInstances(next);
    const updated = await api.updateDashboard(detail.id, { widgets: next });
    setDetail(updated);
    await load();
  }

  async function handleRemoveWidget(widgetId: string) {
    if (!detail) return;
    const next = widgetInstances.filter(w => w.id !== widgetId);
    setWidgetInstances(next);
    const updated = await api.updateDashboard(detail.id, { widgets: next });
    setDetail(updated);
    await load();
  }

  async function handleDelete(id: string) {
    if (!(await confirm('Delete this dashboard? This cannot be undone.'))) return;
    await api.deleteDashboard(id);
    setDetail(null);
    await load();
  }

  async function handleShare(dash: CustomDashboard) {
    await api.shareDashboard(dash.id, !dash.is_shared);
    await load();
  }

  async function handleUseTemplate(id: string) {
    await api.useTemplate(id);
    await load();
    setTab('mine');
  }

  async function handleSaveAsTemplate(id: string) {
    await api.saveAsTemplate(id);
    await load();
  }

  const rows = tab === 'mine' ? mine : tab === 'shared' ? shared : tab === 'templates' ? templates : [];
  const isOwner = detail?.owner_id === user?.id;
  const layout = widgetInstances.map(w => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h }));

  return (
    <div>
      <FilterBar title="Custom Dashboards" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm">
          {(['mine', 'shared', 'templates', 'widgets'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {t === 'mine' ? 'My Dashboards' : t === 'shared' ? 'Shared Dashboards' : t === 'templates' ? 'Templates' : 'Widget Library'}
            </button>
          ))}
        </div>
        {tab === 'mine' && (
          <button onClick={() => setCreateOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ New Dashboard</button>
        )}
      </div>

      {tab === 'widgets' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {widgets.map(w => (
            <div key={w.key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{w.display_name}</span>
                <span className="text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400">{w.widget_type}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{w.description}</p>
              <span className="text-[10px] text-slate-400 mt-2 block">{w.category}</span>
            </div>
          ))}
          {widgets.length === 0 && <div className="col-span-full"><EmptyState icon="▦" title="No widgets in the catalog yet" /></div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(d => (
            <button key={d.id} onClick={() => setDetail(d)} className="text-left rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand-300 dark:hover:border-brand-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{d.name}</span>
                {d.is_shared && <span className="text-[10px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">Shared</span>}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{d.description || 'No description.'}</p>
              <span className="text-[10px] text-slate-400 mt-2 block">{Array.isArray(d.widgets) ? d.widgets.length : 0} widget{Array.isArray(d.widgets) && d.widgets.length === 1 ? '' : 's'}</span>
              {tab === 'templates' && (
                <span onClick={e => { e.stopPropagation(); void handleUseTemplate(d.id); }} className="inline-block mt-2 text-xs text-brand-600 dark:text-brand-400 hover:underline">Use this template →</span>
              )}
            </button>
          ))}
          {rows.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon="▦"
                title={tab === 'mine' ? 'No dashboards yet' : tab === 'shared' ? 'No dashboards have been shared in this org yet' : 'No templates yet'}
                description={tab === 'mine' ? 'Click "+ New Dashboard" to build one.' : undefined}
                action={tab === 'mine' ? { label: '+ New Dashboard', onClick: () => setCreateOpen(true) } : undefined}
              />
            </div>
          )}
        </div>
      )}

      <CreateDashboardModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />

      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title={detail.name} wide>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{detail.description || 'No description.'}</p>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Widgets ({widgetInstances.length})</h3>
              {savingLayout && <span className="text-[10px] text-slate-400">Saving…</span>}
            </div>
            {isOwner && (
              <div className="flex flex-wrap gap-2 mb-3">
                {widgets.map(w => (
                  <button
                    key={w.key}
                    onClick={() => void handleAddWidget(w)}
                    className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    + {w.display_name}
                  </button>
                ))}
              </div>
            )}
            {widgetInstances.length > 0 ? (
              <div ref={gridContainerRef}>
              {gridWidth > 0 && (
              <GridLayout
                className="layout"
                layout={layout}
                width={gridWidth}
                cols={GRID_COLS}
                rowHeight={32}
                margin={[12, 12]}
                onLayoutChange={handleLayoutChange}
                isDraggable={isOwner}
                isResizable={isOwner}
                draggableCancel=".widget-no-drag"
              >
                {widgetInstances.map(w => {
                  const catalogEntry = widgets.find(c => c.key === w.key);
                  const data = scopedData[scopeKeyFor(w)] ?? null;
                  const scopeLabel = w.connectionIds && w.connectionIds.length > 0
                    ? `${w.connectionIds.length} account${w.connectionIds.length === 1 ? '' : 's'}`
                    : 'All accounts';
                  return (
                    <div key={w.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between mb-2 gap-2">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{catalogEntry?.display_name ?? w.key}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {isOwner && (
                            <div className="relative widget-no-drag">
                              <button onClick={() => setScopePickerFor(scopePickerFor === w.id ? null : w.id)} className="text-[10px] rounded-full px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
                                {scopeLabel}
                              </button>
                              {scopePickerFor === w.id && (
                                <ScopePicker
                                  widget={w}
                                  accounts={accounts}
                                  onChange={(ids) => handleScopeChange(w.id, ids)}
                                  onClose={() => setScopePickerFor(null)}
                                />
                              )}
                            </div>
                          )}
                          {isOwner && (
                            <button onClick={() => void handleRemoveWidget(w.id)} className="widget-no-drag text-slate-300 hover:text-red-500 text-xs" title="Remove widget">✕</button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto widget-no-drag">
                        <WidgetPreview widget={w} data={data} />
                      </div>
                    </div>
                  );
                })}
              </GridLayout>
              )}
              </div>
            ) : (
              <div className="mt-3"><EmptyState icon="▦" title="No widgets added yet" description="Add one from the buttons above." /></div>
            )}
          </div>
          {isOwner && (
            <div className="flex justify-between">
              <div className="flex gap-2">
                <button onClick={() => void handleShare(detail)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  {detail.is_shared ? 'Unshare' : 'Share with org'}
                </button>
                {!detail.is_template && (
                  <button onClick={() => void handleSaveAsTemplate(detail.id)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Save as Template
                  </button>
                )}
              </div>
              <button onClick={() => void handleDelete(detail.id)} className="text-xs rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1.5">Delete Dashboard</button>
            </div>
          )}
        </Modal>
      )}
      {confirmDialog}
    </div>
  );
}

function CreateDashboardModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.createDashboard({ name: name.trim(), description: description.trim() || undefined, widgets: [] });
      setName(''); setDescription('');
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Dashboard">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. My Cost Dashboard" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-300">Description (optional)</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white" />
        </label>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={loading || !name.trim()} className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2">
          {loading ? 'Creating…' : 'Create Dashboard'}
        </button>
      </form>
    </Modal>
  );
}
