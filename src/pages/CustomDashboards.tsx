import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { api, type CustomDashboard, type DashboardWidgetCatalogEntry } from '../lib/api';
import { useAuth } from '../lib/auth';

type Tab = 'mine' | 'shared' | 'templates' | 'widgets';

export function CustomDashboards() {
  const { user } = useAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<CustomDashboard[]>([]);
  const [shared, setShared] = useState<CustomDashboard[]>([]);
  const [templates, setTemplates] = useState<CustomDashboard[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidgetCatalogEntry[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<CustomDashboard | null>(null);

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
          {widgets.length === 0 && <p className="text-sm text-slate-400 col-span-full">No widgets in the catalog yet.</p>}
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
          {rows.length === 0 && <p className="text-sm text-slate-400 col-span-full">{tab === 'mine' ? 'No dashboards yet — click “+ New Dashboard” to build one.' : tab === 'shared' ? 'No dashboards have been shared in this org yet.' : 'No templates yet.'}</p>}
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
            {Array.isArray(detail.widgets) && detail.widgets.length > 0 && (
              <pre className="text-[10px] leading-tight bg-slate-900 text-slate-200 rounded-lg p-3 overflow-auto max-h-40 mt-3">{JSON.stringify(detail.widgets, null, 2)}</pre>
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
