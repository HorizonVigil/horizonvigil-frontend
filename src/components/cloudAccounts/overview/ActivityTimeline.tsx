import { useMemo, useState } from 'react';
import { EmptyState } from '../../EmptyState';
import { formatActivityAction, formatDate } from '../../../lib/format';
import { ProviderMark } from './ProviderMark';
import { SectionCard } from './primitives';
import { activityCategory, PROVIDER_LABEL, type TimelineEntry } from '../../../lib/cloudAccounts/overview';

const FILTERS = ['all', 'accounts', 'resources', 'security', 'connections', 'cost', 'configuration'] as const;
type Filter = (typeof FILTERS)[number];

/** Spec §21 — recent cloud changes as a timeline, with category filter chips. */
export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all');

  const shown = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => activityCategory(e.action) === filter)),
    [entries, filter],
  );

  return (
    <SectionCard title="Recent Cloud Activity" icon="activity" to="/cloud-accounts?tab=Activity" linkLabel="Activity">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`text-[11px] rounded-full px-2 py-0.5 capitalize border ${
              filter === f
                ? 'border-brand-300 dark:border-brand-600 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="activity" title={filter === 'all' ? 'No recent activity' : `No ${filter} activity`} />
      ) : (
        <ul className="flex flex-col">
          {shown.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2 border-l-2 border-slate-100 dark:border-slate-800 pl-3 -ml-px">
              <ProviderMark provider={e.provider} size={16} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{formatActivityAction(e.action)}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {PROVIDER_LABEL[e.provider]}
                  {e.actorEmail ? ` · ${e.actorEmail}` : ''} · {formatDate(e.occurredAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
