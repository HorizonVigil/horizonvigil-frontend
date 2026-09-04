/**
 * FinOps-category Overview widgets — spend, run rate, budgets, anomalies,
 * optimization opportunities, savings.
 *
 * getCostAnalytics / getOverviewCost accept `connectionIds`; getBudgets /
 * getCostForecast / getCostOptimizationDashboard are org-wide today.
 */
import { BarChart } from '../../charts/BarChart';
import { api } from '../../../lib/api';
import { money, daysAgoISO } from '../../../lib/format';
import { dateRangeToDays } from '../../../lib/filterContext';
import { scopedConnectionId, scopedConnectionIds } from '../../../lib/overview/scope';
import type { WidgetComponent } from '../../../lib/overview/types';
import { KpiValue, ViewAllLink, WidgetAction, WidgetBody, useWidgetQuery } from './shared';

export const CurrentCloudSpendWidget: WidgetComponent = ({ ctx }) => {
  const from = daysAgoISO(dateRangeToDays(ctx.dateRange));
  const query = useWidgetQuery('current-cloud-spend', ctx, async () => {
    const [cost, analytics] = await Promise.all([
      api.getOverviewCost(scopedConnectionIds(ctx.scope)),
      api.getCostAnalytics({ from, region: ctx.region, connectionIds: scopedConnectionIds(ctx.scope) }),
    ]);
    return { mtd: cost.monthToDate, byRegion: analytics.byRegion, total: analytics.totalCost };
  });
  return (
    <WidgetBody query={query} errorLabel="Cloud spend couldn't be loaded." emptyTitle="No cost data yet"
      emptyDescription="Run a cost sync on a connected account." emptyIcon="cost"
      isEmpty={(d) => d.mtd === 0 && d.total === 0}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <div>
            <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{money(d.mtd)}</div>
            <div className="text-xs text-slate-400">month to date</div>
          </div>
          <BarChart data={Object.entries(d.byRegion).sort(([, a], [, b]) => b - a).slice(0, 5).map(([label, value]) => ({ label, value }))} valueFormatter={money} />
          <ViewAllLink to="/finops" label="Open FinOps" />
        </div>
      )}
    </WidgetBody>
  );
};

export const MonthlyRunRateWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('monthly-run-rate', ctx, () => api.getCostForecast({ region: ctx.region }));
  return (
    <WidgetBody query={query} errorLabel="Run rate couldn't be loaded." emptyTitle="No forecast yet"
      emptyIcon="trending-up" isEmpty={(d) => d.projectedTotal === 0 && d.mtdSpend === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <div className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">{money(d.projectedTotal)}</div>
          <div className="text-xs text-slate-400">projected · {money(d.dailyRate)}/day · day {d.daysElapsed} of {d.daysInMonth}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{money(d.mtdSpend)} spent so far</div>
        </div>
      )}
    </WidgetBody>
  );
};

export const CostByServiceWidget: WidgetComponent = ({ ctx }) => {
  const from = daysAgoISO(dateRangeToDays(ctx.dateRange));
  const query = useWidgetQuery('cost-by-service', ctx, () =>
    api.getCostAnalytics({ from, region: ctx.region, connectionIds: scopedConnectionIds(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Cost by service couldn't be loaded." emptyTitle="No cost data yet"
      emptyIcon="cost" isEmpty={(d) => Object.keys(d.byService).length === 0}>
      {(d) => (
        <BarChart data={Object.entries(d.byService).sort(([, a], [, b]) => b - a).slice(0, 6).map(([label, value]) => ({ label, value }))} valueFormatter={money} />
      )}
    </WidgetBody>
  );
};

export const CostByProviderWidget: WidgetComponent = ({ ctx }) => {
  const from = daysAgoISO(dateRangeToDays(ctx.dateRange));
  const query = useWidgetQuery('cost-by-provider', ctx, () =>
    api.getCostAnalytics({ from, region: ctx.region, connectionIds: scopedConnectionIds(ctx.scope) }));
  const providerOf = (accountId: string) => ctx.connections.find((c) => c.id === accountId || c.identifier === accountId)?.provider ?? 'other';
  return (
    <WidgetBody query={query} errorLabel="Cost by provider couldn't be loaded." emptyTitle="No cost data yet"
      emptyIcon="cost" isEmpty={(d) => Object.keys(d.byAccount).length === 0}>
      {(d) => {
        const byProvider: Record<string, number> = {};
        for (const [acct, cost] of Object.entries(d.byAccount)) {
          const p = providerOf(acct);
          byProvider[p] = (byProvider[p] ?? 0) + cost;
        }
        return <BarChart data={Object.entries(byProvider).sort(([, a], [, b]) => b - a).map(([label, value]) => ({ label: label.toUpperCase(), value }))} valueFormatter={money} />;
      }}
    </WidgetBody>
  );
};

export const BudgetStatusWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('budget-status', ctx, () => api.getBudgets({ limit: 8 }));
  return (
    <WidgetBody query={query} errorLabel="Budgets couldn't be loaded." emptyTitle="No budgets set"
      emptyDescription="Create budgets under Cost Management." emptyIcon="target"
      isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {d.items.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 py-2">
              <span className="text-slate-700 dark:text-slate-200 truncate">{b.name}</span>
              <span className={`text-xs font-medium tabular-nums ${b.status === 'exceeded' ? 'text-red-600 dark:text-red-400' : b.status === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {Math.round(b.percentOfLimit)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const CostAnomaliesWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('cost-anomalies', ctx, () =>
    api.getCostAnomalies({ status: 'open', limit: 6, ...(scopedConnectionId(ctx.scope) ? { connectionId: scopedConnectionId(ctx.scope) } : {}) }));
  return (
    <WidgetBody query={query} errorLabel="Cost anomalies couldn't be loaded." emptyTitle="No open anomalies"
      emptyDescription="Spend spikes will surface here." emptyIcon="trending-up"
      isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {d.items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2">
              <span className="text-slate-700 dark:text-slate-200 truncate">{a.service}</span>
              <span className="text-xs font-medium text-red-600 dark:text-red-400 tabular-nums">+{money(a.dollar_impact)} ({Math.round(a.percent_change)}%)</span>
            </li>
          ))}
          <li className="pt-2"><WidgetAction ctx={ctx} need="cost.optimize" label="Review anomalies" to="/finops?section=Cost+Optimization&tab=Cost+Anomalies" /></li>
        </ul>
      )}
    </WidgetBody>
  );
};

export const OptimizationOpportunitiesWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('optimization-opportunities', ctx, async () => {
    const [dash, recs] = await Promise.all([
      api.getCostOptimizationDashboard(),
      api.getSavingsOpportunities({ status: 'open', limit: 5, ...(scopedConnectionId(ctx.scope) ? { connectionId: scopedConnectionId(ctx.scope) } : {}) }),
    ]);
    return { dash, recs: recs.items };
  });
  return (
    <WidgetBody query={query} errorLabel="Opportunities couldn't be loaded." emptyTitle="No open recommendations"
      emptyIcon="optimization" isEmpty={(d) => d.recs.length === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <span className="text-lg font-semibold text-slate-900 dark:text-white">{d.dash.openRecommendations}</span> open ·
            <span className="text-emerald-600 dark:text-emerald-400 font-medium"> {money(d.dash.totalPotentialMonthlySavings)}/mo</span> potential
          </div>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {d.recs.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 py-1.5">
                <span className="text-slate-600 dark:text-slate-300 truncate">{r.issue}</span>
                <span className="text-emerald-600 dark:text-emerald-400 shrink-0 tabular-nums">{money(r.potential_monthly_savings)}</span>
              </li>
            ))}
          </ul>
          <WidgetAction ctx={ctx} need="cost.optimize" label="Open Cost Optimization" to="/finops?section=Cost+Optimization" />
        </div>
      )}
    </WidgetBody>
  );
};

export const PotentialSavingsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('potential-savings', ctx, async () => {
    const [dash, idle] = await Promise.all([
      api.getCostOptimizationDashboard(),
      api.getIdleResources({ status: 'open', limit: 1, connectionId: scopedConnectionId(ctx.scope) }),
    ]);
    return { savings: dash.totalPotentialMonthlySavings, idle: idle.pagination.total };
  });
  return (
    <WidgetBody query={query} errorLabel="Savings couldn't be loaded." emptyTitle="No savings identified yet"
      emptyIcon="optimization" isEmpty={() => false}>
      {(d) => (
        <div className="flex flex-col gap-1">
          <div className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(d.savings)}</div>
          <div className="text-xs text-slate-400">potential monthly savings</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{d.idle} idle resources</div>
        </div>
      )}
    </WidgetBody>
  );
};

// ── KPIs ──────────────────────────────────────────────────────────────────

export const CloudSpendKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-cloud-spend', ctx, () => api.getOverviewCost(scopedConnectionIds(ctx.scope)));
  return <KpiValue label="Cloud Spend" value={query.data ? money(query.data.monthToDate) : '—'} icon="cost"
    caption="month to date" onClick={() => ctx.navigate('/finops')} />;
};

export const MonthlyRunRateKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-monthly-run-rate', ctx, () => api.getCostForecast({ region: ctx.region }));
  return <KpiValue label="Monthly Run Rate" value={query.data ? money(query.data.projectedTotal) : '—'} icon="trending-up"
    caption="projected" onClick={() => ctx.navigate('/finops?section=Cost+Management&tab=Forecast')} />;
};

export const PotentialSavingsKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-potential-savings', ctx, () => api.getCostOptimizationDashboard());
  return <KpiValue label="Potential Savings" value={query.data ? money(query.data.totalPotentialMonthlySavings) : '—'} icon="optimization"
    tone="good" caption="per month" onClick={() => ctx.navigate('/finops?section=Cost+Optimization')} />;
};

export const CostAnomaliesKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-cost-anomalies', ctx, () => api.getCostAnomalies({ status: 'open', limit: 1, connectionId: scopedConnectionId(ctx.scope) }));
  const n = query.data?.pagination.total ?? 0;
  return <KpiValue label="Cost Anomalies" value={query.data ? String(n) : '—'} icon="trending-up"
    tone={n > 0 ? 'warning' : 'good'} caption={n > 0 ? 'open' : 'none open'}
    onClick={() => ctx.navigate('/finops?section=Cost+Optimization&tab=Cost+Anomalies')} />;
};

export const BudgetStatusKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-budget-status', ctx, () => api.getBudgets({ limit: 50 }));
  const worst = query.data?.items.reduce<number>((m, b) => Math.max(m, b.percentOfLimit), 0) ?? 0;
  const exceeded = query.data?.items.some((b) => b.status === 'exceeded');
  return <KpiValue label="Budget Status" value={query.data && query.data.items.length > 0 ? `${Math.round(worst)}%` : '—'} icon="target"
    tone={exceeded ? 'critical' : worst >= 80 ? 'warning' : 'good'}
    caption={query.data?.items.length ? 'worst budget' : 'no budgets'} onClick={() => ctx.navigate('/finops?section=Cost+Management&tab=Budgets')} />;
};
