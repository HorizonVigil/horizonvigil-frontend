import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { useFilters, dateRangeToDays } from '../lib/filterContext';
import { api, type CostAnomaly } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function CostManagement() {
  const { dateRange, refreshToken } = useFilters();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.getCostSummary>> | null>(null);
  const [anomalies, setAnomalies] = useState<CostAnomaly[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, anomaliesRes] = await Promise.all([
        api.getCostSummary(dateRangeToDays(dateRange)),
        api.getCostAnomalies(),
      ]);
      setSummary(summaryRes);
      setAnomalies(anomaliesRes.anomalies);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const totalByService = summary?.byService.reduce((sum, s) => sum + s.cost, 0) ?? 0;

  const anomalyColumns: Column<CostAnomaly>[] = [
    { key: 'service', header: 'Service', render: a => a.service, sortValue: a => a.service },
    { key: 'usage_date', header: 'Date', render: a => a.usage_date, sortValue: a => a.usage_date },
    { key: 'expected_cost', header: 'Expected', render: a => money(a.expected_cost), sortValue: a => a.expected_cost },
    { key: 'actual_cost', header: 'Actual', render: a => money(a.actual_cost), sortValue: a => a.actual_cost },
    { key: 'percent_change', header: '% Change', render: a => <span className="text-amber-500 font-medium">+{a.percent_change.toFixed(0)}%</span>, sortValue: a => a.percent_change },
    { key: 'dollar_impact', header: '$ Impact', render: a => money(a.dollar_impact), sortValue: a => a.dollar_impact },
    { key: 'status', header: 'Status', render: a => <Badge>{a.status}</Badge>, sortValue: a => a.status },
  ];

  return (
    <div>
      <FilterBar title="Cost Management" breadcrumb={<Breadcrumb />} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Cost (MTD)" value={money(summary?.mtdCost ?? 0)} />
        <StatCard label="Forecasted Cost" value={money(summary?.forecastCost ?? 0)} caption="end of month" />
        <StatCard label="Avg Daily Cost" value={money(summary?.avgDailyCost ?? 0)} />
        <StatCard label="Open Anomalies" value={String(anomalies.filter(a => a.status === 'open').length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:col-span-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost Over Time</h3>
          <LineChart series={[{ label: 'Daily Cost', points: (summary?.daily ?? []).map(d => ({ x: d.date, y: d.cost })) }]} valueFormatter={money} />
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost by Service</h3>
          <Donut data={(summary?.byService ?? []).slice(0, 8).map(s => ({ label: s.service, value: s.cost }))} centerLabel={{ value: money(totalByService).replace('.00', ''), caption: 'total' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost by Account</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {(summary?.byAccount ?? []).map(a => (
              <li key={a.accountId} className="flex justify-between"><span className="text-slate-600 dark:text-slate-300 font-mono text-xs">{a.accountId}</span><span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(a.cost)}</span></li>
            ))}
            {(!summary || summary.byAccount.length === 0) && <li className="text-slate-400 text-sm">No cost data synced yet.</li>}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost by Region</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {(summary?.byRegion ?? []).map(r => (
              <li key={r.region} className="flex justify-between"><span className="text-slate-600 dark:text-slate-300">{r.region}</span><span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(r.cost)}</span></li>
            ))}
            {(!summary || summary.byRegion.length === 0) && <li className="text-slate-400 text-sm">No cost data synced yet.</li>}
          </ul>
        </div>
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
            {(summary?.byService ?? []).map(s => (
              <tr key={s.service} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                <td className="py-2 text-slate-700 dark:text-slate-200">{s.service}</td>
                <td className="py-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(s.cost)}</td>
                <td className="py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">{totalByService > 0 ? ((s.cost / totalByService) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(!summary || summary.byService.length === 0) && <p className="text-sm text-slate-400 mt-3">No cost data yet — sync cost from an AWS account's detail page.</p>}
      </div>
      {loading && <p className="text-xs text-slate-400 mt-3">Loading…</p>}
    </div>
  );
}
