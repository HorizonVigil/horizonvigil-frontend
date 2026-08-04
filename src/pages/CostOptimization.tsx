import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { LineChart } from '../components/charts/LineChart';
import { useFilters } from '../lib/filterContext';
import { useTabParam } from '../lib/useTabParam';
import { useToast } from '../lib/toast';
import { useConfirm } from '../components/ConfirmDialog';
import { api, ApiError, type CostRecommendation, type RecommendationListParams, type CostAnomaly, type CloudResource, type ResourceMetric, type RemediationRequest } from '../lib/api';

/** cost-optimization-api's rightsizing text always has this exact shape (see generateRecommendations.ts's rightsizing issue text) — parsed back out here rather than duplicated as structured columns, since the string is the one source of truth for it and this codebase already leans on that pattern (e.g. Alerts' connectionName lookup) rather than a schema change for a single derived display value. */
function parseRecommendedType(recommendedAction: string): string | null {
  return /Downsize to (\S+)/.exec(recommendedAction)?.[1] ?? null;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

const TABS = ['Overview', 'Recommendations', 'Rightsizing', 'Idle Resources', 'Reserved Instances', 'Savings Plans', 'Cost Anomalies', 'History'] as const;

export function CostOptimization() {
  const { account, refreshToken } = useFilters();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
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
  // Populated only for a rightsizing recommendation — the resource's own
  // record (for its current instanceType/region/AWS id) plus its collected
  // CPU history, both real data already gathered by aws-accounts-api's
  // ec2Metrics.ts scanner, not fetched fresh here.
  const [selectedResource, setSelectedResource] = useState<CloudResource | null>(null);
  const [selectedCpuHistory, setSelectedCpuHistory] = useState<ResourceMetric[]>([]);
  const [selectedDetailLoading, setSelectedDetailLoading] = useState(false);
  // The most recent resize_instance remediation request (if any) already
  // filed for this resource — lets the drawer show "Resize requested",
  // "Awaiting approval", etc. instead of offering a duplicate request.
  const [resizeRequest, setResizeRequest] = useState<RemediationRequest | null>(null);
  const [resizeRequesting, setResizeRequesting] = useState(false);

  useEffect(() => {
    if (!selected || selected.category !== 'rightsizing' || !selected.resource_id) {
      setSelectedResource(null);
      setSelectedCpuHistory([]);
      setResizeRequest(null);
      return;
    }
    let cancelled = false;
    setSelectedDetailLoading(true);
    void Promise.all([
      api.getResource(selected.resource_id),
      api.getMetrics({ resourceId: selected.resource_id, metricName: 'CPUUtilization', limit: 60 }),
      api.listRemediation({ connectionId: selected.connection_id }),
    ]).then(([resource, metrics, remediation]) => {
      if (cancelled) return;
      setSelectedResource(resource);
      setSelectedCpuHistory([...metrics.items].sort((a, b) => a.ts.localeCompare(b.ts)));
      setResizeRequest(remediation.items.find(r => r.resource_id === selected.resource_id && r.action_type === 'resize_instance') ?? null);
    }).finally(() => { if (!cancelled) setSelectedDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  // resize_instance's execute step can only ever safely issue StopInstances
  // and stop there — AWS's stop is itself asynchronous, so a Worker
  // invocation can't block waiting for it. Once a request lands in
  // 'awaiting_stop', this polls finish-resize every few seconds (same "small
  // step, caller drives the loop" shape as the sync/discovery polling
  // elsewhere in this app) until the instance is confirmed stopped and the
  // resize completes.
  // Keyed on id+status (not the resizeRequest object itself) so the interval
  // isn't torn down and rebuilt on every poll tick — setResizeRequest(updated)
  // below produces a new object each time even when status hasn't changed,
  // which would otherwise clear and never recreate the interval.
  const resizeRequestId = resizeRequest?.id;
  const resizeRequestStatus = resizeRequest?.status;
  useEffect(() => {
    if (!resizeRequestId || resizeRequestStatus !== 'awaiting_stop') return;
    const interval = setInterval(() => {
      void api.finishResizeRemediation(resizeRequestId).then(updated => setResizeRequest(updated)).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [resizeRequestId, resizeRequestStatus]);

  async function requestAutomatedResize(recommendation: CostRecommendation, targetInstanceType: string) {
    if (!recommendation.resource_id) return;
    const ok = await confirm(
      `Request an automated resize to "${targetInstanceType}"? This goes through an approval + dry-run before anything actually runs against AWS. Once executed, the instance will stop, resize, and restart — there will be real downtime for that duration.`,
    );
    if (!ok) return;
    setResizeRequesting(true);
    try {
      const created = await api.requestRemediation({
        connectionId: recommendation.connection_id, resourceId: recommendation.resource_id, actionType: 'resize_instance',
        recommendationId: recommendation.id, targetConfig: { targetInstanceType },
      });
      setResizeRequest(created);
      toast('Resize requested — an admin needs to approve it in Automation → Remediation before it runs.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not request automated resize', 'error');
    } finally {
      setResizeRequesting(false);
    }
  }

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

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.category === 'rightsizing' ? 'Rightsizing recommendation' : 'Apply recommendation'} wide={selected?.category === 'rightsizing'}>
        {selected && selected.category === 'rightsizing' ? (
          <RightsizingDetail
            recommendation={selected}
            resource={selectedResource}
            cpuHistory={selectedCpuHistory}
            loading={selectedDetailLoading}
            copied={copied}
            onCopy={copyText}
            onApply={() => void markDone(selected.id, 'applied')}
            onDismiss={() => void markDone(selected.id, 'dismissed')}
            resizeRequest={resizeRequest}
            resizeRequesting={resizeRequesting}
            onRequestResize={targetType => void requestAutomatedResize(selected, targetType)}
          />
        ) : selected && (
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
      {confirmDialog}
    </div>
  );
}

/**
 * The rich per-recommendation view rightsizing gets instead of the generic
 * drawer — current vs. recommended instance size, real collected CPU
 * history (aws-accounts-api's ec2Metrics.ts scanner), and a real,
 * copy-pasteable AWS CLI guided fix (stop -> resize -> start, the only
 * correct order — AWS rejects ModifyInstanceAttribute's InstanceType
 * change on a running instance). Still manual, same "read-only access,
 * action it yourself" posture as the generic drawer — this composes real
 * commands from real data, it doesn't execute them.
 */
const RESIZE_STATUS_LABEL: Record<RemediationRequest['status'], string> = {
  pending_approval: 'Requested — awaiting admin approval', rejected: 'Request rejected', approved: 'Approved — awaiting dry-run',
  dry_run_passed: 'Dry-run passed — awaiting execution', dry_run_failed: 'Dry-run failed', executing: 'Executing…',
  awaiting_stop: 'Stopping instance…', completed: 'Resize completed', failed: 'Resize failed', rolled_back: 'Rolled back',
};
const RESIZE_STATUS_TONE: Record<RemediationRequest['status'], 'good' | 'warning' | 'critical' | 'neutral'> = {
  pending_approval: 'neutral', rejected: 'critical', approved: 'neutral', dry_run_passed: 'neutral', dry_run_failed: 'critical',
  executing: 'warning', awaiting_stop: 'warning', completed: 'good', failed: 'critical', rolled_back: 'neutral',
};

function RightsizingDetail({ recommendation, resource, cpuHistory, loading, copied, onCopy, onApply, onDismiss, resizeRequest, resizeRequesting, onRequestResize }: {
  recommendation: CostRecommendation;
  resource: CloudResource | null;
  cpuHistory: ResourceMetric[];
  loading: boolean;
  copied: boolean;
  onCopy: (text: string) => void;
  onApply: () => void;
  onDismiss: () => void;
  resizeRequest: RemediationRequest | null;
  resizeRequesting: boolean;
  onRequestResize: (targetInstanceType: string) => void;
}) {
  const currentType = typeof resource?.metadata.instanceType === 'string' ? resource.metadata.instanceType : null;
  const recommendedType = parseRecommendedType(recommendation.recommended_action);
  const avgCpu = cpuHistory.length > 0 ? cpuHistory.reduce((s, m) => s + m.value, 0) / cpuHistory.length : null;
  const region = resource?.region ?? '';
  const instanceId = resource?.resource_id ?? '';

  const cliCommands = instanceId && region && recommendedType
    ? [
        `aws ec2 stop-instances --instance-ids ${instanceId} --region ${region}`,
        `aws ec2 wait instance-stopped --instance-ids ${instanceId} --region ${region}`,
        `aws ec2 modify-instance-attribute --instance-id ${instanceId} --instance-type "{\\"Value\\": \\"${recommendedType}\\"}" --region ${region}`,
        `aws ec2 start-instances --instance-ids ${instanceId} --region ${region}`,
      ].join('\n')
    : null;

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={recommendation.priority === 'high' ? 'critical' : recommendation.priority === 'medium' ? 'warning' : 'good'}>{recommendation.priority} priority</Badge>
        {region && <Badge tone="neutral">{region}</Badge>}
        <span className="text-xs text-slate-400 font-mono">{instanceId || recommendation.resource_id}</span>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2"></th>
              <th className="px-3 py-2">Instance Type</th>
              <th className="px-3 py-2 text-right">Est. Monthly Impact</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 dark:border-slate-800/60">
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Current</td>
              <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-100">{currentType ?? (loading ? '…' : '—')}</td>
              <td className="px-3 py-2 text-right text-slate-400">—</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Recommended</td>
              <td className="px-3 py-2 font-mono font-medium text-emerald-600 dark:text-emerald-400">{recommendedType ?? '—'}</td>
              <td className="px-3 py-2 text-right font-medium text-emerald-600 dark:text-emerald-400">Save {money(recommendation.potential_monthly_savings)}/mo</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">CPU Utilization (last {cpuHistory.length} day{cpuHistory.length === 1 ? '' : 's'} collected)</h3>
          {avgCpu !== null && <span className="text-xs text-slate-400">Avg: {avgCpu.toFixed(1)}%</span>}
        </div>
        {loading ? (
          <div className="h-40 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
        ) : cpuHistory.length > 0 ? (
          <LineChart series={[{ label: 'CPU %', points: cpuHistory.map(m => ({ x: m.ts, y: m.value })) }]} valueFormatter={v => `${v.toFixed(1)}%`} height={160} />
        ) : (
          <p className="text-xs text-slate-400 py-6 text-center">No CPU history collected yet for this instance.</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Automated Resize</h3>
          {resizeRequest && <Badge tone={RESIZE_STATUS_TONE[resizeRequest.status]}>{RESIZE_STATUS_LABEL[resizeRequest.status]}</Badge>}
        </div>
        {resizeRequest ? (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p>Target: <span className="font-mono text-slate-700 dark:text-slate-200">{resizeRequest.target_config?.targetInstanceType ?? recommendedType}</span></p>
            {resizeRequest.status === 'pending_approval' && <p>An admin needs to approve this in Automation → Remediation before it runs.</p>}
            {resizeRequest.status === 'dry_run_failed' && <p>{resizeRequest.dry_run_result?.reason ?? 'The pre-execution dry-run failed — see Automation → Remediation for details.'}</p>}
            {resizeRequest.status === 'awaiting_stop' && <p>Instance is stopping — this page checks progress automatically every few seconds, then resizes and restarts it once stopped.</p>}
            {resizeRequest.status === 'failed' && <p>{resizeRequest.execution_result?.errorMessage ?? resizeRequest.execution_result?.reason ?? 'The resize failed — see Automation → Remediation for details.'}</p>}
            {resizeRequest.status === 'completed' && <p>Resize completed successfully — the instance is running on {resizeRequest.target_config?.targetInstanceType}.</p>}
            {resizeRequest.status === 'rejected' && <p>This request was rejected. Dismiss this recommendation or use the manual CLI steps below instead.</p>}
          </div>
        ) : recommendedType ? (
          <>
            <button onClick={() => onRequestResize(recommendedType)} disabled={resizeRequesting} className="text-xs px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
              {resizeRequesting ? 'Requesting…' : 'Request Automated Resize'}
            </button>
            <p className="text-xs text-slate-400 mt-2">Goes through an approval + dry-run before anything runs against AWS — this only files the request. CloudOps360 executes it for real (using this account's own stored credentials) once an admin approves it, rather than you running commands yourself.</p>
          </>
        ) : (
          <p className="text-xs text-slate-400">Not enough resource detail to request an automated resize — see the manual CLI steps below instead.</p>
        )}
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Guided Fix — AWS CLI (manual alternative)</div>
        {cliCommands ? (
          <>
            <pre className="rounded-lg bg-slate-900 dark:bg-black text-slate-100 text-xs p-3 overflow-x-auto whitespace-pre">{cliCommands}</pre>
            <button onClick={() => onCopy(cliCommands)} className="mt-2 text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              {copied ? 'Copied' : 'Copy commands'}
            </button>
            <p className="text-xs text-slate-400 mt-2">Stops the instance (required — AWS rejects an instance-type change while running), resizes it, then starts it back up. There will be real downtime for the duration of the stop/resize/start cycle.</p>
          </>
        ) : (
          <p className="text-xs text-slate-400">{loading ? 'Loading resource details…' : 'Not enough resource detail to generate exact commands — see the recommended action text below instead.'}</p>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">CloudOps360 only has read-only access to your AWS account and never runs these commands for you — run them yourself (Console or CLI), then mark this done here.</p>

      <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onApply} className="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">I've done this — mark as done</button>
        <button onClick={onDismiss} className="text-xs px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Dismiss</button>
      </div>
    </div>
  );
}
