import { Donut } from '../../charts/Donut';
import { StackedBar } from '../../charts/StackedBar';
import { EmptyState } from '../../EmptyState';
import { SectionCard } from './primitives';
import {
  healthDonutSlices,
  providerHealthRows,
  type OverviewAggregate,
} from '../../../lib/cloudAccounts/overview';

/**
 * Spec §9 — overall cloud-environment health as a donut. Clicking a segment
 * drills into that health state (Health tab, pre-filtered).
 */
export function CloudHealthDonut({
  agg,
  onDrill,
}: {
  agg: OverviewAggregate;
  onDrill: (state: string) => void;
}) {
  const slices = healthDonutSlices(agg.totals);
  const pct = agg.totals.healthPercent;
  return (
    <SectionCard title="Cloud Environment Health" icon="gauge" to="/cloud-accounts?tab=Health" linkLabel="Health">
      {agg.totals.total === 0 ? (
        <EmptyState icon="cloud" title="No environments to rate" />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <Donut
            data={slices}
            size={150}
            thickness={22}
            showPercent
            centerLabel={{ value: pct === null ? '—' : `${pct}%`, caption: 'healthy' }}
          />
          <ul className="flex flex-col gap-1.5 text-xs w-full sm:w-auto">
            {slices.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => onDrill(s.label.toLowerCase())}
                  className="flex w-full items-center justify-between gap-4 rounded-md px-2 py-1 -mx-2 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                >
                  <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                  <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">{s.value.toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Spec §10 — AWS vs Azure vs GCP health, one comparable stacked bar each.
 */
export function ProviderHealthComparison({
  agg,
  onDrill,
}: {
  agg: OverviewAggregate;
  onDrill: (state: string) => void;
}) {
  const rows = providerHealthRows(agg);
  return (
    <SectionCard title="Provider Health Comparison" icon="chart-bar">
      {rows.length === 0 ? (
        <EmptyState icon="cloud" title="No providers connected" />
      ) : (
        <StackedBar rows={rows} height={14} onSegmentClick={(label) => onDrill(label.toLowerCase())} />
      )}
    </SectionCard>
  );
}
