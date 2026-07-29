import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { ConnectAwsAccountWizard } from '../components/ConnectAwsAccountWizard';
import { useConfirm } from '../components/ConfirmDialog';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { useTabParam } from '../lib/useTabParam';
import { downloadExcel } from '../lib/excelExport';
import { api, type CloudConnection, type AccountSummary, type CrossAccountRole, type AwsAccountsDashboard, type AccountPermissionSummary } from '../lib/api';

const TABS = ['Dashboard', 'Inventory', 'Organizations', 'Cross-Account Roles', 'Credentials', 'Sync Status', 'Health', 'Regions', 'Permission Validation', 'Reports'] as const;
type Tab = typeof TABS[number];

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const STATUS_OPTIONS = ['connected', 'pending', 'error', 'disconnected', 'expired'];
const ENVIRONMENT_OPTIONS = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];
const REPORT_KINDS = [
  { kind: 'account-summary' as const, label: 'Account Summary' },
  { kind: 'health' as const, label: 'Health Report' },
  { kind: 'permissions' as const, label: 'Permission Report' },
  { kind: 'sync' as const, label: 'Sync Report' },
  { kind: 'cost' as const, label: 'Cost Report' },
];

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function rotationDueInDays(keyRotatedAt: string | null): number | null {
  if (!keyRotatedAt) return null;
  const elapsedMs = Date.now() - new Date(keyRotatedAt).getTime();
  return Math.max(0, 90 - Math.floor(elapsedMs / (NINETY_DAYS_MS / 90)));
}

export function AwsAccounts() {
  const { projects } = useOrg();
  const { refreshToken } = useFilters();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { syncStates } = useSync();
  const [validatingIds, setValidatingIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Dashboard');
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Inventory search/filter/bulk state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inventoryTotal, setInventoryTotal] = useState(0);

  // Tab-specific data
  const [dashboard, setDashboard] = useState<AwsAccountsDashboard | null>(null);
  const [awsOrgs, setAwsOrgs] = useState<{ awsAccountId: string; connections: { aws_account_id: string; connection_name: string; environment: string; status: string }[] }[]>([]);
  const [crossAccountRoles, setCrossAccountRoles] = useState<CrossAccountRole[]>([]);
  const [syncStatus, setSyncStatus] = useState<AccountSummary[]>([]);
  const [health, setHealth] = useState<{ healthy: number; unhealthy: number; total: number; accounts: AccountSummary[] } | null>(null);
  const [regions, setRegions] = useState<{ region: string; resourceCount: number; accountsEnabled: number; accountsWithResources: number }[]>([]);
  const [permissionsSummary, setPermissionsSummary] = useState<AccountPermissionSummary[]>([]);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    const { items, pagination } = await api.getAccounts({
      limit: 500,
      search: search || undefined,
      status: statusFilter || undefined,
      environment: environmentFilter || undefined,
    });
    setConnections(items);
    setInventoryTotal(pagination.total);
  }, [search, statusFilter, environmentFilter]);

  useEffect(() => { void loadInventory(); }, [loadInventory, refreshToken]);
  // Test-connection state keeps running in the background (see syncContext.tsx)
  // even if you navigate away mid-request — this refreshes the table once it
  // finishes, whether that happens while you're on this page or you come back later.
  useSyncCompletion(connections.map(c => c.id), loadInventory);

  // Each secondary tab's data is only fetched once you actually open it, and
  // re-fetched on refreshToken while that tab is active.
  useEffect(() => {
    if (tab === 'Dashboard') void api.getAwsAccountsDashboard().then(setDashboard);
    else if (tab === 'Organizations') void api.getAwsOrganizations().then(r => setAwsOrgs(r.awsAccounts));
    else if (tab === 'Cross-Account Roles') void api.getCrossAccountRoles().then(r => setCrossAccountRoles(r.roles));
    else if (tab === 'Sync Status') void api.getAccountsSyncStatus().then(r => setSyncStatus(r.accounts));
    else if (tab === 'Health') void api.getAccountsHealth().then(setHealth);
    else if (tab === 'Regions') void api.getAwsAccountsRegions().then(r => setRegions(r.regions));
    else if (tab === 'Permission Validation') void api.getAwsAccountsPermissionsSummary().then(r => setPermissionsSummary(r.accounts));
  }, [tab, refreshToken]);

  async function handleDisconnect(id: string) {
    if (!(await confirm('Disconnect this AWS account? It will be marked disconnected — discovered resources and cost history are kept.'))) return;
    await api.disconnectAccount(id);
    await loadInventory();
  }

  async function handleBulkDisconnect() {
    if (!(await confirm(`Disconnect ${selectedIds.size} selected account(s)? They'll be marked disconnected — discovered resources and cost history are kept.`))) return;
    await Promise.all([...selectedIds].map(id => api.disconnectAccount(id)));
    setSelectedIds(new Set());
    await loadInventory();
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exportExcel() {
    downloadExcel(
      'aws-accounts-inventory',
      'AWS Accounts',
      ['Name', 'Account ID', 'Environment', 'Status', 'Connection Method', 'Region', 'Resources', 'Last Sync'],
      connections.map(c => [
        c.connection_name ?? c.aws_account_id, c.aws_account_id, c.environment, c.status,
        c.connection_method === 'cross_account_role' ? 'Cross-account role' : 'Access key', c.default_region,
        c.resource_summary?.totalResources ?? 0, c.last_sync_at ?? 'Never',
      ]),
    );
  }

  async function downloadReport(kind: typeof REPORT_KINDS[number]['kind']) {
    setDownloadingReport(kind);
    try {
      const { blob, filename } = await api.downloadAwsAccountsReport(kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingReport(null);
    }
  }

  async function runValidation(id: string) {
    setValidatingIds(prev => new Set(prev).add(id));
    try {
      await api.validateAccountPermissions(id);
    } finally {
      setValidatingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadInventory();
      if (tab === 'Permission Validation') void api.getAwsAccountsPermissionsSummary().then(r => setPermissionsSummary(r.accounts));
    }
  }

  const columns: Column<CloudConnection>[] = useMemo(() => [
    ...(bulkMode ? [{
      key: 'select', header: '', render: (c: CloudConnection) => (
        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} onClick={e => e.stopPropagation()} />
      ),
    } as Column<CloudConnection>] : []),
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
        const running = validatingIds.has(c.id);
        return (
          <div className="flex gap-2 text-xs items-center">
            <button onClick={e => { e.stopPropagation(); void runValidation(c.id); }} disabled={running} className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50" title="Runs real sts:GetCallerIdentity + IAM/Organizations/CloudWatch/CloudTrail/Tagging/Cost Explorer permission checks">
              {running ? 'Validating…' : 'Validate'}
            </button>
            <button onClick={e => { e.stopPropagation(); void handleDisconnect(c.id); }} className="text-red-500 hover:underline">Disconnect</button>
          </div>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [bulkMode, selectedIds, validatingIds]);

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
    { key: 'lastCheck', header: 'Last Permission Check', render: a => a.last_permission_check_at ? new Date(a.last_permission_check_at).toLocaleString() : 'Never', sortValue: a => a.last_permission_check_at ?? '' },
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

      {tab === 'Dashboard' && dashboard && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Accounts" value={String(dashboard.totalAccounts)} />
            <StatCard label="Healthy" value={String(dashboard.healthyAccounts)} />
            <StatCard label="Failed" value={String(dashboard.failedAccounts)} />
            <StatCard label="Disconnected" value={String(dashboard.disconnectedAccounts)} />
            <StatCard label="Needing Attention" value={String(dashboard.accountsNeedingAttention)} />
            <StatCard label="Resources Discovered" value={dashboard.resourcesDiscovered.toLocaleString()} />
            <StatCard label="Regions Covered" value={String(dashboard.regionsCovered)} />
            <StatCard label="Credential Rotation Due" value={String(dashboard.rotationDue)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Discovery</h3>
              <dl className="text-sm flex flex-col gap-2">
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Last Discovery</dt><dd className="text-slate-800 dark:text-slate-100">{dashboard.lastDiscovery ? new Date(dashboard.lastDiscovery).toLocaleString() : 'Never'}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Next Scheduled</dt><dd className="text-slate-400" title="No discovery scheduler exists in this build">Not scheduled</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Success Rate</dt><dd className="text-slate-400" title="No discovery engine exists in this build">N/A</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Validation</h3>
              <dl className="text-sm flex flex-col gap-2">
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Permission Errors</dt><dd className="text-slate-800 dark:text-slate-100 tabular-nums">{dashboard.permissionErrors}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Sync/Validation Failures</dt><dd className="text-slate-800 dark:text-slate-100 tabular-nums">{dashboard.syncFailures}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost & Recommendations</h3>
              <dl className="text-sm flex flex-col gap-2">
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Monthly Cost (MTD)</dt><dd className="text-slate-800 dark:text-slate-100 tabular-nums">{money(dashboard.monthlyCost)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Open Recommendations</dt><dd className="text-slate-800 dark:text-slate-100 tabular-nums">{dashboard.openRecommendations}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Potential Savings/mo</dt><dd className="text-slate-800 dark:text-slate-100 tabular-nums">{money(dashboard.potentialMonthlySavings)}</dd></div>
              </dl>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Top Cost Accounts</h3>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.topCostAccounts.map(a => (
                  <li key={a.connectionId} className="flex justify-between py-2 text-sm">
                    <button onClick={() => navigate(`/aws-accounts/${a.connectionId}`)} className="text-slate-700 dark:text-slate-200 hover:underline">{a.connectionName}</button>
                    <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{money(a.monthToDate)}</span>
                  </li>
                ))}
                {dashboard.topCostAccounts.length === 0 && <li className="py-2 text-sm text-slate-400">No cost data synced yet.</li>}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Top Growing Accounts</h3>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.topGrowingAccounts.map(a => (
                  <li key={a.connectionId} className="flex justify-between py-2 text-sm">
                    <button onClick={() => navigate(`/aws-accounts/${a.connectionId}`)} className="text-slate-700 dark:text-slate-200 hover:underline">{a.connectionName}</button>
                    <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">{a.totalResources.toLocaleString()} resources</span>
                  </li>
                ))}
                {dashboard.topGrowingAccounts.length === 0 && <li className="py-2 text-sm text-slate-400">No resource data yet.</li>}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent Activity</h3>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.recentActivity.map(entry => (
                  <li key={entry.id} className="py-2 text-sm flex justify-between">
                    <span className="text-slate-700 dark:text-slate-200">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')} <span className="text-slate-400">by {entry.actorEmail ?? 'system'}</span></span>
                    <span className="text-xs text-slate-400 shrink-0">{new Date(entry.occurredAt).toLocaleString()}</span>
                  </li>
                ))}
                {dashboard.recentActivity.length === 0 && <li className="py-2 text-sm text-slate-400">No activity yet.</li>}
              </ul>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent Alerts</h3>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {dashboard.recentAlerts.map(a => (
                  <li key={a.id} className="py-2 text-sm flex justify-between">
                    <span className="text-slate-700 dark:text-slate-200 flex items-center gap-2"><Badge>{a.severity}</Badge>{a.alertName}</span>
                    <span className="text-xs text-slate-400 shrink-0">{new Date(a.triggeredAt).toLocaleString()}</span>
                  </li>
                ))}
                {dashboard.recentAlerts.length === 0 && <li className="py-2 text-sm text-slate-400">No open alerts.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'Inventory' && (
        <>
          {anyErrors.length > 0 && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {anyErrors[0]!.error}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or account ID…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-56" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Status</span>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${statusFilter ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Environment</span>
              <select value={environmentFilter} onChange={e => setEnvironmentFilter(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${environmentFilter ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Environments</option>
                {ENVIRONMENT_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            {(search || statusFilter || environmentFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); setEnvironmentFilter(''); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
            )}
            <span className="text-xs text-slate-400 pb-2 ml-auto">{inventoryTotal.toLocaleString()} account{inventoryTotal === 1 ? '' : 's'} total</span>
            <button onClick={exportExcel} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 mb-0">Export Excel</button>
            {bulkMode && selectedIds.size > 0 && (
              <button onClick={() => void handleBulkDisconnect()} className="text-xs rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1.5">Disconnect {selectedIds.size} selected</button>
            )}
            <button
              onClick={() => { setBulkMode(m => !m); setSelectedIds(new Set()); }}
              className={`text-xs rounded-md border px-3 py-1.5 ${bulkMode ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              {bulkMode ? 'Exit Bulk Actions' : 'Bulk Actions'}
            </button>
          </div>

          <DataTable
            columns={columns}
            rows={connections}
            rowKey={c => c.id}
            pageSize={50}
            onRowClick={c => navigate(`/aws-accounts/${c.id}`)}
            emptyMessage="No AWS accounts connected yet. Click “+ Add AWS Account” to connect your first one."
          />
          {connections.length >= 500 && (
            <p className="text-xs text-slate-400 mt-2">Showing the first 500 matching accounts — narrow with search/filters to see more specific results. Full virtual scrolling for unbounded account counts is a follow-up, not yet built.</p>
          )}
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

      {tab === 'Regions' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2 text-right">Accounts Enabled</th>
                <th className="px-3 py-2 text-right">Accounts With Resources</th>
                <th className="px-3 py-2 text-right">Resources</th>
              </tr>
            </thead>
            <tbody>
              {regions.map(r => (
                <tr key={r.region} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-mono text-xs">{r.region}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.accountsEnabled}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.accountsWithResources}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100">{r.resourceCount.toLocaleString()}</td>
                </tr>
              ))}
              {regions.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No regions enabled yet — connect an AWS account to see coverage here.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Permission Validation' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-400">Latest real AWS permission-validation run per account (sts:GetCallerIdentity + IAM/Organizations/CloudWatch/CloudTrail/Tagging API/Cost Explorer). Click "Validate" on the Inventory tab to run a fresh check.</p>
          {permissionsSummary.map(acc => (
            <div key={acc.connectionId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <button onClick={() => navigate(`/aws-accounts/${acc.connectionId}`)} className="text-sm font-medium text-slate-800 dark:text-slate-100 hover:underline">{acc.connectionName}</button>
                <div className="flex items-center gap-2">
                  {acc.deniedCount > 0 && <Badge tone="warning">{acc.deniedCount} denied</Badge>}
                  {acc.errorCount > 0 && <Badge tone="critical">{acc.errorCount} errors</Badge>}
                  <Badge tone={acc.overallStatus === 'succeeded' ? 'good' : acc.overallStatus === 'never_run' ? 'neutral' : 'critical'}>{acc.overallStatus === 'never_run' ? 'Never validated' : acc.overallStatus}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {acc.checks.map(check => (
                  <span key={check.service} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 flex items-center gap-1.5" title={check.detail}>
                    <span className={`h-1.5 w-1.5 rounded-full ${check.status === 'granted' ? 'bg-emerald-500' : check.status === 'not_applicable' ? 'bg-slate-400' : check.status === 'denied' ? 'bg-amber-500' : 'bg-red-500'}`} />
                    {check.label}{!check.verified && <span className="text-slate-400" title="This check's exact AWS API shape hasn't been confirmed against a live account yet">*</span>}
                  </span>
                ))}
                {acc.checks.length === 0 && <span className="text-xs text-slate-400">No validation run yet.</span>}
              </div>
            </div>
          ))}
          {permissionsSummary.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No AWS accounts connected yet.</p>}
        </div>
      )}

      {tab === 'Reports' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REPORT_KINDS.map(r => (
            <div key={r.kind} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{r.label}</span>
              <span className="text-xs text-slate-400">Live CSV built from this org's current AWS Accounts data.</span>
              <button onClick={() => void downloadReport(r.kind)} disabled={downloadingReport === r.kind} className="mt-1 text-xs rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 self-start">
                {downloadingReport === r.kind ? 'Downloading…' : 'Download CSV'}
              </button>
            </div>
          ))}
        </div>
      )}

      <ConnectAwsAccountWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onConnected={loadInventory} projects={projects} />
      {confirmDialog}
    </div>
  );
}
