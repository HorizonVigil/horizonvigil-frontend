import { useCallback, useMemo } from 'react';
import { Donut } from '../../charts/Donut';
import { StackedBar } from '../../charts/StackedBar';
import { EmptyState } from '../../EmptyState';
import { SectionCard } from './primitives';
import {
  healthDonutSlices,
  providerHealthRows,
  type OverviewAggregate,
} from '../../../lib/cloudAccounts/overview';

interface CloudHealthDonutProps {
  agg: OverviewAggregate;
  onDrill: (state: string) => void;
}

interface ProviderHealthComparisonProps {
  agg: OverviewAggregate;
  onDrill: (state: string) => void;
}

const HEALTH_ROUTE = '/cloud-accounts?tab=Health';

function normalizeNonNegative(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return value;
}

function normalizePercent(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.min(100, Math.max(0, value));
}

function normalizeLabel(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toDrillState(label: string): string {
  return normalizeLabel(label).toLowerCase();
}

/**
 * Spec §9 — overall cloud-environment health.
 *
 * The donut visualizes the health distribution supplied by the overview
 * domain layer. The legend provides keyboard-accessible drill-down controls.
 *
 * This component does not calculate health itself and does not infer missing
 * provider/environment state.
 */
export function CloudHealthDonut({
  agg,
  onDrill,
}: CloudHealthDonutProps) {
  const slices = useMemo(
    () => healthDonutSlices(agg.totals),
    [agg.totals],
  );

  const total = normalizeNonNegative(agg.totals.total);
  const healthPercent = normalizePercent(
    agg.totals.healthPercent,
  );

  const handleDrill = useCallback(
    (label: string) => {
      const state = toDrillState(label);

      if (!state) {
        return;
      }

      onDrill(state);
    },
    [onDrill],
  );

  return (
    <SectionCard
      title="Cloud Environment Health"
      icon="gauge"
      to={HEALTH_ROUTE}
      linkLabel="Health"
    >
      {total === 0 ? (
        <EmptyState
          icon="cloud"
          title="No environments to rate"
        />
      ) : (
        <div className="flex min-w-0 flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <div
            className="shrink-0"
            aria-label={
              healthPercent === null
                ? 'Cloud environment health is unavailable'
                : `Cloud environment health: ${healthPercent}% healthy`
            }
          >
            <Donut
              data={slices}
              size={150}
              thickness={22}
              showPercent
              centerLabel={{
                value:
                  healthPercent === null
                    ? '—'
                    : `${healthPercent}%`,
                caption: 'healthy',
              }}
            />
          </div>

          {slices.length > 0 ? (
            <ul
              className="flex w-full min-w-0 flex-col gap-1.5 text-xs sm:w-auto"
              aria-label="Cloud health breakdown"
            >
              {slices.map((slice, index) => {
                const label = normalizeLabel(slice.label);
                const value = normalizeNonNegative(slice.value);
                const drillState = toDrillState(label);

                if (!label) {
                  return null;
                }

                return (
                  <li
                    key={`${label || 'health'}-${index}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleDrill(label)}
                      disabled={!drillState}
                      aria-label={`View ${label} health: ${value.toLocaleString()}`}
                      className={[
                        'mx-[-0.5rem] flex w-[calc(100%+1rem)]',
                        'items-center justify-between gap-4 rounded-md',
                        'px-2 py-1 text-left transition-colors',
                        'focus:outline-none focus-visible:ring-2',
                        'focus-visible:ring-brand-500',
                        'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      ].join(' ')}
                    >
                      <span className="min-w-0 truncate text-slate-500 dark:text-slate-400">
                        {label}
                      </span>

                      <span className="shrink-0 tabular-nums font-medium text-slate-700 dark:text-slate-200">
                        {value.toLocaleString()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p
              role="status"
              className="text-xs text-slate-500 dark:text-slate-400"
            >
              Health breakdown is unavailable.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Spec §10 — AWS vs Azure vs GCP provider health comparison.
 *
 * Each provider row is normalized by the shared StackedBar component so the
 * health distribution can be compared consistently across providers.
 *
 * Clicking a segment drills into the corresponding health state.
 */
export function ProviderHealthComparison({
  agg,
  onDrill,
}: ProviderHealthComparisonProps) {
  const rows = useMemo(
    () => providerHealthRows(agg),
    [agg],
  );

  const handleDrill = useCallback(
    (label: string) => {
      const state = toDrillState(label);

      if (!state) {
        return;
      }

      onDrill(state);
    },
    [onDrill],
  );

  return (
    <SectionCard
      title="Provider Health Comparison"
      icon="chart-bar"
    >
      {rows.length === 0 ? (
        <EmptyState
          icon="cloud"
          title="No providers connected"
        />
      ) : (
        <StackedBar
          rows={rows}
          height={14}
          onSegmentClick={handleDrill}
        />
      )}
    </SectionCard>
  );
}