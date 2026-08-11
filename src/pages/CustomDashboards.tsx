import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { BarChart } from '../components/charts/BarChart';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type CustomDashboard, type DashboardWidgetCatalogEntry, type ActivityEntry, type MonitoringAlarm } from '../lib/api';
import { useAuth } from '../lib/auth';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/** Live data backing widget previews, fetched once per dashboard-detail open — reuses the same aggregate endpoints Overview.tsx already calls, so a widget shows the same real numbers a user would see there, not a separate mock. */
interface WidgetData {
  resourceTotal: number;
  resourceByCategory: Record<string, number>;
  costMtd: number;
  costByService: Record<string, number>;
  openFindings: number;
  activity: ActivityEntry[];
  alarms: MonitoringAlarm[];
}

function WidgetPreview({ widget, data }: { widget: { key: string; config: unknown }; data: WidgetData | null }) {
  if (!data) return <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />;

  switch (widget.key) {
    case 'kpi_cost_mtd':
      return <StatCard label="Cost (Month to Date)" value={money(data.costMtd)} />;
    case 'kpi_resource_count':
      return <StatCard label="Resource Count" value={data.resourceTotal.toLocaleString()} />;
    case 'kpi_open_findings':
      return <StatCard label="Open Security Findings" value={data.openFindings.toLocaleString()} />;
    case 'resource_distribution_pie':
      return Object.keys(data.resourceByCategory).length > 0
        ? <Donut size={100} thickness={16} data={Object.entries(data.resourceByCategory).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} />
        : <EmptyState icon="resources" title="No resources yet" />;
    case 'cost_by_service_bar':
      return Object.keys(data.costByService).length > 0
        ? <BarChart data={Object.entries(data.costByService).sort(([, a], [, b]) => b - a).slice(0, 5).map(([label, value]) => ({ label, value }))} valueFormatter={money} />
        : <EmptyState icon="cost" title="No cost data yet" />;
    case 'resource_inventory_table':
      return Object.keys(data.resourceByCategory).length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {Object.entries(data.resourceByCategory).filter(([, v]) => v > 0).slice(0, 5).map(([cat, count]) => (
            <li key={cat} className="flex justify-between py-1.5"><span className="text-slate-600 dark:text-slate-300">{cat}</span><span className="text-slate-400 tabular-nums">{count}</span></li>
          ))}
        </ul>
      ) : <EmptyState icon="resources" title="No resources yet" />;
    case 'recent_alerts_list':
      return data.alarms.length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {data.alarms.slice(0, 4).map(a => <li key={a.id} className="flex justify-between py-1.5"><span className="text-slate-600 dark:text-slate-300 truncate">{a.alarm_name}</span><span className={a.state === 'ALARM' ? 'text-red-500' : 'text-slate-400'}>{a.state}</span></li>)}
        </ul>
      ) : <EmptyState icon="alerts" title="No alarms yet" />;
    case 'audit_activity_list':
      return data.activity.length > 0 ? (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {data.activity.slice(0, 4).map(entry => <li key={entry.id} className="py-1.5 text-slate-600 dark:text-slate-300 truncate">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')}</li>)}
        </ul>
      ) : <EmptyState icon="activity" title="No activity yet" />;
    case 'cost_trend_line':
      return <EmptyState icon="chart-line" title="Trend not available yet" description="Daily cost history isn't collected yet — only period totals are, which is what the other cost widgets use." />;
    default:
      return <EmptyState icon="grid" title="Preview not available for this widget type" />;
  }
}

type Tab = 'mine' | 'shared' | 'templates' | 'widgets';
const TAB_KEYS: Tab[] = ['mine', 'shared', 'templates', 'widgets'];

// This page's tab keys are internal identifiers, not navConfig.ts's sidebar
// labels for the same items -- useSubmenuAccess keys off the label, so the
// two have to be bridged by hand.
const TAB_TO_NAV_LABEL: Record<Tab, string> = {
  mine: 'My Dashboards', shared: 'Shared Dashboards', templates: 'Dashboard Templates', widgets: 'Widget Library',
};

export function CustomDashboards() {
  const { user } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canSeeNavTab = useSubmenuAccess('dashboard');
  const canSeeTab = useCallback((t: Tab) => canSeeNavTab(TAB_TO_NAV_LABEL[t]), [canSeeNavTab]);
  const visibleTabs = TAB_KEYS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TAB_KEYS, 'mine');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [mine, setMine] = useState<CustomDashboard[]>([]);
  const [shared, setShared] = useState<CustomDashboard[]>([]);
  const [templates, setTemplates] = useState<CustomDashboard[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidgetCatalogEntry[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<CustomDashboard | null>(null);
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null);

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

  useEffect(() => {
    if (!detail) { setWidgetData(null); return; }
    let cancelled = false;
    (async () => {
      const [resources, cost, costAnalytics, security, activityRes, alarmsRes] = await Promise.all([
        api.getOverviewResources(),
        api.getOverviewCost(),
        api.getCostAnalytics(),
        api.getOverviewSecurity(),
        api.getRecentActivity(1, 5),
        api.getAlarms({ limit: 5 }),
      ]);
      if (cancelled) return;
      setWidgetData({
        resourceTotal: resources.total, resourceByCategory: resources.byCategory,
        costMtd: cost.monthToDate, costByService: costAnalytics.byService,
        openFindings: security.openFindings, activity: activityRes.items, alarms: alarmsRes.items,
      });
    })();
    return () => { cancelled = true; };
  }, [detail]);

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

  const rows = tab === 'mine' ? mine : tab === 'shared' ? shared : tab === 'templates' ? templates : [];

  return (
    <div>
      <FilterBar title="Custom Dashboards" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm">
          {visibleTabs.map(t => (
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
          {widgets.length === 0 && <div className="col-span-full"><EmptyState icon="grid" title="No widgets in the catalog yet" /></div>}
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
                icon="grid"
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
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Widgets ({Array.isArray(detail.widgets) ? detail.widgets.length : 0})</h3>
            <div className="flex flex-wrap gap-2">
              {widgets.map(w => (
                <button
                  key={w.key}
                  onClick={async () => {
                    const nextWidgets = [...(Array.isArray(detail.widgets) ? detail.widgets : []), { key: w.key, config: w.default_config }];
                    const updated = await api.updateDashboard(detail.id, { widgets: nextWidgets });
                    setDetail(updated);
                    await load();
                  }}
                  className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  disabled={detail.owner_id !== user?.id}
                >
                  + {w.display_name}
                </button>
              ))}
            </div>
            {Array.isArray(detail.widgets) && detail.widgets.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {(detail.widgets as { key: string; config: unknown }[]).map((w, i) => {
                  const catalogEntry = widgets.find(c => c.key === w.key);
                  return (
                    <div key={`${w.key}-${i}`} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{catalogEntry?.display_name ?? w.key}</span>
                        {detail.owner_id === user?.id && (
                          <button
                            onClick={async () => {
                              const nextWidgets = (detail.widgets as unknown[]).filter((_, idx) => idx !== i);
                              const updated = await api.updateDashboard(detail.id, { widgets: nextWidgets });
                              setDetail(updated);
                              await load();
                            }}
                            className="text-slate-300 hover:text-red-500 text-xs"
                            title="Remove widget"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <WidgetPreview widget={w} data={widgetData} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3"><EmptyState icon="grid" title="No widgets added yet" description="Add one from the buttons above." /></div>
            )}
          </div>
          {detail.owner_id === user?.id && (
            <div className="flex justify-between">
              <button onClick={() => void handleShare(detail)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                {detail.is_shared ? 'Unshare' : 'Share with org'}
              </button>
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
