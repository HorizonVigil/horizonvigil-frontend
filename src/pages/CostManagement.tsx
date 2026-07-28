import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { useFilters, dateRangeToDays, type DateRangePreset } from '../lib/filterContext';
import { useOrg } from '../lib/orgContext';
import { api, type CostAnomaly, type Budget, type BudgetScopeType, type CostAllocation, type CostSnapshot } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const STATUS_TONE = { ok: 'good', warning: 'warning', exceeded: 'critical' } as const;

// A few common cost-allocation tag keys to suggest — there's no backend
// endpoint anymore that lists which tag keys are actually active for an
// org, so this is just a typeahead starting point (free text still works).
const TAG_KEY_SUGGESTIONS = ['CostCenter', 'Environment', 'Team', 'Project'];

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
  const [loading, setLoading] = useState(true);

  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof api.getCostAnalytics>> | null>(null);
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof api.getCostForecast>> | null>(null);
  const [daily, setDaily] = useState<{ date: string; cost: number }[]>([]);
  const [anomalies, setAnomalies] = useState<CostAnomaly[]>([]);

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
    return conn ? (conn.connection_name ?? conn.aws_account_id) : 'Deleted account';
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
    if (!(await confirm(`Delete the "${b.name}" budget? This doesn't affect any AWS resources or spend, only this tracker.`))) return;
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
  const [allocationMode, setAllocationMode] = useState<'allocation' | 'chargeback' | 'showback'>('allocation');
  const [tagKey, setTagKey] = useState('CostCenter');
  const [allocation, setAllocation] = useState<CostAllocation | null>(null);
  const [allocationLoading, setAllocationLoading] = useState(false);

  useEffect(() => {
    if (!tagKey.trim()) { setAllocation(null); return; }
    setAllocationLoading(true);
    const { from, to } = rangeToFromTo(dateRange);
    const call = allocationMode === 'chargeback' ? api.getChargeback({ tagKey: tagKey.trim(), from, to })
      : allocationMode === 'showback' ? api.getShowback({ tagKey: tagKey.trim(), from, to })
      : api.getCostAllocation({ tagKey: tagKey.trim(), from, to });
    void call.then(setAllocation).finally(() => setAllocationLoading(false));
  }, [tagKey, dateRange, allocationMode, refreshToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const connectionId = account === 'all' ? undefined : account;
      const { from, to } = rangeToFromTo(dateRange);
      const [analyticsRes, forecastRes, explorerRes, anomaliesRes] = await Promise.all([
        api.getCostAnalytics({ from, to }),
        api.getCostForecast(),
        api.getCostExplorer({ connectionId, region: region === 'all' ? undefined : region, from, to, limit: 200 }),
        api.getCostAnomalies({ connectionId, limit: 200 }),
      ]);
      setAnalytics(analyticsRes);
      setForecast(forecastRes);
      setDaily(aggregateDaily(explorerRes.items));
      setAnomalies(anomaliesRes.items);
    } finally {
      setLoading(false);
    }
  }, [dateRange, region, account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  async function handleAnomalyStatus(id: string, status: 'acknowledged' | 'resolved') {
    await api.updateCostAnomaly(id, status);
    await load();
  }

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

  const anomalyColumns: Column<CostAnomaly>[] = [
    { key: 'service', header: 'Service', render: a => a.service, sortValue: a => a.service },
    { key: 'usage_date', header: 'Date', render: a => a.usage_date, sortValue: a => a.usage_date },
    { key: 'expected_cost', header: 'Expected', render: a => money(a.expected_cost), sortValue: a => a.expected_cost },
    { key: 'actual_cost', header: 'Actual', render: a => money(a.actual_cost), sortValue: a => a.actual_cost },
    { key: 'percent_change', header: '% Change', render: a => <span className="text-amber-500 font-medium">+{a.percent_change.toFixed(0)}%</span>, sortValue: a => a.percent_change },
    { key: 'dollar_impact', header: '$ Impact', render: a => money(a.dollar_impact), sortValue: a => a.dollar_impact },
    { key: 'status', header: 'Status', render: a => <Badge>{a.status}</Badge>, sortValue: a => a.status },
    {
      key: 'actions', header: 'Actions', render: a => (
        <div className="flex gap-2 text-xs">
          {a.status === 'open' && <button onClick={e => { e.stopPropagation(); void handleAnomalyStatus(a.id, 'acknowledged'); }} className="text-amber-600 dark:text-amber-400 hover:underline">Acknowledge</button>}
          {a.status !== 'resolved' && <button onClick={e => { e.stopPropagation(); void handleAnomalyStatus(a.id, 'resolved'); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Resolve</button>}
        </div>
      ),
    },
  ];

  return (
    <div>
      <FilterBar title="Cost Management" breadcrumb={<Breadcrumb />} />

      <div className="flex justify-end mb-3">
        <button onClick={() => void handleDownloadCsv()} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">Export CSV Report</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Cost (MTD)" value={money(forecast?.mtdSpend ?? 0)} />
        <StatCard label="Forecasted Cost" value={money(forecast?.projectedTotal ?? 0)} caption="Forecast (linear estimate)" />
        <StatCard label="Avg Daily Cost" value={money(avgDailyCost)} caption="selected range" />
        <StatCard label="Open Anomalies" value={String(anomalies.filter(a => a.status === 'open').length)} />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Budgets</h3>
          <button onClick={openCreateBudget} className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5">New Budget</button>
        </div>
        {budgets.length === 0 ? (
          <p className="text-sm text-slate-400">No budgets yet — set a monthly limit on your whole org, a folder, a project, or a single AWS account, and get an early warning before you go over.</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:col-span-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost Over Time</h3>
          <LineChart series={[{ label: 'Daily Cost', points: daily.map(d => ({ x: d.date, y: d.cost })) }]} valueFormatter={money} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost by Service</h3>
          <Donut data={byServiceEntries.slice(0, 8).map(([service, cost]) => ({ label: service, value: cost }))} centerLabel={{ value: money(totalCost).replace('.00', ''), caption: 'total' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex gap-1">
            {(['allocation', 'chargeback', 'showback'] as const).map(m => (
              <button key={m} onClick={() => setAllocationMode(m)} className={`text-xs px-2.5 py-1.5 rounded-md ${allocationMode === m ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {m === 'allocation' ? 'Cost Allocation' : m === 'chargeback' ? 'Chargeback' : 'Showback'}
              </button>
            ))}
          </div>
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost Anomaly Detection</h3>
        <DataTable columns={anomalyColumns} rows={anomalies} rowKey={a => a.id} emptyMessage="No anomalies detected — day-over-day service spikes >50% will show up here." />
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
        {byServiceEntries.length === 0 && <p className="text-sm text-slate-400 mt-3">No cost data yet — sync cost from an AWS account's detail page.</p>}
      </div>
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
                  <option value="connection">A single AWS account</option>
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
                <label className="flex flex-col gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">AWS Account</span>
                  <select required value={budgetScopeId} onChange={e => setBudgetScopeId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-900 dark:text-white">
                    <option value="">Choose an account…</option>
                    {connections.map(c => <option key={c.id} value={c.id}>{c.connection_name ?? c.aws_account_id}</option>)}
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
