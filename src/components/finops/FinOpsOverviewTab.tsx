/**
 * FinOps → Overview — the command center (spec §8–9). Composed on the
 * frontend from the same endpoints Cost Management / Cost Optimization
 * already use — no new backend calls. Every section degrades independently
 * on error (spec §50) and the whole tab has an honest empty state when
 * nothing is connected yet (spec §51).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StatCard } from '../StatCard';
import { StatCardSkeleton, CardSkeleton } from '../Skeleton';
import { Icon } from '../icons';
import { useFilters, dateRangeToDays } from '../../lib/filterContext';
import { api } from '../../lib/api';
import { money } from '../../lib/format';
import { SectionBoundary } from '../cloudAccounts/overview/primitives';
import {
  rangeToFromTo,
  aggregateDaily,
  costByCloudBars,
  summarizeBudgets,
  optimizationByCategory,
  type Provider,
} from '../../lib/finops/overview';
import { CostTrendPanel, CostByCloudPanel, CostByAccountPanel, CostByServicePanel, BudgetForecastPanel, AnomaliesPanel, OptimizationPanel } from './finopsPanels';

const ok = <T,>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);

export function FinOpsOverviewTab() {
  const { region, account, dateRange, refreshToken, connections } = useFilters();
  const [provider, setProvider] = useState<Provider | null>(null);

  // getCostAnalytics accepts a `connectionIds` list, so the Cloud filter can
  // properly scope service/account/region breakdowns to a whole provider
  // (not just the single-account FilterBar selection). getCostExplorer,
  // getCostAnomalies and getSavingsOpportunities only take one connectionId
  // each, so the Cloud filter can't narrow the trend/anomalies/savings
  // panels the same way -- those stay at whatever the Account filter picked.
  const providerConnectionIds = useMemo(
    () => (provider ? connections.filter((c) => c.provider === provider).map((c) => c.id) : undefined),
    [provider, connections],
  );

  const query = useQuery({
    queryKey: ['finops', 'overview', refreshToken, region, account, dateRange, provider],
    queryFn: async () => {
      const connectionId = account === 'all' ? undefined : account;
      const regionParam = region === 'all' ? undefined : region;
      const { from, to } = rangeToFromTo(dateRange);
      const analyticsConnectionIds = connectionId ? [connectionId] : providerConnectionIds;

      const [cost, analytics, allProvidersAnalytics, forecast, explorer, budgets, optDash, anomalies, savings] = await Promise.allSettled([
        api.getOverviewCost(analyticsConnectionIds),
        api.getCostAnalytics({ from, to, region: regionParam, connectionIds: analyticsConnectionIds }),
        // Always org-wide (ignores the Cloud filter) -- this is the one feeding
        // the provider-comparison cards, which need every provider's total
        // visible at once so clicking a *different* one still shows a number.
        provider ? api.getCostAnalytics({ from, to, region: regionParam }) : Promise.resolve(null),
        api.getCostForecast({ region: regionParam }),
        api.getCostExplorer({ connectionId, region: regionParam, from, to, limit: 200 }),
        api.getBudgets({ limit: 200 }),
        api.getCostOptimizationDashboard(),
        api.getCostAnomalies({ connectionId, limit: 200 }),
        api.getSavingsOpportunities({ connectionId, status: 'open', limit: 200 }),
      ]);

      const scopedAnalytics = ok(analytics);
      return {
        cost: ok(cost),
        analytics: scopedAnalytics,
        analyticsError: analytics.status === 'rejected',
        // When no Cloud filter is active, the scoped call already is the
        // all-providers view -- no need for a second request.
        allProvidersByAccount: (provider ? ok(allProvidersAnalytics) : scopedAnalytics)?.byAccount ?? {},
        forecast: ok(forecast),
        daily: ok(explorer) ? aggregateDaily(ok(explorer)!.items) : [],
        dailyError: explorer.status === 'rejected',
        budgets: ok(budgets)?.items ?? [],
        optDash: ok(optDash),
        anomalies: ok(anomalies)?.items ?? [],
        savings: ok(savings)?.items ?? [],
        fetchedAt: Date.now(),
      };
    },
    staleTime: 60_000,
  });

  const providerBars = useMemo(
    () => costByCloudBars(query.data?.allProvidersByAccount ?? {}, connections),
    [query.data?.allProvidersByAccount, connections],
  );
  const budgetRollup = useMemo(() => summarizeBudgets(query.data?.budgets ?? []), [query.data?.budgets]);
  const optCategoryBars = useMemo(() => optimizationByCategory(query.data?.savings ?? []), [query.data?.savings]);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-6 text-center">
        <Icon name="alert-triangle" size={20} className="mx-auto text-red-500 mb-2" />
        <p className="text-sm text-red-700 dark:text-red-300">Couldn't load the FinOps overview.</p>
        <button onClick={() => query.refetch()} className="mt-3 text-xs font-medium text-red-700 dark:text-red-300 underline">Retry</button>
      </div>
    );
  }

  const d = query.data;

  if (connections.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-20">
        <div className="h-14 w-14 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
          <Icon name="cost" size={24} className="text-brand-600 dark:text-brand-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Connect a cloud environment to start analyzing cost</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">AWS, Azure and GCP accounts connected under Cloud Accounts show up here automatically once cost sync has run.</p>
      </div>
    );
  }

  const totalCost = d.analytics?.totalCost ?? 0;
  const hasAnyBilling = totalCost > 0 || d.budgets.length > 0 || (d.cost?.monthToDate ?? 0) > 0;
  const dailyLast = d.daily.at(-1)?.cost ?? 0;
  const anomalyCount = d.anomalies.filter((a) => a.status === 'open').length;

  return (
    <div className="flex flex-col gap-5">
      {!hasAnyBilling && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Cloud connected successfully — cost data isn't available yet. Open an AWS or Azure account (Cloud Accounts → Account Inventory) and click "Sync Cost."
          {connections.some((c) => c.provider === 'gcp') && ' GCP cost tracking isn’t built yet — GCP projects won’t show cost here regardless of sync.'}
        </div>
      )}

      {/* KPI strip (spec §9) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Spend (MTD)" value={money(d.cost?.monthToDate ?? d.forecast?.mtdSpend ?? 0)} icon="cost" />
        <StatCard label="Daily Spend" value={money(dailyLast)} icon="chart-line" caption="most recent day" />
        <StatCard label="Forecast" value={money(d.forecast?.projectedTotal ?? 0)} icon="trending-up" caption="month-end estimate" />
        <StatCard
          label="Budget Used"
          value={budgetRollup.usedPercent === null ? '—' : `${budgetRollup.usedPercent}%`}
          icon="target"
          iconTone={budgetRollup.worst === 'exceeded' ? 'critical' : budgetRollup.worst === 'warning' ? 'warning' : budgetRollup.worst === 'ok' ? 'good' : 'neutral'}
        />
        <StatCard label="Potential Savings" value={money(d.optDash?.totalPotentialMonthlySavings ?? 0)} icon="optimization" caption="per month" />
        <StatCard label="Cost Anomalies" value={anomalyCount.toLocaleString()} icon="alert-triangle" iconTone={anomalyCount > 0 ? 'warning' : 'neutral'} caption="active" />
      </div>

      <SectionBoundary name="cost by cloud">
        <CostByCloudPanel bars={providerBars} activeFilter={provider} onSelect={setProvider} />
      </SectionBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionBoundary name="cost trend"><CostTrendPanel daily={d.daily} error={d.dailyError} /></SectionBoundary>
        <SectionBoundary name="cost by service"><CostByServicePanel byService={d.analytics?.byService ?? {}} /></SectionBoundary>
      </div>

      <SectionBoundary name="cost by account">
        <CostByAccountPanel byAccount={d.analytics?.byAccount ?? {}} connections={connections} />
      </SectionBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionBoundary name="budget and forecast">
          <BudgetForecastPanel rollup={budgetRollup} budgets={d.budgets} forecast={d.forecast} />
        </SectionBoundary>
        <SectionBoundary name="cost anomalies">
          <AnomaliesPanel anomalies={d.anomalies} connections={connections} />
        </SectionBoundary>
      </div>

      <SectionBoundary name="optimization opportunities">
        <OptimizationPanel potentialMonthly={d.optDash?.totalPotentialMonthlySavings ?? 0} categoryBars={optCategoryBars} topOpportunities={d.savings} />
      </SectionBoundary>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 text-right">
        Updated {new Date(d.fetchedAt).toLocaleTimeString()} · {dateRangeToDays(dateRange)}-day window
        {provider ? ` · filtered to ${provider.toUpperCase()}` : ''}
      </p>
    </div>
  );
}
