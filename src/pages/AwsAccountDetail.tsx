import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Donut } from '../components/charts/Donut';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { api, type CloudConnection, type CloudResource, type CostSnapshot } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

type AccountCredentials = {
  connectionMethod: string; maskedAccessKey: string | null; keyRotatedAt: string | null;
  rotationDueInDays: number | null; roleArn: string | null; externalId: string | null;
};

export function AwsAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncStates, startSync } = useSync();
  const [connection, setConnection] = useState<CloudConnection | null>(null);
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [costSnapshots, setCostSnapshots] = useState<CostSnapshot[]>([]);
  const [credentials, setCredentials] = useState<AccountCredentials | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [conn, resourcesRes, costRes, creds] = await Promise.all([
      api.getAccount(id),
      api.getResourceInventory({ connectionId: id, limit: 200 }),
      api.getCostExplorer({ connectionId: id, limit: 200 }),
      api.getAccountCredentials(id),
    ]);
    setConnection(conn);
    setResources(resourcesRes.items);
    setCostSnapshots(costRes.items);
    setCredentials(creds);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  // Test-connection state keeps running in the background (see syncContext.tsx)
  // even if you navigate away mid-request — this refreshes once it finishes,
  // whether that happens while you're sitting on this page or you come back later.
  useSyncCompletion(id ? [id] : [], load);

  if (!connection) return <div className="text-sm text-slate-400">Loading…</div>;

  const sync = id ? syncStates[id] : undefined;
  const syncing = sync?.status === 'running';

  const iamCounts = {
    users: resources.filter(r => r.resource_type_key === 'iam_user').length,
    roles: resources.filter(r => r.resource_type_key === 'iam_role').length,
    policies: resources.filter(r => r.resource_type_key === 'iam_policy').length,
  };
  const categoryCounts: Record<string, number> = {};
  for (const r of resources) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;

  const totalCost = costSnapshots.reduce((sum, c) => sum + Number(c.unblended_cost), 0);
  const costByService: Record<string, number> = {};
  for (const c of costSnapshots) costByService[c.service] = (costByService[c.service] ?? 0) + Number(c.unblended_cost);
  const topServices = Object.entries(costByService).sort(([, a], [, b]) => b - a).slice(0, 5);

  return (
    <div>
      <FilterBar title={connection.connection_name ?? connection.aws_account_id} breadcrumb={<Link to="/aws-accounts" className="text-xs text-slate-400 hover:underline">← AWS Accounts</Link>} showAccountFilter={false} />

      <div className="flex items-center gap-2 mb-5">
        <Badge>{connection.status}</Badge>
        <Badge tone="neutral">{connection.environment}</Badge>
        <span className="text-xs text-slate-400 font-mono">{connection.aws_account_id}</span>
        <div className="flex-1" />
        <button onClick={() => id && startSync(id)} disabled={syncing} title="Confirms stored credentials are present and well-formed — not a live AWS check" className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1.5 disabled:opacity-50">
          {syncing ? 'Testing…' : 'Test Connection'}
        </button>
      </div>
      {sync?.status === 'done' && sync.warning && <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 -mt-3">{sync.warning}</p>}
      {sync?.status === 'error' && sync.error && (
        <div className="mb-4 -mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {sync.error}
        </div>
      )}
      {connection.status === 'error' && connection.error_message && (
        <div className="mb-4 -mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
          {connection.error_message}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Resources" value={(connection.resource_summary?.totalResources ?? resources.length).toLocaleString()} />
        <StatCard label="IAM Users / Roles / Policies" value={`${iamCounts.users} / ${iamCounts.roles} / ${iamCounts.policies}`} />
        <StatCard label="Last Sync" value={connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleDateString() : 'Never'} />
        <StatCard label="Cost (Explorer, loaded range)" value={money(totalCost)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Breakdown</h3>
          <Donut data={Object.entries(categoryCounts).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(resources.length), caption: 'resources' }} />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Credentials</h3>
          <div className="text-sm space-y-2">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Method</span><span className="text-slate-800 dark:text-slate-100">{(credentials?.connectionMethod ?? connection.connection_method) === 'cross_account_role' ? 'Cross-account role' : 'Access key'}</span></div>
            {credentials?.maskedAccessKey && (
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Access Key</span><span className="font-mono text-slate-800 dark:text-slate-100">{credentials.maskedAccessKey}</span></div>
            )}
            {(credentials?.roleArn ?? connection.role_arn) && (
              <div className="flex justify-between gap-2"><span className="text-slate-500 dark:text-slate-400 shrink-0">Role ARN</span><span className="font-mono text-xs text-slate-800 dark:text-slate-100 truncate">{credentials?.roleArn ?? connection.role_arn}</span></div>
            )}
            <div className="flex justify-between gap-2"><span className="text-slate-500 dark:text-slate-400 shrink-0">Regions Scanned</span><span className="text-xs text-slate-800 dark:text-slate-100 text-right">{connection.scan_regions?.length ? connection.scan_regions.join(', ') : connection.default_region}</span></div>
            {credentials?.rotationDueInDays != null && (
              <div className={`rounded-md px-2.5 py-1.5 text-xs mt-2 ${credentials.rotationDueInDays < 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                {credentials.rotationDueInDays < 0 ? `Key rotation overdue by ${Math.abs(credentials.rotationDueInDays)} days` : `Next key rotation due in ${credentials.rotationDueInDays} days`}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost (Cost Explorer)</h3>
          {costSnapshots.length > 0 ? (
            <div className="text-sm space-y-2">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total (loaded range)</span><span className="text-slate-800 dark:text-slate-100 font-medium">{money(totalCost)}</span></div>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {topServices.map(([service, cost]) => (
                  <li key={service} className="flex justify-between py-1.5 text-xs">
                    <span className="text-slate-600 dark:text-slate-300">{service}</span>
                    <span className="text-slate-800 dark:text-slate-100 tabular-nums">{money(cost)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400">Service/region-level cost from Cost Explorer, not per-resource.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">No cost data yet for this account.</p>
          )}
        </div>
      </div>

      <button onClick={() => navigate(`/resources/all?account=${connection.id}`)} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View all resources for this account →</button>
    </div>
  );
}
