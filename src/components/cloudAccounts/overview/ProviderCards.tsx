import { Icon } from '../../icons';
import { ProviderMark } from './ProviderMark';
import {
  PROVIDER_UNIT,
  PROVIDERS,
  type OverviewAggregate,
  type Provider,
} from '../../../lib/cloudAccounts/overview';

/**
 * Spec §7 + §44.2 — AWS / Azure / GCP / Total cards. Provider mark + big
 * number are visually prominent; a healthy / warning / failed line sits
 * under each. Clicking a provider card filters the whole dashboard to it
 * (or clears the filter when it's already the only one selected).
 */
export function ProviderCards({
  agg,
  activeFilter,
  onSelect,
}: {
  agg: OverviewAggregate;
  activeFilter: Provider | null;
  onSelect: (p: Provider | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {PROVIDERS.map((p) => {
        const r = agg.perProvider[p];
        const isActive = activeFilter === p;
        const dimmed = activeFilter !== null && !isActive;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(isActive ? null : p)}
            aria-pressed={isActive}
            className={`rounded-xl border bg-white dark:bg-slate-900 p-4 text-left transition-all ${
              isActive
                ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800'
                : 'border-slate-200 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700'
            } ${dimmed ? 'opacity-55' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">
              <ProviderMark provider={p} />
              {r.healthPercent !== null && (
                <span className={`text-xs font-semibold tabular-nums ${
                  r.healthPercent >= 90 ? 'text-emerald-600 dark:text-emerald-400'
                  : r.healthPercent >= 60 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
                }`}>{r.healthPercent}%</span>
              )}
            </div>
            <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white leading-tight">{r.total.toLocaleString()}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 capitalize mb-2">{PROVIDER_UNIT[p]}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Dot className="bg-emerald-500" />{r.healthy.toLocaleString()}</span>
              {r.warning > 0 && <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><Dot className="bg-amber-500" />{r.warning.toLocaleString()}</span>}
              {r.critical > 0 && <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><Dot className="bg-red-500" />{r.critical.toLocaleString()}</span>}
              {r.unknown > 0 && <span className="flex items-center gap-1 text-slate-400"><Dot className="bg-slate-400" />{r.unknown.toLocaleString()}</span>}
            </div>
          </button>
        );
      })}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-brand-50 to-white dark:from-brand-950/40 dark:to-slate-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="h-[22px] w-[22px] rounded-md bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center">
            <Icon name="cloud" size={14} className="text-brand-600 dark:text-brand-300" />
          </span>
          {agg.totals.healthPercent !== null && (
            <span className="text-xs font-semibold tabular-nums text-brand-700 dark:text-brand-300">{agg.totals.healthPercent}%</span>
          )}
        </div>
        <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white leading-tight">{agg.totals.total.toLocaleString()}</div>
        <div className="text-xs text-slate-400 dark:text-slate-500 mb-2">total environments</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Dot className="bg-emerald-500" />{agg.totals.healthy.toLocaleString()} healthy</span>
          {agg.totals.critical > 0 && <span className="flex items-center gap-1 text-red-600 dark:text-red-400"><Dot className="bg-red-500" />{agg.totals.critical.toLocaleString()} failed</span>}
        </div>
      </div>
    </div>
  );
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${className}`} />;
}
