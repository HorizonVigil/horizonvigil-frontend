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
import { api, type CloudConnection } from '../lib/api';

export function AwsAccounts() {
  const { projects } = useOrg();
  const { refreshToken } = useFilters();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { syncStates, startSync } = useSync();
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    const { items } = await api.getAccounts({ limit: 200 });
    setConnections(items);
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);
  // Test-connection state keeps running in the background (see syncContext.tsx)
  // even if you navigate away mid-request — this refreshes the table once it
  // finishes, whether that happens while you're on this page or you come back later.
  useSyncCompletion(connections.map(c => c.id), load);

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

  return (
    <div>
      <FilterBar title="AWS Accounts" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex justify-end mb-3">
        <button onClick={() => setWizardOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ Add AWS Account</button>
      </div>

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

      <ConnectAwsAccountWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onConnected={load} projects={projects} />
      {confirmDialog}
    </div>
  );
}
