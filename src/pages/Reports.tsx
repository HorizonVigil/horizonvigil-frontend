import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type ReportRow, type ScheduledReport } from '../lib/api';

const CATEGORIES = ['cost', 'security', 'resource', 'operational', 'compliance', 'savings'] as const;
type Category = typeof CATEGORIES[number];

// Matches the sidebar's wording (Executive/Cost/Security/Compliance/Inventory Reports) —
// the backend's actual category values are the plainer names on the right.
const CATEGORY_LABELS: Record<Category, string> = {
  cost: 'Cost',
  security: 'Security',
  resource: 'Inventory',
  operational: 'Executive',
  compliance: 'Compliance',
  savings: 'Savings Opportunities',
};

const TABS = ['Executive Reports', 'Cost Reports', 'Security Reports', 'Compliance Reports', 'Inventory Reports', 'Savings Reports', 'Scheduled Reports', 'Export Center'] as const;
type Tab = typeof TABS[number];

const TAB_CATEGORY: Record<Tab, Category | null> = {
  'Executive Reports': 'operational',
  'Cost Reports': 'cost',
  'Security Reports': 'security',
  'Compliance Reports': 'compliance',
  'Inventory Reports': 'resource',
  'Savings Reports': 'savings',
  'Scheduled Reports': null,
  'Export Center': null,
};

export function Reports() {
  const canSeeTab = useSubmenuAccess('reports');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Executive Reports');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledReport[]>([]);
  const [exportCenter, setExportCenter] = useState<ReportRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category>('cost');
  const [format, setFormat] = useState<'pdf' | 'csv' | 'xlsx'>('pdf');
  const [cadence, setCadence] = useState('one_time');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const initialLoad = !hasLoadedOnce.current;

    setLoadError(null);
    if (initialLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const [reportsResult, scheduledResult, exportResult] =
        await Promise.allSettled([
          api.getReports({ limit: 200 }),
          api.getScheduledReports({ limit: 100 }),
          api.getExportCenter({ status: 'delivered', limit: 50 }),
        ]);

      if (requestId !== requestIdRef.current) return;

      const errors: string[] = [];

      if (reportsResult.status === 'fulfilled') {
        setReports(reportsResult.value.items ?? []);
      } else {
        errors.push('reports');
      }

      if (scheduledResult.status === 'fulfilled') {
        setScheduled(scheduledResult.value.items ?? []);
      } else {
        errors.push('scheduled reports');
      }

      if (exportResult.status === 'fulfilled') {
        setExportCenter(exportResult.value.items ?? []);
      } else {
        errors.push('export center');
      }

      hasLoadedOnce.current = true;

      if (errors.length > 0) {
        setLoadError(
          `Some report data couldn't be loaded: ${errors.join(', ')}.`
        );
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      setLoadError(
        err instanceof Error
          ? err.message
          : 'Failed to load reports.'
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function download(id: string) {
    if (busyId) return;

    setBusyId(id);

    try {
      const { blob, filename } = await api.downloadReport(id);

      if (!blob || blob.size === 0) {
        throw new Error('The report file is empty or unavailable.');
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = filename || 'report';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Give the browser time to start the download before revoking.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not download the report.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteScheduled(id: string) {
    if (deletingId) return;

    const target = scheduled.find(report => report.id === id);
    const confirmed = window.confirm(
      target
        ? `Delete scheduled report "${target.name}"? This cannot be undone.`
        : 'Delete this scheduled report? This cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingId(id);

    try {
      await api.deleteScheduledReport(id);
      await load();
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not delete the scheduled report.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  function openNewReport() {
    const tabCategory = TAB_CATEGORY[tab];
    setCategory(tabCategory ?? 'cost');
    setCadence(tab === 'Scheduled Reports' ? 'weekly' : 'one_time');
    setName('');
    setModalOpen(true);
  }

  async function createReport(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();

    if (creating) return;

    if (!trimmedName) {
      setLoadError('Report name is required.');
      return;
    }

    if (trimmedName.length > 200) {
      setLoadError('Report name must be 200 characters or fewer.');
      return;
    }

    setCreating(true);
    setLoadError(null);

    try {
      if (cadence === 'one_time') {
        await api.createReport({
          category,
          name: trimmedName,
          format,
        });
      } else {
        await api.createScheduledReport({
          name: trimmedName,
          reportCategory: category,
          cadence,
          format,
        });
      }

      setModalOpen(false);
      setName('');
      await load();
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not create the report.'
      );
    } finally {
      setCreating(false);
    }
  }

  const byCategory = useMemo(() => {
    const counts: Partial<Record<Category, number>> = {};

    for (const report of reports) {
      const reportCategory = report.category as Category;
      counts[reportCategory] = (counts[reportCategory] ?? 0) + 1;
    }

    return counts;
  }, [reports]);

  const activeCategory = TAB_CATEGORY[tab];

  const categoryReports = useMemo(
    () =>
      activeCategory
        ? reports.filter(report => report.category === activeCategory)
        : [],
    [activeCategory, reports],
  );

  const deliveredCount = useMemo(
    () => reports.filter(report => report.status === 'delivered').length,
    [reports],
  );

  const pendingCount = useMemo(
    () =>
      reports.filter(
        report =>
          report.status === 'pending' ||
          report.status === 'generating',
      ).length,
    [reports],
  );

  const failedCount = useMemo(
    () => reports.filter(report => report.status === 'failed').length,
    [reports],
  );

  const formatDate = useCallback((value: string | null | undefined) => {
    if (!value) return '—';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? 'Invalid date'
      : date.toLocaleString();
  }, []);

  const formatDateOnly = useCallback((value: string | null | undefined) => {
    if (!value) return '—';

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? 'Invalid date'
      : date.toLocaleDateString();
  }, []);

  const columns: Column<ReportRow>[] = [
    { key: 'name', header: 'Report', render: r => r.name, sortValue: r => r.name },
    { key: 'format', header: 'Format', render: r => r.format.toUpperCase(), sortValue: r => r.format },
    {
      key: 'status', header: 'Status', render: r => (
        <div className="flex flex-col gap-0.5">
          <Badge>{r.status}</Badge>
          {r.status === 'failed' && r.error_message && <span className="text-[11px] text-red-500 dark:text-red-400 max-w-xs">{r.error_message}</span>}
        </div>
      ), sortValue: r => r.status,
    },
    { key: 'created', header: 'Requested', render: r => formatDate(r.created_at), sortValue: r => r.created_at },
    {
      key: 'actions', header: '', render: r => {
        const busy = busyId === r.id;
        if (r.status === 'delivered') {
          return <button
            type="button"
            onClick={() => void download(r.id)}
            disabled={busyId !== null}
            aria-label={`Download ${r.name}`}
            className="text-brand-600 dark:text-brand-400 hover:underline text-xs disabled:opacity-50"
          >{busy ? 'Downloading…' : 'Download'}</button>;
        }
        return <span className="text-xs text-slate-400">—</span>;
      },
    },
  ];

  const scheduledColumns: Column<ScheduledReport>[] = [
    { key: 'name', header: 'Name', render: s => s.name, sortValue: s => s.name },
    { key: 'category', header: 'Category', render: s => <Badge tone="neutral">{CATEGORY_LABELS[s.report_category as Category] ?? s.report_category}</Badge>, sortValue: s => s.report_category },
    { key: 'cadence', header: 'Cadence', render: s => s.cadence.replace('_', ' '), sortValue: s => s.cadence },
    { key: 'format', header: 'Format', render: s => s.format.toUpperCase(), sortValue: s => s.format },
    { key: 'nextRun', header: 'Next Run', render: s => s.next_run_at ? formatDateOnly(s.next_run_at) : '—', sortValue: s => s.next_run_at ?? '' },
    { key: 'enabled', header: 'Enabled', render: s => <Badge tone={s.enabled ? 'good' : 'neutral'}>{s.enabled ? 'Yes' : 'No'}</Badge>, sortValue: s => s.enabled ? 1 : 0 },
    { key: 'actions', header: '', render: s => <button
          type="button"
          onClick={() => void deleteScheduled(s.id)}
          disabled={deletingId !== null}
          aria-label={`Delete scheduled report ${s.name}`}
          className="text-xs text-red-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deletingId === s.id ? 'Deleting…' : 'Delete'}
        </button> },
  ];

  return (
    <div>
      <FilterBar title="Reports" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="shrink-0 font-medium hover:underline disabled:opacity-50"
          >
            {refreshing ? 'Refreshing…' : 'Retry'}
          </button>
        </div>
      )}

      {refreshing && (
        <div
          role="status"
          aria-live="polite"
          className="h-0.5 mb-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
        </div>
      )}

      {loading && !hasLoadedOnce.current ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-400">
          Loading reports…
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Reports Generated" value={String(deliveredCount)} />
        <StatCard label="Pending" value={String(pendingCount)} />
        <StatCard label="Failed" value={String(failedCount)} />
        <StatCard label="Total Requests" value={String(reports.length)} />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Reports by Category</h3>
        <Donut data={CATEGORIES.map(c => ({ label: CATEGORY_LABELS[c], value: byCategory[c] ?? 0 })).filter(d => d.value > 0)} />
      </div>

      <div
        className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto"
        role="tablist"
        aria-label="Reports sections"
      >
        {visibleTabs.map(t => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeCategory && (
        <>
          <div className="flex justify-end mb-3">
            <button type="button" onClick={openNewReport} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2">New {CATEGORY_LABELS[activeCategory]} Report</button>
          </div>
          <DataTable columns={columns} rows={categoryReports} rowKey={r => r.id} emptyMessage={`No ${CATEGORY_LABELS[activeCategory].toLowerCase()} reports yet. Click "New ${CATEGORY_LABELS[activeCategory]} Report" — it's generated immediately, no separate step needed.`} />
        </>
      )}

      {tab === 'Scheduled Reports' && (
        <>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
            Scheduling isn't wired to a delivery engine yet — these are saved for later, but nothing generates or gets emailed automatically until that exists. Use "one time" in New Report to generate a report right now.
          </p>
          <div className="flex justify-end mb-3">
            <button type="button" onClick={openNewReport} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2">New Report</button>
          </div>
          <DataTable columns={scheduledColumns} rows={scheduled} rowKey={s => s.id} emptyMessage="No scheduled reports." />
        </>
      )}

      {tab === 'Export Center' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-400 mb-3">Every report that's finished generating and is ready to download, in one place.</p>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {exportCenter.map(r => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{r.name} <Badge tone="neutral">{CATEGORY_LABELS[r.category as Category] ?? r.category}</Badge></span>
                <button type="button" onClick={() => void download(r.id)} disabled={busyId === r.id} className="text-brand-600 dark:text-brand-400 hover:underline text-xs disabled:opacity-50">{busyId === r.id ? 'Downloading…' : `Download ${r.format.toUpperCase()}`}</button>
              </li>
            ))}
            {exportCenter.length === 0 && <li className="py-2 text-sm text-slate-400">No delivered reports yet — generated reports show up here once ready.</li>}
          </ul>
        </div>
      )}
      </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Report">
        <form onSubmit={createReport} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Name</span>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={200}
              aria-label="Report name"
              disabled={creating}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Category</span>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as Category)}
              aria-label="Report category"
              disabled={creating}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Format</span>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as 'pdf' | 'csv' | 'xlsx')}
              aria-label="Report format"
              disabled={creating}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
              <option value="xlsx">Excel (.xlsx)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Schedule</span>
            <select
              value={cadence}
              onChange={e => setCadence(e.target.value)}
              aria-label="Report schedule"
              disabled={creating}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {['one_time', 'daily', 'weekly', 'monthly', 'quarterly'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            {cadence !== 'one_time' && <span className="text-xs text-amber-600 dark:text-amber-400">Recurring delivery isn't built yet — this saves the schedule, but nothing will be generated or emailed automatically until it is. Use "one time" to generate and download a report right now.</span>}
          </label>
          <button type="submit" disabled={creating} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 disabled:opacity-50">
            {creating ? (cadence === 'one_time' ? 'Generating…' : 'Saving…') : 'Create'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
