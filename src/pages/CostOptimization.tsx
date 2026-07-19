import { useEffect, useState, useCallback } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { Drawer } from '../components/Drawer';
import { useFilters } from '../lib/filterContext';
import { api, type CostRecommendation } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

const TABS = ['Overview', 'Recommendations', 'Rightsizing', 'Reserved Instances', 'Savings Plans'] as const;

/**
 * CloudOps360 only ever asks for read-only IAM permissions (see
 * lib/leastPrivilegePolicy.ts) — it can never make AWS changes on your
 * behalf. So "Apply" doesn't call AWS; it hands you the exact CLI command
 * for what the recommendation describes, for you to run with your own
 * credentials. Only the well-known rule-based categories below get a
 * command — anything else just has to be actioned manually in the Console.
 */
function awsCliCommand(rec: CostRecommendation): { command: string; caveat?: string } | null {
  const res = rec.cloud_resources;
  if (!res) return null;
  const region = res.region ?? 'us-east-1';
  const id = res.resource_id;
  if (rec.category === 'idle' && res.resource_type_key === 'ec2_instance') {
    return {
      command: `aws ec2 terminate-instances --instance-ids ${id} --region ${region}`,
      caveat: 'Irreversible — this deletes the instance and any volumes set to delete-on-termination. Snapshot first if you might need the data.',
    };
  }
  if (rec.category === 'unattached' && res.resource_type_key === 'ebs_volume') {
    return {
      command: `aws ec2 delete-volume --volume-id ${id} --region ${region}`,
      caveat: 'Irreversible — permanently deletes the volume’s data. Create a snapshot first if you might need it later.',
    };
  }
  if (rec.category === 'unattached' && res.resource_type_key === 'elastic_ip') {
    const flag = id.startsWith('eipalloc-') ? '--allocation-id' : '--public-ip';
    return { command: `aws ec2 release-address ${flag} ${id} --region ${region}` };
  }
  if (rec.category === 'storage_tiering' && res.resource_type_key === 'ebs_snapshot') {
    return {
      command: `aws ec2 modify-snapshot-tier --snapshot-id ${id} --storage-tier archive --region ${region}`,
      caveat: `Archives to lower-cost storage rather than deleting. To delete instead: aws ec2 delete-snapshot --snapshot-id ${id} --region ${region}`,
    };
  }
  return null;
}

export function CostOptimization() {
  const { account, refreshToken } = useFilters();
  const [recommendations, setRecommendations] = useState<CostRecommendation[]>([]);
  const [tab, setTab] = useState<typeof TABS[number]>('Overview');
  const [selected, setSelected] = useState<CostRecommendation | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { recommendations: recs } = await api.getCostRecommendations('open', account === 'all' ? undefined : account);
    setRecommendations(recs);
  }, [account]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const potentialMonthly = recommendations.reduce((sum, r) => sum + Number(r.potential_monthly_savings), 0);
  const potentialAnnual = potentialMonthly * 12;

  async function markDone(id: string, status: 'applied' | 'dismissed') {
    await api.updateCostRecommendation(id, status);
    setSelected(null);
    await load();
  }

  function copyCommand(command: string) {
    void navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
          <button onClick={e => { e.stopPropagation(); setSelected(r); }} className="text-emerald-600 dark:text-emerald-400 hover:underline">Apply</button>
          <button onClick={e => { e.stopPropagation(); void markDone(r.id, 'dismissed'); }} className="text-slate-400 hover:underline">Dismiss</button>
        </div>
      ),
    },
  ];

  const selectedCommand = selected ? awsCliCommand(selected) : null;

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
          <p className="mt-2">CloudOps360 only ever requests read-only AWS permissions, so it can't make changes to your account itself. Clicking <span className="font-medium text-slate-700 dark:text-slate-200">Apply</span> on a recommendation shows you the exact AWS CLI command to run yourself.</p>
        </div>
      ) : (
        <DataTable columns={columns} rows={filteredByTab} rowKey={r => r.id} emptyMessage="No recommendations in this category yet." />
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Apply recommendation">
        {selected && (
          <div className="flex flex-col gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Resource</div>
              <div className="text-slate-700 dark:text-slate-200">{selected.cloud_resources?.resource_name ?? selected.cloud_resources?.resource_id ?? selected.resource_id}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Issue</div>
              <div className="text-slate-700 dark:text-slate-200">{selected.issue}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Recommended Action</div>
              <div className="text-slate-700 dark:text-slate-200">{selected.recommended_action}</div>
            </div>

            {selectedCommand ? (
              <div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mb-1">Run this yourself with your own AWS credentials</div>
                <div className="rounded-lg bg-slate-900 dark:bg-black text-slate-100 font-mono text-xs p-3 overflow-x-auto whitespace-pre">{selectedCommand.command}</div>
                <button onClick={() => copyCommand(selectedCommand.command)} className="mt-2 text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  {copied ? 'Copied' : 'Copy command'}
                </button>
                {selectedCommand.caveat && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{selectedCommand.caveat}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No pre-built command for this category yet — action this one manually in the AWS Console.</p>
            )}

            <p className="text-xs text-slate-400 dark:text-slate-500">CloudOps360 only has read-only access to your AWS account and never runs this for you.</p>

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
