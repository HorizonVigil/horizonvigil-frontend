import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { ConnectAwsAccountWizard } from '../components/ConnectAwsAccountWizard';
import { useConfirm } from '../components/ConfirmDialog';
import { StatCardSkeleton, CardSkeleton, TableSkeleton } from '../components/Skeleton';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { useTabParam } from '../lib/useTabParam';
import { useToast } from '../lib/toast';
import { downloadExcel } from '../lib/excelExport';
import { api, ApiError, type CloudConnection, type AccountSummary, type AwsAccountsDashboard, type AccountPermissionSummary, type Favorite } from '../lib/api';

// Consolidated from an earlier version that had Account Explorer, Connection
// Validation, Cross-Account Roles, Credentials, Sync Status, Health, and
// Permission Validation as separate top-level tabs — several of those showed
// near-identical information (Sync Status and Permission Validation both
// summarized per-account check state; Health just re-sliced Dashboard's own
// numbers) and existed only because it was easy to add a tab, not because
// each answered a distinct question. Sync Center now owns "is
// discovery/validation working" as one workspace; Health folds into
// Dashboard; Cross-Account Roles folds into an Inventory filter; Credentials
// moves to the per-row "..." menu and the Account Detail page.
const TABS = ['Dashboard', 'Inventory', 'Onboarding', 'Organizations', 'Regions', 'Sync Center', 'Reports'] as const;
type Tab = typeof TABS[number];

const STATUS_CHIPS = ['connected', 'pending', 'error', 'disconnected', 'expired'] as const;
const METHOD_CHIPS = [{ value: 'access_key', label: 'Access Key' }, { value: 'cross_account_role', label: 'Cross-Account Role' }] as const;
const ENVIRONMENT_OPTIONS = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];
const PAGE_SIZES = [25, 50, 100];
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


export function AwsAccounts() {
  const { projects } = useOrg();
  const { refreshToken } = useFilters();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { toast } = useToast();
  const { syncStates, startDiscovery } = useSync();

  /** Same "Discover Resources" + "Sync Cost from AWS" pair the account detail page's buttons trigger, exposed here as a one-click row action so you don't have to open the account just to re-sync it. */
  function syncNow(connectionId: string) {
    startDiscovery(connectionId);
    void api.syncAccountCost(connectionId).catch(() => {});
    toast('Sync started — resources and cost will update as it completes.', 'success');
  }
  const [validatingIds, setValidatingIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Dashboard');
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useEffect(() => { void api.getFavorites().then(r => setFavorites(r.favorites)); }, [refreshToken]);

  async function toggleFavorite(connectionId: string, name: string) {
    const path = `/aws-accounts/${connectionId}`;
    const existing = favorites.find(f => f.path === path);
    if (existing) {
      await api.removeFavorite(existing.id);
      setFavorites(prev => prev.filter(f => f.id !== existing.id));
      toast(`Removed "${name}" from Favorites`, 'success');
    } else {
      const { favorite } = await api.addFavorite({ type: 'aws-account', label: name, path });
      setFavorites(prev => [...prev, favorite]);
      toast(`Added "${name}" to Favorites — see it on Overview`, 'success');
    }
  }

  // Inventory search/filter/bulk/pagination state
  const [search, setSearchRaw] = useState('');
  const [statusFilter, setStatusFilterRaw] = useState('');
  const [environmentFilter, setEnvironmentFilterRaw] = useState('');
  const [methodFilter, setMethodFilterRaw] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(50);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inventoryTotal, setInventoryTotal] = useState(0);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryLoadedOnce, setInventoryLoadedOnce] = useState(false);

  // Every filter/pageSize change jumps back to page 1 — otherwise a narrower
  // result set can leave you stranded on a page that no longer exists.
  const setSearch = (v: string) => { setSearchRaw(v); setPage(1); };
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); setPage(1); };
  const setEnvironmentFilter = (v: string) => { setEnvironmentFilterRaw(v); setPage(1); };
  const setMethodFilter = (v: string) => { setMethodFilterRaw(v); setPage(1); };
  const setPageSize = (v: number) => { setPageSizeRaw(v); setPage(1); };

  // Tab-specific data
  const [dashboard, setDashboard] = useState<AwsAccountsDashboard | null>(null);
  const [awsOrgs, setAwsOrgs] = useState<{ awsAccountId: string; connections: { aws_account_id: string; connection_name: string; environment: string; status: string }[] }[]>([]);
  const [syncStatus, setSyncStatus] = useState<AccountSummary[]>([]);
  const [regions, setRegions] = useState<{ region: string; resourceCount: number; accountsEnabled: number; accountsWithResources: number }[]>([]);
  const [permissionsSummary, setPermissionsSummary] = useState<AccountPermissionSummary[]>([]);
  const [syncCenterLoaded, setSyncCenterLoaded] = useState(false);
  const [expandedSyncRow, setExpandedSyncRow] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);
  const [updateCredsFor, setUpdateCredsFor] = useState<string | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const { items, pagination } = await api.getAccounts({
        page, limit: pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
        environment: environmentFilter || undefined,
        connectionMethod: methodFilter || undefined,
      });
      setConnections(items);
      setInventoryTotal(pagination.total);
    } finally {
      setInventoryLoading(false);
      setInventoryLoadedOnce(true);
    }
  }, [page, pageSize, search, statusFilter, environmentFilter, methodFilter]);

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
    else if (tab === 'Regions') void api.getAwsAccountsRegions().then(r => setRegions(r.regions));
    else if (tab === 'Sync Center') {
      setSyncCenterLoaded(false);
      void Promise.all([
        api.getAccountsSyncStatus().then(r => setSyncStatus(r.accounts)),
        api.getAwsAccountsPermissionsSummary().then(r => setPermissionsSummary(r.accounts)),
      ]).finally(() => setSyncCenterLoaded(true));
    }
  }, [tab, refreshToken]);

  async function handleDisconnect(id: string) {
    const c = connections.find(x => x.id === id);
    if (!(await confirm('Disconnect this AWS account? It will be marked disconnected — discovered resources and cost history are kept.'))) return;
    await api.disconnectAccount(id);
    toast(`Disconnected "${c?.connection_name ?? c?.aws_account_id}"`, 'success');
    await loadInventory();
  }

  async function handleBulkDisconnect() {
    const n = selectedIds.size;
    if (!(await confirm(`Disconnect ${n} selected account(s)? They'll be marked disconnected — discovered resources and cost history are kept.`))) return;
    await Promise.all([...selectedIds].map(id => api.disconnectAccount(id)));
    toast(`Disconnected ${n} account${n === 1 ? '' : 's'}`, 'success');
    setSelectedIds(new Set());
    await loadInventory();
  }

  async function handleDeletePermanently(id: string) {
    const c = connections.find(x => x.id === id);
    if (!(await confirm(`Permanently delete "${c?.connection_name ?? c?.aws_account_id}"? This is irreversible — its discovered resources, cost history, and validation runs are deleted too, not just this connection. Use Disconnect instead if you might reconnect it later.`))) return;
    await api.deleteAccountPermanently(id);
    toast(`Deleted "${c?.connection_name ?? c?.aws_account_id}" permanently`, 'success');
    await loadInventory();
  }

  async function handleBulkDeletePermanently() {
    const n = selectedIds.size;
    if (!(await confirm(`Permanently delete ${n} selected account(s)? This is irreversible — their discovered resources, cost history, and validation runs are deleted too, not just the connections. Use Disconnect instead if you might reconnect them later.`))) return;
    await Promise.all([...selectedIds].map(id => api.deleteAccountPermanently(id)));
    toast(`Deleted ${n} account${n === 1 ? '' : 's'} permanently`, 'success');
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

  async function exportExcel() {
    setExportingExcel(true);
    try {
      // Exports every matching account, not just the current page — the
      // on-screen table is server-paginated, but an export that silently
      // only covered 50 rows out of 400 matching accounts would be worse
      // than no export button at all.
      const { items } = await api.getAccounts({
        limit: 5000,
        search: search || undefined,
        status: statusFilter || undefined,
        environment: environmentFilter || undefined,
      });
      downloadExcel(
        'aws-accounts-inventory',
        'AWS Accounts',
        ['Name', 'Account ID', 'Environment', 'Status', 'Connection Method', 'Region', 'Resources', 'Last Sync'],
        items.map(c => [
          c.connection_name ?? c.aws_account_id, c.aws_account_id, c.environment, c.status,
          c.connection_method === 'cross_account_role' ? 'Cross-account role' : 'Access key', c.default_region,
          c.resource_summary?.totalResources ?? 0, c.last_sync_at ?? 'Never',
        ]),
      );
      toast(`Exported ${items.length.toLocaleString()} account${items.length === 1 ? '' : 's'} to Excel`, 'success');
    } finally {
      setExportingExcel(false);
    }
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

  async function runValidation(id: string, knownName?: string) {
    // knownName covers callers (like the Dashboard's Needing Attention list)
    // whose account may not be on whatever page of paginated Inventory is
    // currently loaded — falling back to connections.find would silently
    // show a blank name in that case.
    const name = knownName ?? connections.find(x => x.id === id)?.connection_name ?? connections.find(x => x.id === id)?.aws_account_id ?? 'Account';
    setValidatingIds(prev => new Set(prev).add(id));
    try {
      const result = await api.validateAccountPermissions(id);
      toast(
        result.status === 'succeeded' ? `"${name}" validated — identity confirmed` : `"${name}" validation failed`,
        result.status === 'succeeded' ? 'success' : 'error',
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Validation failed', 'error');
    } finally {
      setValidatingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      await loadInventory();
      if (tab === 'Sync Center') {
        void api.getAwsAccountsPermissionsSummary().then(r => setPermissionsSummary(r.accounts));
        void api.getAccountsSyncStatus().then(r => setSyncStatus(r.accounts));
      } else if (tab === 'Dashboard') void api.getAwsAccountsDashboard().then(setDashboard);
    }
  }

  const columns: Column<CloudConnection>[] = useMemo(() => [
    ...(bulkMode ? [{
      key: 'select', header: '', render: (c: CloudConnection) => (
        <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelected(c.id)} onClick={e => e.stopPropagation()} />
      ),
    } as Column<CloudConnection>] : []),
    { key: 'name', header: 'Name', sticky: true, render: c => c.connection_name ?? c.aws_account_id, sortValue: c => c.connection_name ?? c.aws_account_id },
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
      key: 'actions', header: '', render: c => (
        <RowActionsMenu
          connection={c}
          validating={validatingIds.has(c.id)}
          syncing={syncStates[c.id]?.status === 'running'}
          isFavorited={favorites.some(f => f.path === `/aws-accounts/${c.id}`)}
          onValidate={() => void runValidation(c.id)}
          onSync={() => syncNow(c.id)}
          onToggleFavorite={() => void toggleFavorite(c.id, c.connection_name ?? c.aws_account_id)}
          onUpdateCredentials={c.connection_method === 'access_key' ? () => setUpdateCredsFor(c.id) : undefined}
          onDisconnect={() => void handleDisconnect(c.id)}
          onDelete={() => void handleDeletePermanently(c.id)}
        />
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [bulkMode, selectedIds, validatingIds, connections, syncStates]);

  const anyErrors = connections.map(c => syncStates[c.id]).filter(s => s?.status === 'error' && s.error);
  const totalPages = Math.max(1, Math.ceil(inventoryTotal / pageSize));

  // Sync Center merges what used to be three separate tabs (Sync Status,
  // Permission Validation, Connection Validation) into one row per account —
  // they were three views of the same underlying question ("is this
  // account's connection actually working?"), sourced from the same two
  // endpoints, just split across different pages.
  const syncCenterRows = useMemo(() => {
    const syncById = new Map(syncStatus.map(a => [a.id, a]));
    return permissionsSummary.map(p => {
      const sync = syncById.get(p.connectionId);
      return {
        connectionId: p.connectionId,
        connectionName: p.connectionName,
        connectionStatus: sync?.status ?? 'unknown',
        lastSync: sync?.last_sync_at ?? null,
        lastPermissionCheck: p.lastCheckedAt,
        errorMessage: sync?.error_message ?? null,
        overallStatus: p.overallStatus,
        deniedCount: p.deniedCount,
        errorCount: p.errorCount,
        checks: p.checks,
      };
    });
  }, [syncStatus, permissionsSummary]);

  return (
    <div>
      <FilterBar title="Cloud Accounts" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm flex-wrap">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setWizardOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 shrink-0 transition-colors">+ Add AWS Account</button>
      </div>

      {tab === 'Dashboard' && (
        !dashboard ? (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          </div>
        ) : (
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

            {dashboard.accountsNeedingAttentionList.length > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 p-4">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-1.5">⚠ Accounts Needing Attention</h3>
                <ul className="flex flex-col divide-y divide-amber-100 dark:divide-amber-900/40">
                  {dashboard.accountsNeedingAttentionList.map(a => {
                    const isValidationPending = a.reason === 'Not yet validated';
                    return (
                      <li key={a.connectionId} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge tone={isValidationPending ? 'warning' : 'critical'}>{isValidationPending ? 'Pending' : 'Critical'}</Badge>
                          <button onClick={() => navigate(`/aws-accounts/${a.connectionId}`)} className="text-slate-700 dark:text-slate-200 hover:underline font-medium truncate">{a.connectionName}</button>
                          <span className="text-slate-500 dark:text-slate-400 truncate">— {a.reason}</span>
                        </div>
                        <button onClick={() => void runValidation(a.connectionId, a.connectionName)} disabled={validatingIds.has(a.connectionId)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline shrink-0 disabled:opacity-50">
                          {validatingIds.has(a.connectionId) ? 'Validating…' : 'Validate'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {dashboard.accountsNeedingAttention > dashboard.accountsNeedingAttentionList.length && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">+{dashboard.accountsNeedingAttention - dashboard.accountsNeedingAttentionList.length} more — narrow with Inventory filters to see the rest.</p>
                )}
              </div>
            )}

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
        )
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
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Environment</span>
              <select value={environmentFilter} onChange={e => setEnvironmentFilter(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${environmentFilter ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Environments</option>
                {ENVIRONMENT_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            {(search || statusFilter || environmentFilter || methodFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); setEnvironmentFilter(''); setMethodFilter(''); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
            )}
            <span className="text-xs text-slate-400 pb-2 ml-auto">{inventoryTotal.toLocaleString()} account{inventoryTotal === 1 ? '' : 's'} total</span>
            <button onClick={() => void exportExcel()} disabled={exportingExcel} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 mb-0" title="Exports every matching account, not just this page">
              {exportingExcel ? 'Exporting…' : 'Export Excel'}
            </button>
            {bulkMode && selectedIds.size > 0 && (
              <>
                <button onClick={() => void handleBulkDisconnect()} className="text-xs rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1.5">Disconnect {selectedIds.size} selected</button>
                <button onClick={() => void handleBulkDeletePermanently()} className="text-xs rounded-md border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5" title="Irreversible — also deletes resources, cost history, and validation runs for each selected account">Delete {selectedIds.size} selected permanently</button>
              </>
            )}
            <button
              onClick={() => { setBulkMode(m => !m); setSelectedIds(new Set()); }}
              className={`text-xs rounded-md border px-3 py-1.5 transition-colors ${bulkMode ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              {bulkMode ? 'Exit Bulk Actions' : 'Bulk Actions'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Status</span>
            <button onClick={() => setStatusFilter('')} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!statusFilter ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            {STATUS_CHIPS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs rounded-full px-2.5 py-1 border capitalize transition-colors ${statusFilter === s ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{s}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Connection Method</span>
            <button onClick={() => setMethodFilter('')} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!methodFilter ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            {METHOD_CHIPS.map(m => (
              <button key={m.value} onClick={() => setMethodFilter(m.value)} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${methodFilter === m.value ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{m.label}</button>
            ))}
          </div>

          {inventoryLoading && !inventoryLoadedOnce ? (
            <TableSkeleton rows={8} cols={7} />
          ) : (
            <DataTable
              columns={columns}
              rows={connections}
              rowKey={c => c.id}
              pageSize={Math.max(pageSize, 1)}
              onRowClick={c => navigate(`/aws-accounts/${c.id}`)}
              emptyMessage={inventoryTotal === 0 && !search && !statusFilter && !environmentFilter && !methodFilter ? 'No AWS accounts connected yet. Click "+ Add AWS Account" to connect your first one.' : 'No accounts match these filters.'}
            />
          )}

          {inventoryTotal > 0 && (
            <div className="flex items-center justify-between mt-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs">
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span>Page {page} of {totalPages} · {inventoryTotal.toLocaleString()} total</span>
                <div className="flex gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Prev</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'Onboarding' && (
        <div className="max-w-xl mx-auto flex flex-col items-center text-center gap-4 py-14">
          <div className="h-14 w-14 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-2xl">☁</div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Connect a New AWS Account</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Connect via a cross-account IAM role — recommended, no long-lived keys to rotate or leak — or an IAM user's access keys. The wizard walks through least-privilege permissions, region selection, and an initial connection check.
          </p>
          <button onClick={() => setWizardOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5">Start Onboarding</button>
          {inventoryTotal > 0 && (
            <p className="text-xs text-slate-400 mt-6">
              {inventoryTotal.toLocaleString()} account{inventoryTotal === 1 ? '' : 's'} already connected — see{' '}
              <button onClick={() => setTab('Inventory')} className="text-brand-600 dark:text-brand-400 hover:underline">Account Inventory</button> to manage them.
            </p>
          )}
        </div>
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

      {tab === 'Sync Center' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Is discovery and validation working?</h3>
            <p className="text-xs text-slate-400">
              One row per account: connection status, when it last synced, and the result of its most recent permission validation — sts:GetCallerIdentity plus real checks against IAM, Organizations, CloudWatch, CloudTrail, the Resource Groups Tagging API, and Cost Explorer, run with that account's own stored credentials. Click a row to see every individual check. Click "Validate" to run a fresh one.
            </p>
          </div>

          {!syncCenterLoaded ? <TableSkeleton rows={5} cols={6} /> : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Connection</th>
                    <th className="px-3 py-2">Last Sync</th>
                    <th className="px-3 py-2">Last Validation</th>
                    <th className="px-3 py-2">Result</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {syncCenterRows.map(row => {
                    const expanded = expandedSyncRow === row.connectionId;
                    const validating = validatingIds.has(row.connectionId);
                    return (
                      <Fragment key={row.connectionId}>
                        <tr className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setExpandedSyncRow(expanded ? null : row.connectionId)}>
                          <td className="px-3 py-2">
                            <button onClick={e => { e.stopPropagation(); navigate(`/aws-accounts/${row.connectionId}`); }} className="text-slate-700 dark:text-slate-200 hover:underline font-medium">{row.connectionName}</button>
                          </td>
                          <td className="px-3 py-2"><Badge tone="neutral">{row.connectionStatus}</Badge></td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.lastSync ? new Date(row.lastSync).toLocaleString() : 'Never'}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.lastPermissionCheck ? new Date(row.lastPermissionCheck).toLocaleString() : 'Never'}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {row.deniedCount > 0 && <Badge tone="warning">{row.deniedCount} denied</Badge>}
                              {row.errorCount > 0 && <Badge tone="critical">{row.errorCount} errors</Badge>}
                              <Badge tone={row.overallStatus === 'succeeded' ? 'good' : row.overallStatus === 'never_run' ? 'neutral' : 'critical'}>{row.overallStatus === 'never_run' ? 'Never validated' : row.overallStatus}</Badge>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={e => { e.stopPropagation(); void runValidation(row.connectionId, row.connectionName); }} disabled={validating} className="text-xs text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">
                              {validating ? 'Validating…' : 'Validate'}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 bg-slate-50/60 dark:bg-slate-800/30">
                            <td colSpan={6} className="px-3 py-3">
                              {row.errorMessage && <p className="text-xs text-red-500 mb-2">{row.errorMessage}</p>}
                              <div className="flex flex-wrap gap-2">
                                {row.checks.map(check => (
                                  <span key={check.service} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 flex items-center gap-1.5 bg-white dark:bg-slate-900" title={check.detail}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${check.status === 'granted' ? 'bg-emerald-500' : check.status === 'not_applicable' ? 'bg-slate-400' : check.status === 'denied' ? 'bg-amber-500' : 'bg-red-500'}`} />
                                    {check.label}{!check.verified && <span className="text-slate-400" title="This check's exact AWS API shape hasn't been confirmed against a live account yet">*</span>}
                                  </span>
                                ))}
                                {row.checks.length === 0 && <span className="text-xs text-slate-400">No validation run yet.</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {syncCenterRows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No AWS accounts connected yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
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
      {updateCredsFor && (
        <UpdateCredentialsModal
          connection={connections.find(c => c.id === updateCredsFor) ?? null}
          onClose={() => setUpdateCredsFor(null)}
          onUpdated={() => { setUpdateCredsFor(null); void loadInventory(); }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/** Row-level "⋯" menu — replaces a row of competing text links with the single action point AWS Console / Datadog tables use, and adds two real actions (Open Console, Copy ID) that a link row had no room for. */
function RowActionsMenu({ connection, validating, syncing, isFavorited, onValidate, onSync, onToggleFavorite, onUpdateCredentials, onDisconnect, onDelete }: {
  connection: CloudConnection;
  validating: boolean;
  syncing: boolean;
  isFavorited: boolean;
  onValidate: () => void;
  onSync: () => void;
  onToggleFavorite: () => void;
  onUpdateCredentials?: () => void;
  onDisconnect: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function copyId() {
    void navigator.clipboard.writeText(connection.aws_account_id);
    toast('Account ID copied', 'success');
    setOpen(false);
  }

  function openConsole() {
    window.open(`https://${connection.default_region}.console.aws.amazon.com/console/home?region=${connection.default_region}`, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-block text-left" onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(v => !v)} className="rounded-md w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open}>
        ⋯
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm animate-[fadeIn_0.1s_ease-out]">
          <button role="menuitem" onClick={() => { setOpen(false); onSync(); }} disabled={syncing} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50" title="Manually re-runs Discover Resources + Sync Cost from AWS for this account right now">
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); onValidate(); }} disabled={validating} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50" title="Runs real sts:GetCallerIdentity + IAM/Organizations/CloudWatch/CloudTrail/Tagging/Cost Explorer permission checks">
            {validating ? 'Validating…' : 'Validate Permissions'}
          </button>
          <button role="menuitem" onClick={openConsole} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60" title="Opens the AWS Console using your browser's current AWS sign-in session">
            Open AWS Console ↗
          </button>
          <button role="menuitem" onClick={() => { setOpen(false); onToggleFavorite(); }} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60" title="Pin this account to the Overview page for quick access">
            {isFavorited ? '★ Remove from Favorites' : '☆ Add to Favorites'}
          </button>
          <button role="menuitem" onClick={copyId} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60">Copy Account ID</button>
          {onUpdateCredentials && (
            <button role="menuitem" onClick={() => { setOpen(false); onUpdateCredentials(); }} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60">Update Credentials</button>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <button role="menuitem" onClick={() => { setOpen(false); onDisconnect(); }} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Disconnect</button>
          <button role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Irreversible — also deletes this account's resources, cost history, and validation runs">Delete Permanently</button>
        </div>
      )}
    </div>
  );
}

/**
 * Re-encrypts stored credentials for an access-key connection in place —
 * disconnect+re-add hits the org_id+aws_account_id unique constraint since
 * disconnect is a soft status-flip, not a row delete (see accounts.ts). This
 * is also the only way to rotate credentials at all; the Credentials tab
 * showed a "Rotation Due" badge with nothing to act on before this existed.
 */
function UpdateCredentialsModal({ connection, onClose, onUpdated }: { connection: CloudConnection | null; onClose: () => void; onUpdated: () => void }) {
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function submit() {
    if (!connection) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.updateAccountCredentials(connection.id, { accessKeyId, secretAccessKey });
      toast(`Credentials updated for "${connection.connection_name ?? connection.aws_account_id}"`, 'success');
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Update Credentials</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        <p className="text-xs text-slate-400">
          Replaces the stored access key for <strong>{connection?.connection_name ?? connection?.aws_account_id}</strong> — used to rotate credentials, or to re-encrypt after the platform's encryption key changes. Status resets to "pending" until you re-run Validate.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Access Key ID</span>
          <input value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" placeholder="AKIA…" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-500 dark:text-slate-400">Secret Access Key</span>
          <input type="password" value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={() => void submit()} disabled={submitting || !accessKeyId || !secretAccessKey} className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5">
            {submitting ? 'Saving…' : 'Save & Reconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}
