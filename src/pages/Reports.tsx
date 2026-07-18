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

interface Report { id: string; category: string; name: string; format: string; status: string; created_at: string; download_url: string | null }
const CATEGORIES = ['cost', 'security', 'resource', 'operational', 'compliance'];

export function Reports() {
  const { currentOrg } = useOrg();
  const [reports, setReports] = useState<Report[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('cost');
  const [format, setFormat] = useState('pdf');
  const [cadence, setCadence] = useState('one_time');

  const load = useCallback(async () => {
    if (!currentOrg) return;
    const { data } = await supabase.from('reports').select('id,category,name,format,status,created_at,download_url').eq('org_id', currentOrg.id).order('created_at', { ascending: false }).limit(200);
    setReports(data ?? []);
  }, [currentOrg]);

  useEffect(() => { void load(); }, [load]);

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
    { key: 'status', header: 'Status', render: r => <Badge>{r.status}</Badge>, sortValue: r => r.status },
    { key: 'created', header: 'Requested', render: r => new Date(r.created_at).toLocaleString(), sortValue: r => r.created_at },
    { key: 'download', header: '', render: r => r.download_url ? <a href={r.download_url} className="text-brand-600 dark:text-brand-400 hover:underline text-xs">Download</a> : <span className="text-xs text-slate-400">Pending generation</span> },
  ];

  return (
    <div>
      <FilterBar title="Reports" breadcrumb={<Breadcrumb />} />

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

      <DataTable columns={columns} rows={reports} rowKey={r => r.id} emptyMessage="No reports yet. Report generation (PDF/CSV/XLSX rendering) isn't wired up — requests here are recorded and stay “pending” until that pipeline exists." />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Report">
        <form onSubmit={createReport} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Name</span>
            <input required value={name} onChange={e => setName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Category</span>
            <select value={category} onChange={e => setCategory(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Format</span>
            <select value={format} onChange={e => setFormat(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {['pdf', 'csv', 'xlsx'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Schedule</span>
            <select value={cadence} onChange={e => setCadence(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
              {['one_time', 'daily', 'weekly', 'monthly', 'quarterly'].map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2">Create</button>
        </form>
      </Modal>
    </div>
  );
}
