import { useFilters, type DateRangePreset } from '../lib/filterContext';

// Kept in sync with cloud-api's DEFAULT_SCAN_REGIONS (scanners/types.ts) —
// this previously omitted ap-south-1 and others, so even after a region was
// actually scanned there was no way to filter down to it here.
const REGIONS = [
  'all', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1', 'sa-east-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2',
  'ap-northeast-1', 'ap-northeast-2', 'ap-northeast-3',
];

const RANGE_LABELS: Record<DateRangePreset, string> = {
  '1h': 'Last 1 Hour', '7d': 'Last 7 Days', '30d': 'Last 30 Days', mtd: 'Month to Date', custom: 'Custom',
};

/**
 * Persistent header bar present on every page (account + region + date-range
 * + refresh) — spec §5. The Account filter lives here, not as a one-off
 * dropdown on individual pages, so it's in the same place on every screen
 * regardless of how many AWS accounts or GCP projects are connected. Options
 * are prefixed "AWS —"/"GCP —" since it's one flat list across both
 * providers — that prefix is also the only "filter by provider" control
 * this app has; there's no separate all-AWS/all-GCP toggle, only
 * all-accounts or one specific one.
 *
 * `showAccountFilter` defaults to true; pass false on pages whose data has
 * no per-account dimension (Reports has no connection_id column at all) —
 * otherwise the control renders but silently does nothing when changed,
 * which is worse than not having it.
 */
export function FilterBar({ title, breadcrumb, showAccountFilter = true }: { title: string; breadcrumb?: React.ReactNode; showAccountFilter?: boolean }) {
  const { region, setRegion, account, setAccount, connections, dateRange, setDateRange, refresh } = useFilters();

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        {breadcrumb}
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white mt-0.5">{title}</h1>
      </div>
      <div className="flex items-end gap-2">
        {showAccountFilter && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Account</span>
            <select value={account} onChange={e => setAccount(e.target.value)} className={`text-sm rounded-md border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5 ${account !== 'all' ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
              <option value="all">All Accounts</option>
              {connections.map(c => <option key={c.id} value={c.id}>{c.provider === 'gcp' ? 'GCP' : 'AWS'} — {c.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Region</span>
          <select value={region} onChange={e => setRegion(e.target.value)} className={`text-sm rounded-md border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5 ${region !== 'all' ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
            {REGIONS.map(r => <option key={r} value={r}>{r === 'all' ? 'All Regions' : r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Date Range</span>
          <select value={dateRange} onChange={e => setDateRange(e.target.value as DateRangePreset)} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5">
            {(Object.keys(RANGE_LABELS) as DateRangePreset[]).filter(k => k !== 'custom').map(k => <option key={k} value={k}>{RANGE_LABELS[k]}</option>)}
          </select>
        </label>
        <button onClick={refresh} title="Refresh" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
