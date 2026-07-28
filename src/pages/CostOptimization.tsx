import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { useTabParam } from '../lib/useTabParam';
import { api, type CostRecommendation, type RecommendationListParams, type CostAnomaly } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

const TABS = ['Overview', 'Recommendations', 'Rightsizing', 'Idle Resources', 'Reserved Instances', 'Savings Plans', 'Cost Anomalies', 'History'] as const;

export function CostOptimization() {
  const { account, refreshToken } = useFilters();
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.getCostOptimizationDashboard>> | null>(null);
  // The general open savings-opportunities feed — powers the Recommendations
  // tab and (since there's no single "everything" endpoint anymore) the
  // top stat cards' High Priority count.
  const [savingsOpportunities, setSavingsOpportunities] = useState<CostRecommendation[]>([]);
  const [tab, setTab] = useTabParam<typeof TABS[number]>(TABS, 'Overview');
  const [tabRows, setTabRows] = useState<CostRecommendation[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [selected, setSelected] = useState<CostRecommendation | null>(null);
  const [copied, setCopied] = useState(false);
  const [anomalies, setAnomalies] = useState<CostAnomaly[]>([]);

  const load = useCallback(async () => {
    const connectionId = account === 'all' ? undefined : account;
    const [dash, opportunities] = await Promise.all([
      api.getCostOptimizationDashboard(),
      api.getSavingsOpportunities({ connectionId, status: 'open', limit: 200 }),
    ]);
    setDashboard(dash);
    setSavingsOpportunities(opportunities.items);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // Each category now lives behind its own dedicated cost-optimization-api
  // route (getRightsizing, getIdleResources, getReservedInstances,
  // getSavingsPlans, getOptimizationHistory) instead of one list filtered
  // client-side by `category` — so tab switches fetch fresh.
  useEffect(() => {
    if (tab === 'Overview' || tab === 'Recommendations' || tab === 'Cost Anomalies') { setTabRows([]); return; }
    let cancelled = false;
    setTabLoading(true);
    const connectionId = account === 'all' ? undefined : account;
    const params: RecommendationListParams = { connectionId, limit: 200 };
    const call =
      tab === 'Rightsizing' ? api.getRightsizing({ ...params, status: 'open' }) :
      tab === 'Idle Resources' ? api.getIdleResources({ ...params, status: 'open' }) :
      tab === 'Reserved Instances' ? api.getReservedInstances({ ...params, status: 'open' }) :
      tab === 'Savings Plans' ? api.getSavingsPlans({ ...params, status: 'open' }) :
      api.getOptimizationHistory(params); // History: no status filter — shows applied + dismissed
    void call.then(res => { if (!cancelled) setTabRows(res.items); }).finally(() => { if (!cancelled) setTabLoading(false); });
    return () => { cancelled = true; };
  }, [tab, account, refreshToken]);

  useEffect(() => {
    if (tab !== 'Cost Anomalies') return;
    let cancelled = false;
    const connectionId = account === 'all' ? undefined : account;
    void api.getCostAnomalies({ connectionId, limit: 200 }).then(res => { if (!cancelled) setAnomalies(res.items); });
    return () => { cancelled = true; };
  }, [tab, account, refreshToken]);

  async function handleAnomalyStatus(id: string, status: 'acknowledged' | 'resolved') {
    await api.updateCostAnomaly(id, status);
    const connectionId = account === 'all' ? undefined : account;
    const res = await api.getCostAnomalies({ connectionId, limit: 200 });
    setAnomalies(res.items);
  }

  const potentialMonthly = dashboard?.totalPotentialMonthlySavings ?? 0;
  const potentialAnnual = potentialMonthly * 12;

  async function markDone(id: string, status: 'applied' | 'dismissed') {
    // updateSavingsOpportunity is the only mutate route cost-optimization-api
    // exposes — it operates on any cost_recommendations row by id regardless
    // of which category endpoint it was listed under.
    await api.updateSavingsOpportunity(id, status);
    setSelected(null);
    await load();
    if (tab !== 'Overview' && tab !== 'Recommendations') {
      const connectionId = account === 'all' ? undefined : account;
      const params: RecommendationListParams = { connectionId, limit: 200 };
      const call =
        tab === 'Rightsizing' ? api.getRightsizing({ ...params, status: 'open' }) :
        tab === 'Idle Resources' ? api.getIdleResources({ ...params, status: 'open' }) :
        tab === 'Reserved Instances' ? api.getReservedInstances({ ...params, status: 'open' }) :
        tab === 'Savings Plans' ? api.getSavingsPlans({ ...params, status: 'open' }) :
        api.getOptimizationHistory(params);
      const res = await call;
      setTabRows(res.items);
    }
  }

  function copyText(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const displayedRows = tab === 'Recommendations' ? savingsOpportunities : tabRows;

  const baseColumns: Column<CostRecommendation>[] = [
    { key: 'resource', header: 'Resource', render: r => r.resource_id ?? '—', sortValue: r => r.resource_id ?? '' },
    { key: 'issue', header: 'Issue', render: r => r.issue, sortValue: r => r.issue },
    { key: 'action', header: 'Recommended Action', render: r => r.recommended_action, sortValue: r => r.recommended_action },
    { key: 'savings', header: '$/mo Savings', render: r => money(r.potential_monthly_savings), sortValue: r => r.potential_monthly_savings },
    { key: 'priority', header: 'Priority', render: r => <Badge tone={r.priority === 'high' ? 'critical' : r.priority === 'medium' ? 'warning' : 'good'}>{r.priority}</Badge>, sortValue: r => r.priority },
  ];
  const actionsColumn: Column<CostRecommendation> = {
    key: 'actions', header: 'Actions', render: r => (
      <div className="flex gap-2 text-xs">
        <button onClick={e => { e.stopPropagation(); setSelected(r); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Apply</button>
        <button onClick={e => { e.stopPropagation(); void markDone(r.id, 'dismissed'); }} className="text-slate-400 hover:underline">Dismiss</button>
      </div>
    ),
  };
  const statusColumn: Column<CostRecommendation> = {
    key: 'status', header: 'Status', render: r => <Badge tone={r.status === 'applied' ? 'good' : 'neutral'}>{r.status}</Badge>, sortValue: r => r.status,
  };
  const columns: Column<CostRecommendation>[] = tab === 'History' ? [...baseColumns, statusColumn] : [...baseColumns, actionsColumn];

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
      <FilterBar title="Cost Optimization" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Potential Monthly Savings" value={money(potentialMonthly)} />
        <StatCard label="Annualized Savings" value={money(potentialAnnual)} />
        <StatCard label="Open Opportunities" value={String(dashboard?.openRecommendations ?? 0)} />
        <StatCard label="High Priority" value={String(savingsOpportunities.filter(r => r.priority === 'high').length)} />
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
          <p>{dashboard?.openRecommendations ?? 0} open recommendation{dashboard?.openRecommendations === 1 ? '' : 's'} across your connected AWS accounts, worth {money(potentialMonthly)}/month if fully applied.</p>
          <p className="mt-2">Recommendations are generated each time you run "Sync Now" on an AWS account — from your discovered resource inventory (idle instances, unattached volumes, unreleased IPs, stale snapshots), and from AWS Cost Explorer's own Reserved Instance and Savings Plan recommendation APIs. RI/Savings Plan recommendations only appear once an account has 30 days of steady enough on-demand usage for AWS to have something to recommend — a new or low-usage account legitimately shows none yet, which is expected, not a bug.</p>
          <p className="mt-2">CloudOps360 only ever requests read-only AWS permissions, so it can't make changes to your account itself. Clicking <span className="font-medium text-slate-700 dark:text-slate-200">Apply</span> on a recommendation shows you its details so you can action it yourself.</p>
          {dashboard && dashboard.openAnomalies > 0 && (
            <p className="mt-2">There {dashboard.openAnomalies === 1 ? 'is' : 'are'} also {dashboard.openAnomalies} open cost anomal{dashboard.openAnomalies === 1 ? 'y' : 'ies'} — see Cost Anomaly Detection on the Cost Management page.</p>
          )}
        </div>
      ) : tab === 'Cost Anomalies' ? (
        <DataTable columns={anomalyColumns} rows={anomalies} rowKey={a => a.id} emptyMessage="No anomalies detected — day-over-day service cost spikes >50% will show up here." />
      ) : (
        <>
          <DataTable columns={columns} rows={displayedRows} rowKey={r => r.id} emptyMessage={tab === 'History' ? 'No applied or dismissed recommendations yet.' : 'No recommendations in this category yet.'} />
          {tabLoading && <p className="text-xs text-slate-400 mt-2">Loading…</p>}
        </>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Apply recommendation">
        {selected && (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Resource ID</div>
              <div className="text-slate-700 dark:text-slate-200 font-mono text-xs">{selected.resource_id ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Issue</div>
              <div className="text-slate-700 dark:text-slate-200">{selected.issue}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Recommended Action</div>
              <div className="rounded-lg bg-slate-900 dark:bg-black text-slate-100 text-xs p-3 whitespace-pre-wrap">{selected.recommended_action}</div>
              <button onClick={() => copyText(selected.recommended_action)} className="mt-2 text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                {copied ? 'Copied' : 'Copy recommended action'}
              </button>
            </div>

            <p className="text-xs text-slate-400 dark:text-slate-500">CloudOps360 only has read-only access to your AWS account and never makes this change for you — action it yourself in the AWS Console or CLI, then mark it done here.</p>

            <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => void markDone(selected.id, 'applied')} className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">I've done this — mark as done</button>
              <button onClick={() => void markDone(selected.id, 'dismissed')} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Dismiss</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
