import { Icon } from '../../icons';
import { PROVIDER_LABEL, PROVIDERS, type Provider } from '../../../lib/cloudAccounts/overview';

export type TimePreset = '7d' | '30d' | '90d';
export const TIME_DAYS: Record<TimePreset, number> = { '7d': 7, '30d': 30, '90d': 90 };
const TIME_LABEL: Record<TimePreset, string> = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' };

const REGIONS = [
  'all', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
  'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
];

export interface OverviewFilterState {
  provider: Provider | null;
  region: string;
  time: TimePreset;
}

export const DEFAULT_OVERVIEW_FILTERS: OverviewFilterState = {
  provider: null,
  region: 'all',
  time: '30d',
};

/**
 * Spec §6 — global filters for the Overview. Provider filters the composed
 * view client-side; region + time range are passed through to the resources
 * dashboard query. (Organization / folder / account filters need the
 * aggregation API from §39–40 and are out of scope for this pass.) A "last
 * updated / refresh" control (§38) sits on the right.
 */
export function OverviewFilters({
  value,
  onChange,
  updatedAt,
  onRefresh,
  refreshing,
}: {
  value: OverviewFilterState;
  onChange: (next: OverviewFilterState) => void;
  updatedAt: number | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const set = <K extends keyof OverviewFilterState>(k: K, v: OverviewFilterState[K]) => onChange({ ...value, [k]: v });
  const dirty = value.provider !== null || value.region !== 'all' || value.time !== '30d';

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Cloud" value={value.provider ?? 'all'} onChange={(v) => set('provider', v === 'all' ? null : (v as Provider))}>
          <option value="all">All providers</option>
          {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
        </Select>

        <Select label="Region" value={value.region} onChange={(v) => set('region', v)}>
          {REGIONS.map((r) => <option key={r} value={r}>{r === 'all' ? 'All regions' : r}</option>)}
        </Select>

        <Select label="Time" value={value.time} onChange={(v) => set('time', v as TimePreset)}>
          {(Object.keys(TIME_LABEL) as TimePreset[]).map((t) => <option key={t} value={t}>{TIME_LABEL[t]}</option>)}
        </Select>

        {dirty && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_OVERVIEW_FILTERS)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:underline pb-1.5"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 pb-0.5">
        {updatedAt && (
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Updated {relativeTime(updatedAt)}</span>
        )}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-slate-600 dark:text-slate-300 hover:border-brand-300 dark:hover:border-brand-600 disabled:opacity-60"
        >
          <Icon name="refresh-cw" size={12} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const active = value !== 'all' && value !== '30d';
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`text-sm rounded-md border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 px-2 py-1.5 ${
          active ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'
        }`}
      >
        {children}
      </select>
    </label>
  );
}

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
