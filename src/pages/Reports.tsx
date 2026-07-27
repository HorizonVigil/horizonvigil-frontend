import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { supabase } from '../lib/supabase';
import { useOrg } from '../lib/orgContext';
import { api } from '../lib/api';

interface Report { id: string; category: string; name: string; format: string; status: string; created_at: string; error_message: string | null }
const CATEGORIES = ['cost', 'security', 'resource', 'operational', 'compliance'];
// Reports without a real underlying data source aren't offered generation yet —
// see reports.ts's generateReport for why (no GuardDuty/Security Hub ingestion).
const GENERATABLE_CATEGORIES = new Set(['cost', 'resource', 'operational']);

export function Reports() {
  const { currentOrg } = useOrg();
  const [reports, setReports] = useState<Report[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('cost');
  const [format, setFormat] = useState('pdf');
  const [cadence, setCadence] = useState('one_time');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase.from('reports').select('id,category,name,format,status,created_at,error_message').eq('org_id', currentOrg.id).order('created_at', { ascending: false }).limit(200);
    setReports(data ?? []);
  }, [currentOrg]);

  useEffect(() => { void load(); }, [load]);

  async function generate(id: string) {
    setBusyId(id);
    try {
      await api.generateReport(id);
    } catch {
      // Surfaced via the row's own error_message/status after reload below —
      // a failed generation (e.g. an unsupported category) isn't a UI bug.
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function download(id: string) {
    setBusyId(id);
    try {
      const { blob, filename } = await api.downloadReport(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusyId(null);
    }
  }

  async function createReport(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    if (cadence === 'one_time') {
      await supabase.from('reports').insert({ org_id: currentOrg.id, category, name, format, status: 'pending' });
    } else {
      await supabase.from('scheduled_reports').insert({ org_id: currentOrg.id, report_category: category, name, format, cadence });
    }
    setModalOpen(false);
    setName('');
    await load();
  }

  const byCategory: Record<string, number> = {};
  for (const r of reports) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;

  const columns: Column<Report>[] = [
    { key: 'name', header: 'Report', render: r => r.name, sortValue: r => r.name },
    { key: 'category', header: 'Category', render: r => <Badge tone="neutral">{r.category}</Badge>, sortValue: r => r.category },
    { key: 'format', header: 'Format', render: r => r.format.toUpperCase(), sortValue: r => r.format },
    { key: 'status', header: 'Status', render: r => (
      <div className="flex flex-col gap-0.5">
        <Badge>{r.status}</Badge>
        {r.status === 'failed' && r.error_message && <span className="text-[11px] text-red-500 dark:text-red-400 max-w-xs">{r.error_message}</span>}
      </div>
    ), sortValue: r => r.status },
    { key: 'created', header: 'Requested', render: r => new Date(r.created_at).toLocaleString(), sortValue: r => r.created_at },
    { key: 'actions', header: '', render: r => {
      const busy = busyId === r.id;
      if (r.status === 'delivered') {
        return <button onClick={() => download(r.id)} disabled={busy} className="text-brand-600 dark:text-brand-400 hover:underline text-xs disabled:opacity-50">{busy ? 'Downloading…' : 'Download'}</button>;
      }
      if (!GENERATABLE_CATEGORIES.has(r.category)) {
        return <span className="text-xs text-slate-400" title="Needs GuardDuty/Security Hub finding ingestion, not built yet">Not available</span>;
      }
      return <button onClick={() => generate(r.id)} disabled={busy} className="text-brand-600 dark:text-brand-400 hover:underline text-xs disabled:opacity-50">{busy ? 'Generating…' : r.status === 'failed' ? 'Retry' : 'Generate'}</button>;
    } },
  ];

  return (
    <div>
      <FilterBar title="Reports" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Reports Generated" value={String(reports.filter(r => r.status === 'delivered').length)} />
        <StatCard label="Pending" value={String(reports.filter(r => r.status === 'pending' || r.status === 'generating').length)} />
        <StatCard label="Failed" value={String(reports.filter(r => r.status === 'failed').length)} />
        <StatCard label="Total Requests" value={String(reports.length)} />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Reports by Category</h3>
        <Donut data={CATEGORIES.map(c => ({ label: c, value: byCategory[c] ?? 0 })).filter(d => d.value > 0)} />
      </div>

      <div className="flex justify-end mb-3">
        <button onClick={() => setModalOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2">New Report</button>
      </div>

      <DataTable columns={columns} rows={reports} rowKey={r => r.id} emptyMessage="No reports yet. Create one below, then click Generate on cost, resource, or optimization reports (security and compliance need finding-source integrations that aren't built yet)." />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Report">
        <form onSubmit={createReport} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Name</span>
            <input required value={name} onChange={e => setName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Category</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}{GENERATABLE_CATEGORIES.has(c) ? '' : ' (needs integration — not generatable yet)'}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Format</span>
            <select value={format} onChange={e => setFormat(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
              <option value="xlsx" disabled>XLSX (coming soon)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Schedule</span>
            <select value={cadence} onChange={e => setCadence(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {['one_time', 'daily', 'weekly', 'monthly', 'quarterly'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
            {cadence !== 'one_time' && <span className="text-xs text-amber-600 dark:text-amber-400">Recurring email delivery isn't built yet — this saves the schedule, but nothing will be generated or emailed automatically until it is. Use "one time" to generate and download a report right now.</span>}
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2">Create</button>
        </form>
      </Modal>
    </div>
  );
}
