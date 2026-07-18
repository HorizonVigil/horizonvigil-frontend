import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { ConnectAwsAccountWizard } from '../components/ConnectAwsAccountWizard';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { api, type CloudConnection } from '../lib/api';

export function AwsAccounts() {
  const { projects } = useOrg();
  const { refreshToken } = useFilters();
  const navigate = useNavigate();
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; stepId: string } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { connections: rows } = await api.getConnections();
    setConnections(rows);
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  async function handleSyncNow(id: string) {
    setBusyId(id);
    setSyncError(null);
    setProgress(null);
    try {
      // Scanned one service at a time, not all ~57 in one request — a single
      // request doing everything reliably exceeds Cloudflare's free-tier
      // per-request CPU/subrequest limits and gets killed by the platform
      // with no error at all. See discovery.ts for the full story.
      await api.runDiscoverySteps(id, (done, total, stepId) => setProgress({ done, total, stepId }));
      await api.syncConnectionCost(id).catch(() => {}); // best-effort — Cost Explorer needs to be enabled on the account
      await api.generateRecommendations(id).catch(() => {});
      await load();
    } catch (err) {
      setSyncError((err as Error).message || 'Sync failed — see the error message in the table below for detail.');
      await load();
    } finally {
      setBusyId(null);
      setProgress(null);
    }
  }

  async function handleDisconnect(id: string) {
    if (!confirm('Disconnect this AWS account? Discovered resources and cost history will be removed.')) return;
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
      key: 'actions', header: 'Actions', render: c => (
        <div className="flex gap-2 text-xs items-center">
          <button onClick={e => { e.stopPropagation(); void handleSyncNow(c.id); }} disabled={busyId === c.id} className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">
            {busyId === c.id ? (progress ? `Scanning ${progress.done}/${progress.total}…` : 'Starting…') : 'Sync Now'}
          </button>
          <button onClick={e => { e.stopPropagation(); void handleDisconnect(c.id); }} className="text-red-500 hover:underline">Disconnect</button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <FilterBar title="AWS Accounts" breadcrumb={<Breadcrumb />} />

      <div className="flex justify-end mb-3">
        <button onClick={() => setWizardOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2">+ Add AWS Account</button>
      </div>

      {syncError && (
        <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex justify-between items-center">
          <span>{syncError}</span>
          <button onClick={() => setSyncError(null)} className="text-red-400 hover:text-red-600 ml-3">×</button>
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
    </div>
  );
}
