import { useFilters, type DateRangePreset } from '../lib/filterContext';

const REGIONS = [
  'all', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
];

const RANGE_LABELS: Record<DateRangePreset, string> = {
  '1h': 'Last 1 Hour', '7d': 'Last 7 Days', '30d': 'Last 30 Days', mtd: 'Month to Date', custom: 'Custom',
};

/** Persistent header bar present on every page (region + date-range + refresh) — spec §5. */
export function FilterBar({ title, breadcrumb }: { title: string; breadcrumb?: React.ReactNode }) {
  const { region, setRegion, dateRange, setDateRange, refresh } = useFilters();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        {breadcrumb}
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white mt-0.5">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <select value={region} onChange={e => setRegion(e.target.value)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5">
          {REGIONS.map(r => <option key={r} value={r}>{r === 'all' ? 'All Regions' : r}</option>)}
        </select>
        <select value={dateRange} onChange={e => setDateRange(e.target.value as DateRangePreset)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5">
          {(Object.keys(RANGE_LABELS) as DateRangePreset[]).filter(k => k !== 'custom').map(k => <option key={k} value={k}>{RANGE_LABELS[k]}</option>)}
        </select>
        <button onClick={refresh} title="Refresh" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
