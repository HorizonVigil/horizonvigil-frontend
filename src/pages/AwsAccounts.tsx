import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { ConnectAwsAccountWizard } from '../components/ConnectAwsAccountWizard';
import { useConfirm } from '../components/ConfirmDialog';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { api, type CloudConnection, type AccountSummary, type CrossAccountRole } from '../lib/api';

const TABS = ['Inventory', 'Organizations', 'Cross-Account Roles', 'Credentials', 'Sync Status', 'Health'] as const;
type Tab = typeof TABS[number];

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function AwsAccounts() {
  const { projects } = useOrg();
  const { refreshToken } = useFilters();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { syncStates, startSync } = useSync();
  const [tab, setTab] = useState<Tab>('Inventory');
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Tab-specific data
  const [awsOrgs, setAwsOrgs] = useState<{ awsAccountId: string; connections: { aws_account_id: string; connection_name: string; environment: string; status: string }[] }[]>([]);
  const [crossAccountRoles, setCrossAccountRoles] = useState<CrossAccountRole[]>([]);
  const [syncStatus, setSyncStatus] = useState<AccountSummary[]>([]);
  const [health, setHealth] = useState<{ healthy: number; unhealthy: number; total: number; accounts: AccountSummary[] } | null>(null);

  const load = useCallback(async () => {
    const { items } = await api.getAccounts({ limit: 200 });
    setConnections(items);
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);
  // Test-connection state keeps running in the background (see syncContext.tsx)
  // even if you navigate away mid-request — this refreshes the table once it
  // finishes, whether that happens while you're on this page or you come back later.
  useSyncCompletion(connections.map(c => c.id), load);

  // Each secondary tab's data is only fetched once you actually open it, and
  // re-fetched on refreshToken while that tab is active — no point pulling
  // Organizations/Cross-Account Roles/Sync Status/Health on every load() when
  // most visits only ever look at Inventory.
  useEffect(() => {
    if (tab === 'Organizations') void api.getAwsOrganizations().then(r => setAwsOrgs(r.awsAccounts));
    else if (tab === 'Cross-Account Roles') void api.getCrossAccountRoles().then(r => setCrossAccountRoles(r.roles));
    else if (tab === 'Sync Status') void api.getAccountsSyncStatus().then(r => setSyncStatus(r.accounts));
    else if (tab === 'Health') void api.getAccountsHealth().then(setHealth);
  }, [tab, refreshToken]);

  async function handleDisconnect(id: string) {
    if (!(await confirm('Disconnect this AWS account? It will be marked disconnected — discovered resources and cost history are kept.'))) return;
    await api.disconnectAccount(id);
    await load();
  }

  const columns: Column<CloudConnection>[] = [
    { key: 'name', header: 'Name', render: c => c.connection_name ?? c.aws_account_id, sortValue: c => c.connection_name ?? c.aws_account_id },
    { key: 'accountId', header: 'Account ID', render: c => <span className="font-mono text-xs">{c.aws_account_id}</span>, sortValue: c => c.aws_account_id },
    { key: 'environment', header: 'Environment', render: c => <Badge tone="neutral">{c.environment}</Badge>, sortValue: c => c.environment },
    {
      key: 'status', header: 'Status', render: c => (
        <div className="flex flex-col gap-0.5">
          <Badge>{c.status}</Badge>
          {c.status === 'error' && c.error_message && <span className="text-[10px] text-red-500 max-w-[16rem] truncate" title={c.error_message}>{c.error_message}</span>}
        </div>
      ), sortValue: c => c.status,
    },
    { key: 'method', header: 'Connection', render: c => c.connection_method === 'cross_account_role' ? 'Cross-account role' : 'Access key', sortValue: c => c.connection_method },
    { key: 'region', header: 'Region', render: c => c.default_region, sortValue: c => c.default_region },
    { key: 'resources', header: 'Resources', render: c => c.resource_summary?.totalResources?.toLocaleString() ?? '—', sortValue: c => c.resource_summary?.totalResources ?? 0 },
    { key: 'lastSync', header: 'Last Sync', render: c => c.last_sync_at ? new Date(c.last_sync_at).toLocaleString() : 'Never', sortValue: c => c.last_sync_at ?? '' },
    {
      key: 'actions', header: 'Actions', render: c => {
        const sync = syncStates[c.id];
        const running = sync?.status === 'running';
        return (
          <div className="flex gap-2 text-xs items-center">
            <button onClick={e => { e.stopPropagation(); startSync(c.id); }} disabled={running} className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50" title="Confirms stored credentials are present and well-formed — not a live AWS check">
              {running ? 'Testing…' : 'Test Connection'}
            </button>
            <button onClick={e => { e.stopPropagation(); void handleDisconnect(c.id); }} className="text-red-500 hover:underline">Disconnect</button>
          </div>
        );
      },
    },
  ];

  const anyErrors = connections.map(c => syncStates[c.id]).filter(s => s?.status === 'error' && s.error);

  const crossAccountColumns: Column<CrossAccountRole>[] = [
    { key: 'name', header: 'Name', render: r => r.connection_name, sortValue: r => r.connection_name },
    { key: 'accountId', header: 'Account ID', render: r => <span className="font-mono text-xs">{r.aws_account_id}</span> },
    { key: 'roleArn', header: 'Role ARN', render: r => <span className="font-mono text-[11px] break-all">{r.role_arn}</span> },
    { key: 'externalId', header: 'External ID', render: r => <span className="font-mono text-[11px]">{r.external_id}</span> },
    { key: 'status', header: 'Status', render: r => <Badge>{r.status}</Badge>, sortValue: r => r.status },
    { key: 'created', header: 'Connected', render: r => new Date(r.created_at).toLocaleDateString(), sortValue: r => r.created_at },
  ];

  const syncColumns: Column<AccountSummary>[] = [
    { key: 'name', header: 'Name', render: a => a.connection_name, sortValue: a => a.connection_name },
    { key: 'status', header: 'Status', render: a => <Badge>{a.status}</Badge>, sortValue: a => a.status },
    { key: 'lastSync', header: 'Last Sync', render: a => a.last_sync_at ? new Date(a.last_sync_at).toLocaleString() : 'Never', sortValue: a => a.last_sync_at ?? '' },
    { key: 'lastDiscovery', header: 'Last Discovery', render: a => a.last_discovery_at ? new Date(a.last_discovery_at).toLocaleString() : 'Never', sortValue: a => a.last_discovery_at ?? '' },
    { key: 'error', header: 'Error', render: a => a.error_message ? <span className="text-red-500 text-xs">{a.error_message}</span> : '—' },
  ];

  const healthColumns: Column<AccountSummary>[] = [
    { key: 'name', header: 'Name', render: a => a.connection_name, sortValue: a => a.connection_name },
    {
      key: 'healthy', header: 'Health', render: a => {
        const isHealthy = a.status === 'connected' && !a.error_message;
        return <Badge tone={isHealthy ? 'good' : 'critical'}>{isHealthy ? 'Healthy' : 'Unhealthy'}</Badge>;
      },
    },
    { key: 'status', header: 'Status', render: a => <Badge tone="neutral">{a.status}</Badge>, sortValue: a => a.status },
    { key: 'lastDiscovery', header: 'Last Discovery', render: a => a.last_discovery_at ? new Date(a.last_discovery_at).toLocaleString() : 'Never' },
    { key: 'error', header: 'Error', render: a => a.error_message ? <span className="text-red-500 text-xs">{a.error_message}</span> : '—' },
  ];

  function rotationDueInDays(keyRotatedAt: string | null): number | null {
    if (!keyRotatedAt) return null;
    return Math.max(0, 90 - Math.floor((Date.now() - new Date(keyRotatedAt).getTime()) / (24 * 60 * 60 * 1000)));
  }

  return (
    <div>
      <FilterBar title="AWS Accounts" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm flex-wrap">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setWizardOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 shrink-0">+ Add AWS Account</button>
      </div>

      {tab === 'Inventory' && (
        <>
          {anyErrors.length > 0 && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {anyErrors[0]!.error}
            </div>
          )}
          <DataTable
            columns={columns}
            rows={connections}
            rowKey={c => c.id}
            onRowClick={c => navigate(`/aws-accounts/${c.id}`)}
            emptyMessage="No AWS accounts connected yet. Click “+ Add AWS Account” to connect your first one."
          />
        </>
      )}

      {tab === 'Organizations' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-400">Connected accounts grouped by their 12-digit AWS account id — this is a grouping of this org's own connections, not a live read of AWS Organizations (that needs organizations:List* calls against a payer account, not built in this pass).</p>
          {awsOrgs.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No AWS accounts connected yet.</p>}
          {awsOrgs.map(group => (
            <div key={group.awsAccountId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 font-mono mb-2">{group.awsAccountId}</div>
              <ul className="flex flex-col gap-1.5">
                {group.connections.map((c, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{c.connection_name}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone="neutral">{c.environment}</Badge>
                      <Badge>{c.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {tab === 'Cross-Account Roles' && (
        <DataTable columns={crossAccountColumns} rows={crossAccountRoles} rowKey={r => r.id} emptyMessage="No accounts connected via cross-account role yet — the recommended connection method, see “+ Add AWS Account”." />
      )}

      {tab === 'Credentials' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Masked Access Key</th>
                <th className="px-3 py-2">Key Rotated</th>
                <th className="px-3 py-2">Rotation Due</th>
              </tr>
            </thead>
            <tbody>
              {connections.map(c => {
                const daysLeft = rotationDueInDays(c.key_rotated_at);
                const overdue = daysLeft !== null && daysLeft <= 0;
                return (
                  <tr key={c.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{c.connection_name ?? c.aws_account_id}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{c.connection_method === 'cross_account_role' ? 'Cross-account role' : 'Access key'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{c.masked_access_key ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{c.key_rotated_at ? new Date(c.key_rotated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-2">
                      {daysLeft === null ? <span className="text-slate-400">—</span> : (
                        <Badge tone={overdue ? 'critical' : daysLeft <= 14 ? 'warning' : 'good'}>{overdue ? 'Overdue' : `${daysLeft}d left`}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {connections.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No AWS accounts connected yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Sync Status' && (
        <DataTable columns={syncColumns} rows={syncStatus} rowKey={a => a.id} emptyMessage="No AWS accounts connected yet." />
      )}

      {tab === 'Health' && (
        <div className="flex flex-col gap-4">
          {health && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">Total Accounts</div>
                <div className="text-2xl font-semibold text-slate-900 dark:text-white">{health.total}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">Healthy</div>
                <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{health.healthy}</div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">Unhealthy</div>
                <div className="text-2xl font-semibold text-red-600 dark:text-red-400">{health.unhealthy}</div>
              </div>
            </div>
          )}
          <DataTable columns={healthColumns} rows={health?.accounts ?? []} rowKey={a => a.id} emptyMessage="No AWS accounts connected yet." />
        </div>
      )}

      <ConnectAwsAccountWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onConnected={load} projects={projects} />
      {confirmDialog}
    </div>
  );
}
