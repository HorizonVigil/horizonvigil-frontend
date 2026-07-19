import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useFilters } from '../lib/filterContext';
import { api, type CostRecommendation } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

const TABS = ['Overview', 'Recommendations', 'Rightsizing', 'Reserved Instances', 'Savings Plans'] as const;

export function CostOptimization() {
  const { account, refreshToken } = useFilters();
  const [recommendations, setRecommendations] = useState<CostRecommendation[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]>('Overview');

  const load = useCallback(async () => {
    const { recommendations: recs } = await api.getCostRecommendations('open', account === 'all' ? undefined : account);
    setRecommendations(recs);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const potentialMonthly = recommendations.reduce((sum, r) => sum + Number(r.potential_monthly_savings), 0);
  const potentialAnnual = potentialMonthly * 12;

  async function act(id: string, status: 'applied' | 'dismissed') {
    await api.updateCostRecommendation(id, status);
    await load();
  }

  const filteredByTab = tab === 'Rightsizing' ? recommendations.filter(r => r.category === 'rightsizing' || r.category === 'idle')
    : tab === 'Reserved Instances' ? recommendations.filter(r => r.category === 'reserved_instance')
    : tab === 'Savings Plans' ? recommendations.filter(r => r.category === 'savings_plan')
    : recommendations;

  const columns: Column<CostRecommendation>[] = [
    { key: 'resource', header: 'Resource', render: r => r.cloud_resources?.resource_name ?? r.resource_id ?? '—', sortValue: r => r.cloud_resources?.resource_name ?? '' },
    { key: 'issue', header: 'Issue', render: r => r.issue, sortValue: r => r.issue },
    { key: 'action', header: 'Recommended Action', render: r => r.recommended_action, sortValue: r => r.recommended_action },
    { key: 'savings', header: '$/mo Savings', render: r => money(r.potential_monthly_savings), sortValue: r => r.potential_monthly_savings },
    { key: 'priority', header: 'Priority', render: r => <Badge tone={r.priority === 'high' ? 'critical' : r.priority === 'medium' ? 'warning' : 'good'}>{r.priority}</Badge>, sortValue: r => r.priority },
    {
      key: 'actions', header: 'Actions', render: r => (
        <div className="flex gap-2 text-xs">
          <button onClick={e => { e.stopPropagation(); void act(r.id, 'applied'); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Apply</button>
          <button onClick={e => { e.stopPropagation(); void act(r.id, 'dismissed'); }} className="text-slate-400 hover:underline">Dismiss</button>
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
        <StatCard label="Open Opportunities" value={String(recommendations.length)} />
        <StatCard label="High Priority" value={String(recommendations.filter(r => r.priority === 'high').length)} />
      </div>

      <div className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`text-sm px-3 py-2 border-b-2 -mb-px ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500 dark:text-slate-400">
          <p>{recommendations.length} open recommendation{recommendations.length === 1 ? '' : 's'} across your connected AWS accounts, worth {money(potentialMonthly)}/month if fully applied.</p>
          <p className="mt-2">Recommendations are generated from your discovered resource inventory (idle instances, unattached volumes, unreleased IPs, stale snapshots) each time you run “Sync Now” on an AWS account. Reserved Instance and Savings Plan recommendations require Cost Explorer's recommendation API and aren't wired up yet.</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={filteredByTab} rowKey={r => r.id} emptyMessage="No recommendations in this category yet." />
      )}
    </div>
  );
}
