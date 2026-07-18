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
    const { connections: rows } = await api.getConnections();
    setConnections(rows);
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);
  // Sync keeps running in the background (see syncContext.tsx) even if you
  // navigate away mid-run — this refreshes the table once it finishes,
  // whether that happens while you're sitting on this page or you come back
  // to it later.
  useSyncCompletion(connections.map(c => c.id), load);

  async function handleDisconnect(id: string) {
    if (!(await confirm('Disconnect this AWS account? Discovered resources and cost history will be removed.'))) return;
    await api.deleteConnection(id);
    await load();
  }

  const columns: Column<CloudConnection>[] = [
    { key: 'name', header: 'Name', render: c => c.connectionName ?? c.awsAccountId, sortValue: c => c.connectionName ?? c.awsAccountId },
    { key: 'accountId', header: 'Account ID', render: c => <span className="font-mono text-xs">{c.awsAccountId}</span>, sortValue: c => c.awsAccountId },
    { key: 'environment', header: 'Environment', render: c => <Badge tone="neutral">{c.environment}</Badge>, sortValue: c => c.environment },
    {
      key: 'status', header: 'Status', render: c => (
        <div className="flex flex-col gap-0.5">
          <Badge>{c.status}</Badge>
          {c.status === 'error' && c.errorMessage && <span className="text-[10px] text-red-500 max-w-[16rem] truncate" title={c.errorMessage}>{c.errorMessage}</span>}
        </div>
      ), sortValue: c => c.status,
    },
    { key: 'method', header: 'Connection', render: c => c.connectionMethod === 'cross_account_role' ? 'Cross-account role' : 'Access key', sortValue: c => c.connectionMethod },
    { key: 'region', header: 'Region', render: c => c.defaultRegion, sortValue: c => c.defaultRegion },
    { key: 'resources', header: 'Resources', render: c => c.resourceSummary?.totalResources?.toLocaleString() ?? '—', sortValue: c => c.resourceSummary?.totalResources ?? 0 },
    { key: 'lastSync', header: 'Last Sync', render: c => c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString() : 'Never', sortValue: c => c.lastSyncAt ?? '' },
    {
      key: 'actions', header: 'Actions', render: c => {
        const sync = syncStates[c.id];
        const running = sync?.status === 'running';
        return (
          <div className="flex gap-2 text-xs items-center">
            <button onClick={e => { e.stopPropagation(); startSync(c.id); }} disabled={running} className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">
              {running ? (sync?.total ? `Scanning ${sync.done}/${sync.total}…` : 'Starting…') : 'Sync Now'}
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
      <FilterBar title="AWS Accounts" breadcrumb={<Breadcrumb />} />

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
