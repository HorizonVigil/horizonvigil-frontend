import { useMemo, useState } from 'react';
import { EmptyState } from '../../EmptyState';
import { formatActivityAction, formatDate } from '../../../lib/format';
import { ProviderMark } from './ProviderMark';
import { SectionCard } from './primitives';
import {
  activityCategory,
  PROVIDER_LABEL,
  type TimelineEntry,
} from '../../../lib/cloudAccounts/overview';

const FILTERS = [
  'all',
  'accounts',
  'resources',
  'security',
  'connections',
  'cost',
  'configuration',
] as const;

type Filter = (typeof FILTERS)[number];

interface ActivityTimelineProps {
  entries: TimelineEntry[];
}

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  accounts: 'Accounts',
  resources: 'Resources',
  security: 'Security',
  connections: 'Connections',
  cost: 'Cost',
  configuration: 'Configuration',
};

function getFilterLabel(filter: Filter): string {
  return FILTER_LABELS[filter];
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getEntryKey(entry: TimelineEntry, index: number): string {
  const id = normalizeText(entry.id);

  return id ? `activity-${id}` : `activity-fallback-${index}`;
}

function getActorLabel(entry: TimelineEntry): string {
  const actorEmail = normalizeText(entry.actorEmail);

  return actorEmail ? ` · ${actorEmail}` : '';
}

/**
 * Spec §21 — recent cloud changes displayed as a filterable timeline.
 *
 * Production behavior:
 * - Preserves the existing activity categories and filtering semantics.
 * - Uses real buttons for keyboard-accessible filter controls.
 * - Exposes the active filter through `aria-pressed`.
 * - Handles empty/malformed IDs without relying on undefined React keys.
 * - Keeps activity content read-only; this component does not mutate cloud state.
 * - Uses the shared provider/category formatting and visual primitives.
 */
export function ActivityTimeline({
  entries,
}: ActivityTimelineProps) {
  const [filter, setFilter] = useState<Filter>('all');

  const safeEntries = useMemo(
    () => (Array.isArray(entries) ? entries : []),
    [entries],
  );

  const shown = useMemo(() => {
    if (filter === 'all') {
      return safeEntries;
    }

    return safeEntries.filter(
      (entry) => activityCategory(entry.action) === filter,
    );
  }, [safeEntries, filter]);

  const activeFilterLabel = getFilterLabel(filter);

  return (
    <SectionCard
      title="Recent Cloud Activity"
      icon="activity"
      to="/cloud-accounts?tab=Activity"
      linkLabel="Activity"
    >
      <div
        className="mb-3 flex flex-wrap gap-1.5"
        role="group"
        aria-label="Filter recent cloud activity"
      >
        {FILTERS.map((currentFilter) => {
          const isActive = filter === currentFilter;
          const label = getFilterLabel(currentFilter);

          return (
            <button
              key={currentFilter}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(currentFilter)}
              className={[
                'rounded-full border px-2 py-0.5 text-[11px] capitalize',
                'transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                'focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900',
                isActive
                  ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-600 dark:bg-brand-950/40 dark:text-brand-300'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="activity"
          title={
            filter === 'all'
              ? 'No recent activity'
              : `No ${activeFilterLabel.toLowerCase()} activity`
          }
        />
      ) : (
        <ul
          className="flex flex-col"
          aria-label={
            filter === 'all'
              ? 'Recent cloud activity'
              : `${activeFilterLabel} cloud activity`
          }
        >
          {shown.map((entry, index) => {
            const providerLabel =
              PROVIDER_LABEL[entry.provider] ?? 'Unknown provider';
            const actionLabel = formatActivityAction(entry.action);
            const actorLabel = getActorLabel(entry);
            const occurredAt = formatDate(entry.occurredAt);

            return (
              <li
                key={getEntryKey(entry, index)}
                className={[
                  'flex items-start gap-3 border-l-2 border-slate-100',
                  'py-2 pl-3 -ml-px',
                  'dark:border-slate-800',
                ].join(' ')}
              >
                <div
                  className="shrink-0 pt-0.5"
                  aria-hidden="true"
                >
                  <ProviderMark
                    provider={entry.provider}
                    size={16}
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm text-slate-700 dark:text-slate-200"
                    title={actionLabel}
                  >
                    {actionLabel}
                  </p>

                  <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                    <span>{providerLabel}</span>
                    {actorLabel ? <span>{actorLabel}</span> : null}
                    {occurredAt ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <time dateTime={entry.occurredAt}>
                          {occurredAt}
                        </time>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}