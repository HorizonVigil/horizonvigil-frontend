import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { useFilters, dateRangeToDays, type DateRangePreset } from '../lib/filterContext';
import { useOrg } from '../lib/orgContext';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { api, type Budget, type BudgetScopeType, type CostAllocation, type CostSnapshot } from '../lib/api';
import { money } from '../lib/format';

const STATUS_TONE = { ok: 'good', warning: 'warning', exceeded: 'critical' } as const;

// A few common cost-allocation tag keys to suggest — there's no backend
// endpoint anymore that lists which tag keys are actually active for an
// org, so this is just a typeahead starting point (free text still works).
const TAG_KEY_SUGGESTIONS = ['CostCenter', 'Environment', 'Team', 'Project'];

const TABS = ['Cost Explorer', 'Cost Analytics', 'Forecast', 'Budgets', 'Cost Allocation', 'Chargeback', 'Showback', 'Cost Reports'] as const;
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

export function CostManagement() {
  // Account + Region filters live in the global FilterBar now.
  const { region, account, dateRange, refreshToken, connections } = useFilters();
  const { currentOrg, folders, projects } = useOrg();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canSeeTab = useSubmenuAccess('cost');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Cost Explorer');
  const [loading, setLoading] = useState(true);

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
    const { items } = await api.getBudgets({ limit: 200 });
    setBudgets(items);
  }, []);

  useEffect(() => { void loadBudgets(); }, [loadBudgets, refreshToken]);

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
    const monthlyLimit = Number(budgetMonthlyLimit);
    const alertThresholds = budgetThresholds.split(',').map(t => Number(t.trim())).filter(t => !Number.isNaN(t) && t > 0);
    try {
      if (editingBudget) {
        await api.updateBudget(editingBudget.id, { name: budgetName, monthlyLimit, alertThresholds });
      } else {
        await api.createBudget({ name: budgetName, scopeType: budgetScopeType, scopeId: budgetScopeId, monthlyLimit, alertThresholds });
      }
      setBudgetModalOpen(false);
      await loadBudgets();
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : 'Could not save this budget.');
    }
  }

  async function handleDeleteBudget(b: Budget) {
    if (!(await confirm(`Delete the "${b.name}" budget? This doesn't affect any cloud resources or spend, only this tracker.`))) return;
    await api.deleteBudget(b.id);
    await loadBudgets();
  }

  // Allocation / Chargeback / Showback — all three read the same underlying
  // cost-by-tag aggregation, just with different framing per their real
  // product meaning (Allocation: neutral breakdown; Chargeback: "amount
  // owed" per cost center; Showback: visibility-only, non-billing). There's
  // no backend endpoint that lists which tag keys exist, so this is a
  // typeahead over common ones rather than a populated dropdown, and none of
  // the three are scoped by the Account filter (none take a connectionId).
  const allocationMode: 'allocation' | 'chargeback' | 'showback' = tab === 'Chargeback' ? 'chargeback' : tab === 'Showback' ? 'showback' : 'allocation';
  const [tagKey, setTagKey] = useState('CostCenter');
  const [allocation, setAllocation] = useState<CostAllocation | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(false);
  const onAllocationTab = tab === 'Cost Allocation' || tab === 'Chargeback' || tab === 'Showback';

  useEffect(() => {
    if (!onAllocationTab) return;
    if (!tagKey.trim()) { setAllocation(null); return; }
    setAllocationLoading(true);
    const { from, to } = rangeToFromTo(dateRange);
    const call = allocationMode === 'chargeback' ? api.getChargeback({ tagKey: tagKey.trim(), from, to })
      : allocationMode === 'showback' ? api.getShowback({ tagKey: tagKey.trim(), from, to })
      : api.getCostAllocation({ tagKey: tagKey.trim(), from, to });
    void call.then(setAllocation).finally(() => setAllocationLoading(false));
  }, [tagKey, dateRange, allocationMode, onAllocationTab, refreshToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const connectionId = account === 'all' ? undefined : account;
      const { from, to } = rangeToFromTo(dateRange);
      const [analyticsRes, forecastRes, explorerRes] = await Promise.all([
        api.getCostAnalytics({ from, to }),
        api.getCostForecast(),
        api.getCostExplorer({ connectionId, region: region === 'all' ? undefined : region, from, to, limit: 200 }),
      ]);
      setAnalytics(analyticsRes);
      setForecast(forecastRes);
      setDaily(aggregateDaily(explorerRes.items));
    } finally {
      setLoading(false);
    }
  }, [dateRange, region, account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  async function handleDownloadCsv() {
    const { from, to } = rangeToFromTo(dateRange);
    const { blob, filename } = await api.downloadCostReportCsv({ from, to });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const byServiceEntries = Object.entries(analytics?.byService ?? {}).sort(([, a], [, b]) => b - a);
  const byAccountEntries = Object.entries(analytics?.byAccount ?? {}).sort(([, a], [, b]) => b - a);
  const byRegionEntries = Object.entries(analytics?.byRegion ?? {}).sort(([, a], [, b]) => b - a);
  const totalCost = analytics?.totalCost ?? 0;
  const avgDailyCost = daily.length > 0 ? daily.reduce((sum, d) => sum + d.cost, 0) / daily.length : 0;
  const allocationTotal = allocation?.totalCost ?? 0;

  return (
    <div>
      <FilterBar title="Cost Management" breadcrumb={<Breadcrumb />} />

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
          <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Cost Explorer' && (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost Over Time</h3>
            <LineChart series={[{ label: 'Daily Cost', points: daily.map(d => ({ x: d.date, y: d.cost })) }]} valueFormatter={money} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost & Usage by Service</h3>
            <table className="w-full text-sm">
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
            {byServiceEntries.length === 0 && (
              <p className="text-sm text-slate-400 mt-3">
                No cost data yet — open an AWS or Azure account's detail page (Cloud Accounts → Account Inventory) and click "Sync Cost."
                {connections.some(c => c.provider === 'gcp') && ' GCP cost tracking isn’t built yet — GCP projects won’t show cost here regardless of sync.'}
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
            <button onClick={openCreateBudget} className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">New Budget</button>
          </div>
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
                      <button onClick={() => openEditBudget(b)} className="text-slate-500 hover:underline">Edit</button>
                      <button onClick={() => void handleDeleteBudget(b)} className="text-slate-500 hover:underline">Delete</button>
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
          {allocationLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !allocation || allocation.buckets.length === 0 ? (
            <p className="text-sm text-slate-400">No cost data for this tag key in the selected date range. In AWS, a tag only appears here once it's activated as a cost allocation tag in Billing → Cost Allocation Tags — try CostCenter, Environment, Team, or Project, or type your own.</p>
          ) : (
            <table className="w-full text-sm">
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
          )}
        </div>
      )}

      {tab === 'Cost Reports' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Export CSV Report</h3>
          <p className="text-sm text-slate-400 mb-4">Downloads a real CSV of cost line items for the selected date range and account/region filters — the same underlying data as Cost Explorer, formatted for a spreadsheet.</p>
          <button onClick={() => void handleDownloadCsv()} className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white px-4 py-2">Export CSV Report</button>
          <p className="text-xs text-slate-400 mt-4">For PDF/scheduled cost reports, see Reports → Cost Reports.</p>
        </div>
      )}

      {loading && <p className="text-xs text-slate-400 mt-3">Loading…</p>}

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
                  <span className="text-slate-600 dark:text-slate-300">AWS/Azure Account</span>
                  {/* AWS + Azure only, deliberately: GCP cost sync doesn't exist yet (see Cost Explorer's empty state), so a budget scoped to a GCP project could never actually track spend — offering it here would be a dead, misleading option, not just an empty one. */}
                  <select required value={budgetScopeId} onChange={e => setBudgetScopeId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                    <option value="">Choose an account…</option>
                    {connections.filter(c => c.provider === 'aws' || c.provider === 'azure').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
          <button type="submit" className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2">{editingBudget ? 'Save' : 'Create'}</button>
        </form>
      </Modal>
      {confirmDialog}
    </div>
  );
}
