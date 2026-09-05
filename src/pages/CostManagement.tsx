import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { StatCard } from '../components/StatCard';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { useFilters, dateRangeToDays, type DateRangePreset } from '../lib/filterContext';
import { useOrg } from '../lib/orgContext';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type ActivityEntry, type Budget, type BudgetScopeType, type CostAllocation, type CostSnapshot, type ResourceCostRow } from '../lib/api';
import { money } from '../lib/format';
import type { ResolvedGroupFilter } from '../lib/finops/groupFilter';
import { PROVIDER_LABEL } from '../lib/finops/overview';

const STATUS_TONE = { ok: 'good', warning: 'warning', exceeded: 'critical' } as const;

// A few common cost-allocation tag keys to suggest — there's no backend
// endpoint anymore that lists which tag keys are actually active for an
// org, so this is just a typeahead starting point (free text still works).
const TAG_KEY_SUGGESTIONS = ['CostCenter', 'Environment', 'Team', 'Project'];

const TABS = ['Cost Explorer', 'Cost Analytics', 'Forecast', 'Budgets', 'Cost Allocation', 'Cost by Resource', 'Chargeback', 'Showback', 'Cost Reports'] as const;
type Tab = typeof TABS[number];

/** Converts the FilterBar's day-count preset into ISO from/to dates for the cost-management-api's date-scoped endpoints. */
function rangeToFromTo(range: DateRangePreset): { from: string; to: string } {
  const days = dateRangeToDays(range);
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function aggregateDaily(rows: CostSnapshot[]): { date: string; cost: number }[] {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.usage_date, (byDate.get(r.usage_date) ?? 0) + Number(r.unblended_cost));
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, cost]) => ({ date, cost }));
}

/** Cost Management section of FinOps — unchanged from when this was its own top-level page, minus its own FilterBar (FinOps.tsx renders one shared bar for all three sections now). */
export function CostManagementBody({ groupFilter }: { groupFilter: ResolvedGroupFilter }) {
  // Account + Region filters live in the global FilterBar now.
  const { region, account, dateRange, refreshToken, connections } = useFilters();
  // The single-account FilterBar selection takes precedence when set; the
  // Cloud/Environment group filter only narrows anything when Account is
  // "all". getCostAnalytics takes a real connectionIds list, so that one is
  // scoped server-side; getCostExplorer only takes a single connectionId, so
  // its rows are fetched unscoped and filtered client-side by connection_id.
  const groupIds = account === 'all' ? groupFilter.connectionIds : undefined;
  const groupFilterActive = Boolean(groupFilter.provider || groupFilter.environment !== 'all');
  const { currentOrg, folders, projects } = useOrg();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canSeeTab = useSubmenuAccess('cost');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Cost Explorer');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [budgetActionError, setBudgetActionError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const allocationRequestRef = useRef(0);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetDeletingId, setBudgetDeletingId] = useState<string | null>(null);
  const [csvDownloading, setCsvDownloading] = useState(false);

  // A direct ?tab= URL (or a permission revoked mid-session) could still
  // request a tab this role/override no longer permits -- the tab bar below
  // only ever renders visibleTabs, so falling back here keeps `tab` in sync
  // with what's actually clickable instead of silently rendering restricted
  // content behind a tab nothing links to anymore.
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof api.getCostAnalytics>> | null>(null);
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof api.getCostForecast>> | null>(null);
  const [daily, setDaily] = useState<{ date: string; cost: number }[]>([]);

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetName, setBudgetName] = useState('');
  const [budgetScopeType, setBudgetScopeType] = useState<BudgetScopeType>('org');
  const [budgetScopeId, setBudgetScopeId] = useState('');
  const [budgetMonthlyLimit, setBudgetMonthlyLimit] = useState('');
  const [budgetThresholds, setBudgetThresholds] = useState('50,80,100');
  const [budgetError, setBudgetError] = useState('');

  const loadBudgets = useCallback(async () => {
    try {
      const { items } = await api.getBudgets({ limit: 200 });
      setBudgets(items);
    } catch (err) {
      setBudgetActionError(
        err instanceof Error ? err.message : 'Could not load budgets.',
      );
    }
  }, []);


  useEffect(() => { void loadBudgets(); }, [loadBudgets, refreshToken]);

  // Cost Reports' "Recent Cost Activity" — real audit_log entries already
  // written by budgets.ts/recommendations.ts/anomalies.ts on every mutation
  // (cost_management.budget_*, cost_optimization.recommendation_*,
  // cost_optimization.anomaly_*), read through admin-api's existing
  // org-wide audit log endpoint (no new backend route needed — same one
  // Users & Groups' own Audit Logs tab uses, just filtered to the cost_
  // action prefix). Only fetched while the tab is open.
  const [costActivity, setCostActivity] = useState<ActivityEntry[]>([]);
  const [costActivityLoading, setCostActivityLoading] = useState(false);
  useEffect(() => {
    if (tab !== 'Cost Reports') return;
    let cancelled = false;
    setCostActivityLoading(true);
    void api.getUserAuditLog({ action: 'cost_', limit: 20 })
      .then((res) => { if (!cancelled) setCostActivity(res.items); })
      .catch(() => { if (!cancelled) setCostActivity([]); })
      .finally(() => { if (!cancelled) setCostActivityLoading(false); });
    return () => { cancelled = true; };
  }, [tab, refreshToken]);

  function scopeLabel(scopeType: BudgetScopeType, scopeId: string): string {
    if (scopeType === 'org') return currentOrg?.name ?? 'Entire organization';
    if (scopeType === 'folder') return folders.find(f => f.id === scopeId)?.name ?? 'Deleted folder';
    if (scopeType === 'project') return projects.find(p => p.id === scopeId)?.name ?? 'Deleted project';
    const conn = connections.find(c => c.id === scopeId);
    return conn ? conn.name : 'Deleted account';
  }

  function openCreateBudget() {
    setEditingBudget(null);
    setBudgetName('');
    setBudgetScopeType('org');
    setBudgetScopeId(currentOrg?.id ?? '');
    setBudgetMonthlyLimit('');
    setBudgetThresholds('50,80,100');
    setBudgetError('');
    setBudgetModalOpen(true);
  }

  function openEditBudget(b: Budget) {
    setEditingBudget(b);
    setBudgetName(b.name);
    setBudgetScopeType(b.scope_type);
    setBudgetScopeId(b.scope_id);
    setBudgetMonthlyLimit(String(b.monthly_limit));
    setBudgetThresholds(b.alert_thresholds.join(','));
    setBudgetError('');
    setBudgetModalOpen(true);
  }

  async function submitBudget(e: React.FormEvent) {
    e.preventDefault();
    setBudgetError('');

    const name = budgetName.trim();
    const monthlyLimit = Number(budgetMonthlyLimit);
    const alertThresholds = budgetThresholds
      .split(',')
      .map(t => Number(t.trim()))
      .filter(t => Number.isFinite(t));

    if (!name) {
      setBudgetError('Enter a budget name.');
      return;
    }

    if (!Number.isFinite(monthlyLimit) || monthlyLimit <= 0) {
      setBudgetError('Monthly limit must be greater than 0.');
      return;
    }

    if (alertThresholds.length === 0) {
      setBudgetError('Enter at least one alert threshold.');
      return;
    }

    if (alertThresholds.some(t => t <= 0 || t > 100)) {
      setBudgetError('Alert thresholds must be between 1 and 100.');
      return;
    }

    if (new Set(alertThresholds).size !== alertThresholds.length) {
      setBudgetError('Alert thresholds must be unique.');
      return;
    }

    alertThresholds.sort((a, b) => a - b);

    if (!editingBudget && budgetScopeType !== 'org' && !budgetScopeId.trim()) {
      setBudgetError('Choose a scope before creating the budget.');
      return;
    }

    setBudgetSaving(true);

    try {
      if (editingBudget) {
        await api.updateBudget(editingBudget.id, {
          name,
          monthlyLimit,
          alertThresholds,
        });
      } else {
        await api.createBudget({
          name,
          scopeType: budgetScopeType,
          scopeId: budgetScopeType === 'org' ? (currentOrg?.id ?? '') : budgetScopeId,
          monthlyLimit,
          alertThresholds,
        });
      }

      setBudgetModalOpen(false);
      setBudgetActionError(null);
      await loadBudgets();
    } catch (err) {
      setBudgetError(
        err instanceof Error ? err.message : 'Could not save this budget.',
      );
    } finally {
      setBudgetSaving(false);
    }
  }


  async function handleDeleteBudget(b: Budget) {
    const confirmed = await confirm(
      `Delete the "${b.name}" budget? This doesn't affect any cloud resources or spend, only this tracker.`,
    );

    if (!confirmed) return;

    setBudgetDeletingId(b.id);
    setBudgetActionError(null);

    try {
      await api.deleteBudget(b.id);
      await loadBudgets();
    } catch (err) {
      setBudgetActionError(
        err instanceof Error ? err.message : 'Could not delete this budget.',
      );
    } finally {
      setBudgetDeletingId(null);
    }
  }


  // Allocation / Chargeback / Showback — all three read the same underlying
  // cost-by-tag aggregation, just with different framing per their real
  // product meaning (Allocation: neutral breakdown; Chargeback: "amount
  // owed" per cost center; Showback: visibility-only, non-billing). There's
  // no backend endpoint that lists which tag keys exist, so this is a
  // typeahead over common ones rather than a populated dropdown.
  const allocationMode: 'allocation' | 'chargeback' | 'showback' = tab === 'Chargeback' ? 'chargeback' : tab === 'Showback' ? 'showback' : 'allocation';
  const [tagKey, setTagKey] = useState('CostCenter');
  const [allocation, setAllocation] = useState<CostAllocation | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationRetryToken, setAllocationRetryToken] = useState(0);
  const onAllocationTab = tab === 'Cost Allocation' || tab === 'Chargeback' || tab === 'Showback';

  useEffect(() => {
    if (!onAllocationTab) {
      setAllocationError(null);
      return;
    }

    const key = tagKey.trim();
    if (!key) {
      setAllocation(null);
      setAllocationError(null);
      return;
    }

    const requestId = ++allocationRequestRef.current;
    setAllocationLoading(true);
    setAllocationError(null);

    const { from, to } = rangeToFromTo(dateRange);
    const connectionIds = account === 'all' ? groupIds : [account];

    const call =
      allocationMode === 'chargeback'
        ? api.getChargeback({ tagKey: key, from, to, connectionIds })
        : allocationMode === 'showback'
          ? api.getShowback({ tagKey: key, from, to, connectionIds })
          : api.getCostAllocation({ tagKey: key, from, to, connectionIds });

    void call
      .then(result => {
        if (requestId !== allocationRequestRef.current) return;
        setAllocation(result);
      })
      .catch(err => {
        if (requestId !== allocationRequestRef.current) return;
        setAllocation(null);
        setAllocationError(
          err instanceof Error ? err.message : 'Could not load cost allocation.',
        );
      })
      .finally(() => {
        if (requestId === allocationRequestRef.current) {
          setAllocationLoading(false);
        }
      });
  }, [tagKey, dateRange, allocationMode, onAllocationTab, refreshToken, allocationRetryToken, account, groupIds]);

  // Cost by Resource — real per-resource cost from resource_costs (only
  // populated for AWS accounts with Cost & Usage Report ingestion turned
  // on, see AwsAccountDetail's CUR sync). The tag key/value filter is the
  // same "Cost Center" concept Cost Allocation already breaks down by,
  // applied here as a real filter over individual resources rather than
  // only a chart — this is the honest, data-model-supported version of a
  // "cost center filter": it can't be a *global* filter across every panel
  // (cost_snapshots, which powers Cost Explorer/Analytics/Forecast/Trend,
  // has no resource_id at all — only CUR-ingested resource_costs does), so
  // it's scoped to this one resource-level view instead of silently doing
  // nothing on panels that structurally can't support it.
  const [resourceCostTagKey, setResourceCostTagKey] = useState('');
  const [resourceCostTagValue, setResourceCostTagValue] = useState('');
  const [resourceCosts, setResourceCosts] = useState<ResourceCostRow[]>([]);
  const [resourceCostLoading, setResourceCostLoading] = useState(false);
  const [resourceCostError, setResourceCostError] = useState<string | null>(null);
  const resourceCostRequestRef = useRef(0);

  useEffect(() => {
    if (tab !== 'Cost by Resource') return;

    const requestId = ++resourceCostRequestRef.current;
    setResourceCostLoading(true);
    setResourceCostError(null);

    const { from, to } = rangeToFromTo(dateRange);
    const connectionId = account === 'all' ? undefined : account;
    const tagKeyTrimmed = resourceCostTagKey.trim();
    const tagValueTrimmed = resourceCostTagValue.trim();

    void api
      .getResourceCosts({
        connectionId,
        connectionIds: connectionId ? undefined : groupIds,
        from,
        to,
        tagKey: tagKeyTrimmed && tagValueTrimmed ? tagKeyTrimmed : undefined,
        tagValue: tagKeyTrimmed && tagValueTrimmed ? tagValueTrimmed : undefined,
        limit: 100,
      })
      .then((res) => {
        if (requestId !== resourceCostRequestRef.current) return;
        setResourceCosts(res.items);
      })
      .catch((err) => {
        if (requestId !== resourceCostRequestRef.current) return;
        setResourceCosts([]);
        setResourceCostError(err instanceof Error ? err.message : 'Could not load cost by resource.');
      })
      .finally(() => {
        if (requestId === resourceCostRequestRef.current) setResourceCostLoading(false);
      });
  }, [tab, dateRange, account, groupIds, resourceCostTagKey, resourceCostTagValue, refreshToken]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError(null);

    try {
      const connectionId = account === 'all' ? undefined : account;
      const regionParam = region === 'all' ? undefined : region;
      const { from, to } = rangeToFromTo(dateRange);

      const [analyticsRes, forecastRes, explorerRes] = await Promise.all([
        api.getCostAnalytics({
          from,
          to,
          region: regionParam,
          connectionIds: connectionId ? [connectionId] : groupIds,
        }),
        api.getCostForecast({ region: regionParam, connectionIds: groupIds }),
        api.getCostExplorer({
          connectionId,
          connectionIds: groupIds,
          region: regionParam,
          from,
          to,
          limit: 200,
        }),
      ]);

      if (requestId !== loadRequestRef.current) return;

      setAnalytics(analyticsRes);
      setForecast(forecastRes);
      setDaily(aggregateDaily(explorerRes.items));
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setLoadError(
        err instanceof Error ? err.message : 'Could not load cost data.',
      );
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [dateRange, region, account, groupIds]);


  useEffect(() => { void load(); }, [load, refreshToken]);

  async function handleDownloadCsv() {
    if (csvDownloading) return;

    setCsvDownloading(true);

    try {
      const { from, to } = rangeToFromTo(dateRange);
      const connectionId = account === 'all' ? undefined : account;
      const regionParam = region === 'all' ? undefined : region;
      const { blob, filename } = await api.downloadCostReportCsv({ from, to, region: regionParam, connectionIds: connectionId ? [connectionId] : groupIds });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'cost-report.csv';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Could not download the CSV report.',
      );
    } finally {
      setCsvDownloading(false);
    }
  }


  const byServiceEntries = useMemo(
    () => Object.entries(analytics?.byService ?? {}).sort(([, a], [, b]) => b - a),
    [analytics?.byService],
  );
  const byAccountEntries = useMemo(
    () => Object.entries(analytics?.byAccount ?? {}).sort(([, a], [, b]) => b - a),
    [analytics?.byAccount],
  );
  const byRegionEntries = useMemo(
    () => Object.entries(analytics?.byRegion ?? {}).sort(([, a], [, b]) => b - a),
    [analytics?.byRegion],
  );
  const totalCost = analytics?.totalCost ?? 0;
  const avgDailyCost = daily.length > 0 ? daily.reduce((sum, d) => sum + d.cost, 0) / daily.length : 0;
  const allocationTotal = allocation?.totalCost ?? 0;

  if (loading && !analytics && !forecast) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  if (loadError && !analytics && !forecast) {
    return (
      <div className="flex flex-col gap-4">
        <div
          className="rounded-xl border border-red-200 dark:border-red-900
                     bg-red-50 dark:bg-red-900/20 p-5 text-center"
          role="alert"
        >
          <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {loading && <p className="text-xs text-slate-400 mb-2">Refreshing…</p>}

      {loadError && (
        <div
          className="mb-4 rounded-md border border-amber-200 dark:border-amber-900/60
                     bg-amber-50 dark:bg-amber-900/10 px-3 py-2 text-sm
                     text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3"
          role="alert"
        >
          <span>Some cost data could not be refreshed: {loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 text-xs underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Cost (MTD)" value={money(forecast?.mtdSpend ?? 0)} caption="real AWS + Azure cost spend" />
        <StatCard label="Forecasted Cost" value={money(forecast?.projectedTotal ?? 0)} caption="Forecast (linear estimate)" />
        <StatCard label="Avg Daily Cost" value={money(avgDailyCost)} caption="selected range" />
        <StatCard label="Active Budgets" value={String(budgets.length)} />
      </div>

      {byServiceEntries.length > 0 && totalCost === 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 mb-4">
          This is real, synced cost data (AWS Cost Explorer / Azure Cost Management) — it's genuinely $0 for the selected range (common for a new or low-usage account; both can also lag ~24–48h behind very recent usage). This is a different metric from Cost Optimization's "potential savings," which are list-price rightsizing estimates, not billed spend — the two can legitimately disagree.
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {visibleTabs.map(t => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            role="tab"
            aria-selected={tab === t}
            className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {groupFilterActive && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
          Scoped to {groupFilter.provider ? PROVIDER_LABEL[groupFilter.provider] : 'all clouds'}{groupFilter.environment !== 'all' ? ` · ${groupFilter.environment}` : ''} — applies everywhere on this page except Budgets (budgets have their own org/folder/project/account scope, a different dimension from Cloud/Environment).
        </p>
      )}

      {tab === 'Cost Explorer' && (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost Over Time</h3>
            <LineChart series={[{ label: 'Daily Cost', points: daily.map(d => ({ x: d.date, y: d.cost })) }]} valueFormatter={money} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost & Usage by Service</h3>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2">Service</th><th className="py-2 text-right">Cost</th><th className="py-2 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {byServiceEntries.map(([service, cost]) => (
                  <tr key={service} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{service}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(cost)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {byServiceEntries.length === 0 && (
              <p className="text-sm text-slate-400 mt-3">
                No cost data yet — open an AWS or Azure account's detail page (Cloud Accounts → Account Inventory) and click "Sync Cost."
                {connections.some(c => c.provider === 'gcp') && ' GCP projects need Cloud Billing export to BigQuery enabled first (GCP Console → Billing → Billing export), then "Sync Billing" on the project.'}
              </p>
            )}
          </div>
        </>
      )}

      {tab === 'Cost Analytics' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:col-span-3">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost by Service</h3>
              <Donut data={byServiceEntries.slice(0, 8).map(([service, cost]) => ({ label: service, value: cost }))} centerLabel={{ value: money(totalCost).replace('.00', ''), caption: 'total' }} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost by Account</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {byAccountEntries.map(([accountId, cost]) => (
                  <li key={accountId} className="flex justify-between"><span className="text-slate-600 dark:text-slate-300 font-mono text-xs">{accountId}</span><span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(cost)}</span></li>
                ))}
                {byAccountEntries.length === 0 && <li className="text-slate-400 text-sm">No cost data synced yet.</li>}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost by Region</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {byRegionEntries.map(([regionName, cost]) => (
                  <li key={regionName} className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">{regionName}</span><span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(cost)}</span></li>
                ))}
                {byRegionEntries.length === 0 && <li className="text-slate-400 text-sm">No cost data synced yet.</li>}
              </ul>
            </div>
          </div>
        </>
      )}

      {tab === 'Forecast' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <StatCard label="Month-to-Date Spend" value={money(forecast?.mtdSpend ?? 0)} />
            <StatCard label="Projected Month-End Total" value={money(forecast?.projectedTotal ?? 0)} />
            <StatCard label="Avg Daily Cost (selected range)" value={money(avgDailyCost)} />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Forecast is a linear estimate — month-to-date spend divided by days elapsed so far this month, projected across the full month. It doesn't account for seasonality, planned scaling, or Reserved Instance/Savings Plan commitments, and will drift as the month goes on. Real month-end cost may be higher or lower.
          </p>
        </div>
      )}

      {tab === 'Budgets' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Budgets</h3>
            <button type="button" onClick={openCreateBudget} className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">New Budget</button>
          </div>
          {budgetActionError && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
              <span>{budgetActionError}</span>
              <button type="button" onClick={() => setBudgetActionError(null)} className="underline shrink-0">Dismiss</button>
            </div>
          )}

          {budgets.length === 0 ? (
            <p className="text-sm text-slate-400">No budgets yet — set a monthly limit on your whole org, a folder, a project, or a single AWS/Azure account, and get an early warning before you go over.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {budgets.map(b => {
                const percentUsed = Math.min(100, Math.max(0, b.percentOfLimit));
                const barColor = b.status === 'exceeded' ? 'bg-red-500' : b.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500';
                return (
                  <div key={b.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{b.name}</div>
                        <div className="text-[11px] text-slate-400">{b.scope_type} — {scopeLabel(b.scope_type, b.scope_id)}</div>
                      </div>
                      <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden my-2">
                      <div className={`h-full ${barColor}`} style={{ width: `${percentUsed}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>{money(b.currentSpend)} of {money(b.monthly_limit)}</span>
                      <span>forecast {money(b.projectedSpend)}</span>
                    </div>
                    <div className="flex justify-end gap-2 mt-2 text-xs">
                      <button type="button" onClick={() => openEditBudget(b)} className="text-slate-500 hover:underline">Edit</button>
                      <button
                          type="button"
                          onClick={() => void handleDeleteBudget(b)}
                          disabled={budgetDeletingId === b.id}
                          className="text-slate-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {budgetDeletingId === b.id ? 'Deleting…' : 'Delete'}
                        </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {onAllocationTab && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">{tab}</h3>
            <input
              list="tag-key-suggestions"
              value={tagKey}
              onChange={e => setTagKey(e.target.value)}
              placeholder="Tag key (e.g. CostCenter)"
              className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200"
            />
            <datalist id="tag-key-suggestions">
              {TAG_KEY_SUGGESTIONS.map(k => <option key={k} value={k} />)}
            </datalist>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {allocationMode === 'chargeback'
              ? 'Framed as amount owed per cost center — for internal billback, not an actual AWS invoice.'
              : allocationMode === 'showback'
              ? 'Visibility only — showback numbers are informational and never billed to a team or cost center.'
              : 'Neutral cost breakdown by tag value, the same numbers Chargeback and Showback both frame differently.'}
          </p>
          {allocationError && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
              <span>{allocationError}</span>
              <button type="button" onClick={() => setAllocationRetryToken(t => t + 1)} className="text-xs underline shrink-0">Retry</button>
            </div>
          )}

          {allocationLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !allocation || allocation.buckets.length === 0 ? (
            <p className="text-sm text-slate-400">No cost data for this tag key in the selected date range. In AWS, a tag only appears here once it's activated as a cost allocation tag in Billing → Cost Allocation Tags — try CostCenter, Environment, Team, or Project, or type your own.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                  <th className="py-2">{allocation.tagKey}</th><th className="py-2 text-right">{allocationMode === 'chargeback' ? 'Amount Owed' : 'Cost'}</th><th className="py-2 text-right">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {allocation.buckets.map(b => (
                  <tr key={b.tagValue} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{b.tagValue}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(b.totalCost)}</td>
                    <td className="py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{allocationTotal > 0 ? ((b.totalCost / allocationTotal) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Cost by Resource' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Cost by Resource</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                list="tag-key-suggestions"
                value={resourceCostTagKey}
                onChange={e => setResourceCostTagKey(e.target.value)}
                placeholder="Filter by tag key (e.g. CostCenter)"
                className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200"
              />
              <input
                value={resourceCostTagValue}
                onChange={e => setResourceCostTagValue(e.target.value)}
                placeholder="Tag value (e.g. Marketing, or Untagged)"
                disabled={!resourceCostTagKey.trim()}
                className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-slate-700 dark:text-slate-200 disabled:opacity-50"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Real per-resource cost, top 100 by spend for the selected range — only populated for AWS accounts with Cost &amp; Usage Report ingestion turned on (Cloud Accounts → an AWS account → sync its CUR). Azure and GCP have no per-resource cost pipeline yet, so their resources never appear here regardless of sync. The tag filter narrows this table only — it can't apply to Cost Explorer/Analytics/Forecast above, since those are built from service+account-level cost with no resource_id to filter by.
          </p>
          {resourceCostError && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3" role="alert">
              <span>{resourceCostError}</span>
              <button type="button" onClick={() => setResourceCosts([])} className="text-xs underline shrink-0">Dismiss</button>
            </div>
          )}
          {resourceCostLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : resourceCosts.length === 0 ? (
            <p className="text-sm text-slate-400">No per-resource cost data for this range/filter — either no AWS account here has Cost &amp; Usage Report ingestion turned on yet, or nothing matches the tag filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                    <th className="py-2">Resource</th><th className="py-2">Type</th><th className="py-2">Region</th><th className="py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {resourceCosts.map(r => (
                    <tr key={`${r.connectionId}:${r.resourceId}`} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                      <td className="py-2 text-slate-700 dark:text-slate-200 font-mono text-xs">{r.resourceName ?? r.resourceId}</td>
                      <td className="py-2 text-slate-500 dark:text-slate-400">{r.resourceType}</td>
                      <td className="py-2 text-slate-500 dark:text-slate-400">{r.region ?? '—'}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(r.totalCost, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'Cost Reports' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Export CSV Report</h3>
          <p className="text-sm text-slate-400 mb-4">Downloads a real CSV of cost line items for the selected date range and account/region filters — the same underlying data as Cost Explorer, formatted for a spreadsheet.</p>
          <button
            type="button"
            onClick={() => void handleDownloadCsv()}
            disabled={csvDownloading}
            className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2"
          >
            {csvDownloading ? 'Preparing CSV…' : 'Export CSV Report'}
          </button>
          <p className="text-xs text-slate-400 mt-4">For PDF/scheduled cost reports, see Reports → Cost Reports.</p>
        </div>
      )}

      {tab === 'Cost Reports' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 mt-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent Cost Activity</h3>
          {costActivityLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {costActivity.map((entry) => (
                <li key={entry.id} className="py-2 text-sm flex justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-200">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')} <span className="text-slate-400">by {entry.actor?.email ?? 'system'}</span></span>
                  <span className="text-xs text-slate-400 shrink-0">{new Date(entry.occurredAt).toLocaleString()}</span>
                </li>
              ))}
              {costActivity.length === 0 && <li className="py-2 text-sm text-slate-400">No cost management or optimization activity recorded yet — budget changes, applied/excluded recommendations, and anomaly status changes will show up here.</li>}
            </ul>
          )}
        </div>
      )}

      <Modal open={budgetModalOpen} onClose={() => setBudgetModalOpen(false)} title={editingBudget ? 'Edit Budget' : 'New Budget'}>
        <form onSubmit={submitBudget} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Name</span>
            <input required value={budgetName} onChange={e => setBudgetName(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          {!editingBudget && (
            <>
              <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Scope</span>
                <select value={budgetScopeType} onChange={e => { const t = e.target.value as BudgetScopeType; setBudgetScopeType(t); setBudgetScopeId(t === 'org' ? (currentOrg?.id ?? '') : ''); }} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                  <option value="org">Entire organization</option>
                  <option value="folder">A folder</option>
                  <option value="project">A project</option>
                  <option value="connection">A single AWS/Azure account</option>
                </select>
              </label>
              {budgetScopeType === 'folder' && (
                <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Folder</span>
                  <select required value={budgetScopeId} onChange={e => setBudgetScopeId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                    <option value="">Choose a folder…</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
              )}
              {budgetScopeType === 'project' && (
                <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Project</span>
                  <select required value={budgetScopeId} onChange={e => setBudgetScopeId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                    <option value="">Choose a project…</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              )}
              {budgetScopeType === 'connection' && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-600 dark:text-slate-300">Account</span>
                  {/* Every provider is offered now that GCP can populate cost_snapshots too (via Sync Billing, once Cloud Billing export to BigQuery is enabled) — sumMtdCost just sums cost_snapshots by connection_id regardless of provider. A GCP account without billing export configured yet will genuinely show $0 here, same honest behavior as a brand-new AWS/Azure account that hasn't synced. */}
                  <select required value={budgetScopeId} onChange={e => setBudgetScopeId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                    <option value="">Choose an account…</option>
                    {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
            </>
          )}
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Monthly limit (USD)</span>
            <input required type="number" min="0.01" step="0.01" value={budgetMonthlyLimit} onChange={e => setBudgetMonthlyLimit(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">Alert thresholds (% of limit, comma-separated)</span>
            <input required value={budgetThresholds} onChange={e => setBudgetThresholds(e.target.value)} placeholder="50,80,100" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white" />
          </label>
          {budgetError && <p className="text-xs text-red-500">{budgetError}</p>}
          <button
              type="submit"
              disabled={budgetSaving}
              className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2"
            >
              {budgetSaving ? 'Saving…' : editingBudget ? 'Save' : 'Create'}
            </button>
        </form>
      </Modal>
      {confirmDialog}
    </div>
  );
}