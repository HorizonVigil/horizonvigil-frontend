import { useNavigate } from 'react-router-dom';
import { Donut } from '../charts/Donut';
import { BarChart } from '../charts/BarChart';
import { LineChart } from '../charts/LineChart';
import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { Icon } from '../icons';
import { money } from '../../lib/format';
import { SectionCard, MiniStat } from '../cloudAccounts/overview/primitives';
import { ProviderMark } from '../cloudAccounts/overview/ProviderMark';
import type { Provider } from '../../lib/finops/overview';
import {
  costByCloudBars,
  costByAccountBars,
  recordToBars,
  summarizeBudgets,
  optimizationByCategory,
  anomalySeverity,
  sortAnomalies,
  type BudgetRollup,
} from '../../lib/finops/overview';
import type { Budget, CostAnomaly, CostRecommendation } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';
import type { BarDatum } from '../charts/BarChart';

/** Spec §11 — cost trend over the selected window. */
export function CostTrendPanel({ daily, error }: { daily: { date: string; cost: number }[]; error?: boolean }) {
  return (
    <SectionCard title="Cost Trend" icon="chart-area">
      {error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">Couldn't load the cost trend.</p>
      ) : daily.length === 0 ? (
        <EmptyState icon="chart-line" title="No cost data yet" description="Sync cost on a connected AWS or Azure account." />
      ) : (
        <LineChart series={[{ label: 'Daily Cost', points: daily.map((d) => ({ x: d.date, y: d.cost })) }]} valueFormatter={money} height={220} />
      )}
    </SectionCard>
  );
}

/** Spec §10/§12 — cost by cloud, as clickable provider cards (mirrors Cloud Accounts' provider cards). */
export function CostByCloudPanel({
  bars,
  activeFilter,
  onSelect,
}: {
  bars: BarDatum[];
  activeFilter: Provider | null;
  onSelect: (p: Provider | null) => void;
}) {
  const total = bars.reduce((s, b) => s + b.value, 0);
  return (
    <SectionCard title="Cost by Cloud" icon="cloud">
      {bars.length === 0 ? (
        <EmptyState icon="cloud" title="No cost data yet" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {bars.map((b) => {
            const p = (b.label === 'AWS' ? 'aws' : b.label === 'Azure' ? 'azure' : 'gcp') as Provider;
            const active = activeFilter === p;
            const pct = total > 0 ? Math.round((b.value / total) * 100) : 0;
            return (
              <button
                key={b.label}
                type="button"
                onClick={() => onSelect(active ? null : p)}
                className={`rounded-lg border p-3 text-left transition-colors ${active ? 'border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <ProviderMark provider={p} size={18} />
                  <span className="text-xs text-slate-400 tabular-nums">{pct}%</span>
                </div>
                <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{money(b.value)}</div>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/** Spec §13 — cost by account/subscription/project, top 10. */
export function CostByAccountPanel({ byAccount, connections }: { byAccount: Record<string, number>; connections: UnifiedAccountRow[] }) {
  const bars = costByAccountBars(byAccount, connections, 10);
  return (
    <SectionCard title="Cost by Account" icon="building">
      {bars.length === 0 ? <EmptyState icon="building" title="No cost data yet" /> : <BarChart data={bars} valueFormatter={money} />}
    </SectionCard>
  );
}

/** Spec §14 — cost by service. */
export function CostByServicePanel({ byService }: { byService: Record<string, number> }) {
  const bars = recordToBars(byService, 8);
  return (
    <SectionCard title="Cost by Service" icon="chart-bar">
      {bars.length === 0 ? (
        <EmptyState icon="chart-bar" title="No cost data yet" />
      ) : (
        <Donut data={bars.map((b) => ({ label: b.label, value: b.value }))} showPercent size={150} />
      )}
    </SectionCard>
  );
}

/** Spec §19/§20 — budget status + forecast, one combined panel. */
export function BudgetForecastPanel({
  rollup,
  budgets,
  forecast,
}: {
  rollup: BudgetRollup;
  budgets: Budget[];
  forecast: { mtdSpend: number; projectedTotal: number } | null;
}) {
  const navigate = useNavigate();
  const barColor = rollup.worst === 'exceeded' ? 'bg-red-500' : rollup.worst === 'warning' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <SectionCard title="Budget &amp; Forecast" icon="target" onLinkClick={() => navigate('/finops?section=Cost+Management&tab=Budgets')} linkLabel="Budgets">
      {rollup.count === 0 ? (
        <EmptyState icon="target" title="No budgets set" description="Set a monthly limit to track spend against it here." />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-6">
            <MiniStat label="Budget used" value={rollup.usedPercent === null ? '—' : `${rollup.usedPercent}%`} tone={rollup.worst === 'exceeded' ? 'critical' : rollup.worst === 'warning' ? 'warning' : 'good'} />
            <MiniStat label="Spend" value={money(rollup.totalSpend)} />
            <MiniStat label="Forecast" value={money(rollup.totalForecast)} />
            <MiniStat label="Remaining" value={money(Math.max(0, rollup.totalLimit - rollup.totalSpend))} />
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${Math.min(100, rollup.usedPercent ?? 0)}%` }} />
          </div>
          {(rollup.exceededCount > 0 || rollup.warningCount > 0) && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {rollup.exceededCount > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{rollup.exceededCount} exceeded</span>}
              {rollup.exceededCount > 0 && rollup.warningCount > 0 && ' · '}
              {rollup.warningCount > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium">{rollup.warningCount} at risk</span>}
              {' '}of {rollup.count} budget{rollup.count === 1 ? '' : 's'}
            </p>
          )}
          {forecast && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Org-wide forecast (linear estimate): {money(forecast.mtdSpend)} spent so far → {money(forecast.projectedTotal)} projected month-end.
            </p>
          )}
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {budgets.slice(0, 4).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span className="text-slate-600 dark:text-slate-300 truncate">{b.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">{money(b.currentSpend)} / {money(b.monthly_limit)}</span>
                  <Badge tone={b.status === 'exceeded' ? 'critical' : b.status === 'warning' ? 'warning' : 'good'}>{b.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

/** Spec §21 — cost anomalies, most impactful first. */
export function AnomaliesPanel({ anomalies, connections }: { anomalies: CostAnomaly[]; connections: UnifiedAccountRow[] }) {
  const navigate = useNavigate();
  const sorted = sortAnomalies(anomalies).slice(0, 6);
  const nameOf = (connectionId: string) => connections.find((c) => c.id === connectionId)?.name ?? connectionId;
  return (
    <SectionCard title="Cost Anomalies" icon="alert-triangle" onLinkClick={() => navigate('/finops?section=Cost+Optimization&tab=Cost+Anomalies')} linkLabel="All anomalies">
      {sorted.length === 0 ? (
        <EmptyState icon="check-circle" title="No open anomalies" description="Day-over-day service cost spikes over 50% show up here." />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {sorted.map((a) => {
            const sev = anomalySeverity(a.percent_change);
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${sev === 'critical' ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'}`}>
                    <Icon name="alert-triangle" size={12} />
                  </span>
                  <span className="min-w-0 truncate">
                    <span className="text-slate-700 dark:text-slate-200 font-medium">{nameOf(a.connection_id)}</span>
                    <span className="text-slate-400 dark:text-slate-500"> · {a.service} +{Math.round(a.percent_change)}%</span>
                  </span>
                </span>
                <span className="text-xs font-medium text-red-600 dark:text-red-400 tabular-nums shrink-0">+{money(a.dollar_impact)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/** Spec §22/§27 — optimization opportunities by category + top items. */
export function OptimizationPanel({
  potentialMonthly,
  categoryBars,
  topOpportunities,
}: {
  potentialMonthly: number;
  categoryBars: BarDatum[];
  topOpportunities: CostRecommendation[];
}) {
  const navigate = useNavigate();
  return (
    <SectionCard title="Optimization Opportunities" icon="optimization" onLinkClick={() => navigate('/finops?section=Cost+Optimization')} linkLabel="Cost Optimization">
      {categoryBars.length === 0 ? (
        <EmptyState icon="optimization" title="No open recommendations" />
      ) : (
        <div className="flex flex-col gap-3">
          <MiniStat label="Potential monthly savings" value={money(potentialMonthly)} tone="good" />
          <BarChart data={categoryBars} valueFormatter={money} />
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 pt-1">
            {topOpportunities.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                <span className="text-slate-600 dark:text-slate-300 truncate">{r.issue}</span>
                <span className="tabular-nums font-medium text-emerald-600 dark:text-emerald-400 shrink-0">{money(r.potential_monthly_savings)}/mo</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
