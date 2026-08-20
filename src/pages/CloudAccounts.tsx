import { Fragment, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { DataTable, type Column } from '../components/DataTable';
import { Badge } from '../components/Badge';
import { ConnectAwsAccountWizard } from '../components/ConnectAwsAccountWizard';
import { ConnectGcpProjectWizard } from '../components/ConnectGcpProjectWizard';
import { ConnectAzureSubscriptionWizard } from '../components/ConnectAzureSubscriptionWizard';
import { AddAccountChooser } from '../components/AddAccountChooser';
import { useConfirm } from '../components/ConfirmDialog';
import { StatCardSkeleton, CardSkeleton, TableSkeleton } from '../components/Skeleton';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useToast } from '../lib/toast';
import { Icon } from '../components/icons';
import { downloadExcel } from '../lib/excelExport';
import { api, ApiError, type CloudConnection, type GcpConnection, type AzureConnection, type AccountSummary, type AwsAccountsDashboard, type AccountPermissionSummary, type Favorite } from '../lib/api';
import { type UnifiedAccountRow, toUnifiedRow, toUnifiedGcpRow, toUnifiedAzureRow } from '../lib/unifiedAccounts';

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
//
// Inventory is the one tab that's genuinely multi-cloud: it merges AWS
// accounts and GCP projects into a single table (client-side, since the two
// backends paginate independently and the realistic account count per org is
// low enough that this doesn't need server-side paging). Dashboard,
// Organizations, Regions, Sync Center, and Reports stay AWS-only in their
// data — gcp-accounts-api has no dashboard/organizations/regions/sync-status/
// reports endpoints yet (only accounts CRUD + discovery), and fabricating
// numbers for a tab GCP has no backend behind would violate this codebase's
// own "never ship a tab with nothing real behind it" rule.
const TABS = ['Dashboard', 'Inventory', 'Onboarding', 'Organizations', 'Regions', 'Sync Center', 'Reports'] as const;
type Tab = typeof TABS[number];

// This page's own tab values are shorter than navConfig.ts's sidebar labels
// for the same items ("Inventory" here vs. "Account Inventory" there) --
// useSubmenuAccess keys off the navConfig label, so the two have to be
// bridged by hand rather than passed straight through.
const TAB_TO_NAV_LABEL: Record<Tab, string> = {
  Dashboard: 'Dashboard', Inventory: 'Account Inventory', Onboarding: 'Account Onboarding',
  Organizations: 'Organizations', Regions: 'Regions', 'Sync Center': 'Sync Center', Reports: 'Reports',
};

const STATUS_CHIPS = ['connected', 'pending', 'error', 'disconnected', 'expired'] as const;
const PROVIDER_CHIPS = [{ value: 'aws', label: 'AWS' }, { value: 'gcp', label: 'GCP' }, { value: 'azure', label: 'Azure' }] as const;
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

export function CloudAccounts() {
  const { projects } = useOrg();
  const { refreshToken } = useFilters();
  const navigate = useNavigate();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { toast } = useToast();
  const { syncStates, startDiscovery } = useSync();

  /** Same "Discover Resources" (+ "Sync Cost" for AWS/Azure rows) the account detail page's buttons trigger, exposed here as a one-click row action. */
  function syncNow(row: UnifiedAccountRow) {
    startDiscovery(row.id, row.provider === 'gcp' ? 'gcpAccounts' : row.provider === 'azure' ? 'azureAccounts' : 'awsAccounts');
    if (row.provider === 'aws') void api.syncAccountCost(row.id).catch(() => {});
    else if (row.provider === 'azure') void api.syncAzureAccountCost(row.id).catch(() => {});
    toast('Sync started — resources will update as it completes.', 'success');
  }
  const [validatingIds, setValidatingIds] = useState<Set<string>>(new Set());
  const canSeeNavTab = useSubmenuAccess('cloud');
  const canSeeTab = useCallback((t: Tab) => canSeeNavTab(TAB_TO_NAV_LABEL[t]), [canSeeNavTab]);
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Dashboard');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [awsConnections, setAwsConnections] = useState<CloudConnection[]>([]);
  const [gcpConnections, setGcpConnections] = useState<GcpConnection[]>([]);
  const [azureConnections, setAzureConnections] = useState<AzureConnection[]>([]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [awsWizardOpen, setAwsWizardOpen] = useState(false);
  const [gcpWizardOpen, setGcpWizardOpen] = useState(false);
  const [azureWizardOpen, setAzureWizardOpen] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useEffect(() => { void api.getFavorites().then(r => setFavorites(r.favorites)); }, [refreshToken]);

  async function toggleFavorite(connectionId: string, name: string) {
    // Favorites remain AWS-only for now — see RowActionsMenu, which only
    // shows this action for provider === 'aws'.
    const path = `/cloud-accounts/${connectionId}`;
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

  // Inventory search/filter/bulk/pagination state — client-side, since the
  // merged table combines two independently-paginated backends.
  const [search, setSearchRaw] = useState('');
  const [statusFilter, setStatusFilterRaw] = useState('');
  const [environmentFilter, setEnvironmentFilterRaw] = useState('');
  const [providerFilter, setProviderFilterRaw] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(50);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryLoadedOnce, setInventoryLoadedOnce] = useState(false);

  const setSearch = (v: string) => { setSearchRaw(v); setPage(1); };
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); setPage(1); };
  const setEnvironmentFilter = (v: string) => { setEnvironmentFilterRaw(v); setPage(1); };
  const setProviderFilter = (v: string) => { setProviderFilterRaw(v); setPage(1); };
  const setPageSize = (v: number) => { setPageSizeRaw(v); setPage(1); };

  // Tab-specific data
  const [dashboard, setDashboard] = useState<AwsAccountsDashboard | null>(null);
  const [gcpProjectCount, setGcpProjectCount] = useState<number | null>(null);
  const [azureAccountCount, setAzureAccountCount] = useState<number | null>(null);
  const [awsOrgs, setAwsOrgs] = useState<{ awsAccountId: string; connections: { aws_account_id: string; connection_name: string; environment: string; status: string }[] }[]>([]);
  const [syncStatus, setSyncStatus] = useState<AccountSummary[]>([]);
  const [regions, setRegions] = useState<{ region: string; resourceCount: number; accountsEnabled: number; accountsWithResources: number }[]>([]);
  const [permissionsSummary, setPermissionsSummary] = useState<AccountPermissionSummary[]>([]);
  const [syncCenterLoaded, setSyncCenterLoaded] = useState(false);
  const [expandedSyncRow, setExpandedSyncRow] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);
  const [updateCredsFor, setUpdateCredsFor] = useState<UnifiedAccountRow | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    try {
      const [awsRes, gcpRes, azureRes] = await Promise.all([
        api.getAccounts({ limit: 1000 }),
        api.getGcpAccounts({ limit: 1000 }),
        api.getAzureAccounts({ limit: 1000 }),
      ]);
      setAwsConnections(awsRes.items);
      setGcpConnections(gcpRes.items);
      setAzureConnections(azureRes.items);
    } finally {
      setInventoryLoading(false);
      setInventoryLoadedOnce(true);
    }
  }, []);

  useEffect(() => { void loadInventory(); }, [loadInventory, refreshToken]);
  // Test-connection state keeps running in the background (see syncContext.tsx)
  // even if you navigate away mid-request — this refreshes the table once it
  // finishes, whether that happens while you're on this page or you come back later.
  useSyncCompletion([...awsConnections.map(c => c.id), ...gcpConnections.map(c => c.id), ...azureConnections.map(c => c.id)], loadInventory);

  // Each secondary tab's data is only fetched once you actually open it, and
  // re-fetched on refreshToken while that tab is active.
  useEffect(() => {
    if (tab === 'Dashboard') {
      void api.getAwsAccountsDashboard().then(setDashboard);
      void api.getGcpAccounts({ limit: 1 }).then(r => setGcpProjectCount(r.pagination.total));
      void api.getAzureAccounts({ limit: 1 }).then(r => setAzureAccountCount(r.pagination.total));
    } else if (tab === 'Organizations') void api.getAwsOrganizations().then(r => setAwsOrgs(r.awsAccounts));
    else if (tab === 'Regions') void api.getAwsAccountsRegions().then(r => setRegions(r.regions));
    else if (tab === 'Sync Center') {
      setSyncCenterLoaded(false);
      void Promise.all([
        api.getAccountsSyncStatus().then(r => setSyncStatus(r.accounts)),
        api.getAwsAccountsPermissionsSummary().then(r => setPermissionsSummary(r.accounts)),
      ]).finally(() => setSyncCenterLoaded(true));
    }
  }, [tab, refreshToken]);

  const allRows = useMemo(() => [...awsConnections.map(toUnifiedRow), ...gcpConnections.map(toUnifiedGcpRow), ...azureConnections.map(toUnifiedAzureRow)], [awsConnections, gcpConnections, azureConnections]);

  const filtered = useMemo(() => allRows.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false;
    if (environmentFilter && r.environment !== environmentFilter) return false;
    if (providerFilter && r.provider !== providerFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.name.toLowerCase().includes(q) && !r.identifier.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [allRows, statusFilter, environmentFilter, providerFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);

  function findRow(id: string): UnifiedAccountRow | undefined {
    return allRows.find(r => r.id === id);
  }

  /** Three providers, three separate backends, identical Disconnect/Delete contract — one dispatch point instead of the same 3-way branch repeated at every call site. */
  function disconnectFor(row: UnifiedAccountRow) {
    if (row.provider === 'gcp') return api.disconnectGcpAccount(row.id);
    if (row.provider === 'azure') return api.disconnectAzureAccount(row.id);
    return api.disconnectAccount(row.id);
  }
  function deletePermanentlyFor(row: UnifiedAccountRow) {
    if (row.provider === 'gcp') return api.deleteGcpAccountPermanently(row.id);
    if (row.provider === 'azure') return api.deleteAzureAccountPermanently(row.id);
    return api.deleteAccountPermanently(row.id);
  }

  async function handleDisconnect(row: UnifiedAccountRow) {
    if (!(await confirm(`Disconnect "${row.name}"? It will be marked disconnected — discovered resources${row.provider === 'aws' ? ' and cost history are' : ' are'} kept.`))) return;
    await disconnectFor(row);
    toast(`Disconnected "${row.name}"`, 'success');
    await loadInventory();
  }

  async function handleBulkDisconnect() {
    const rows = [...selectedIds].map(findRow).filter((r): r is UnifiedAccountRow => !!r);
    const n = rows.length;
    if (!(await confirm(`Disconnect ${n} selected account(s)? They'll be marked disconnected — discovered resources are kept.`))) return;
    await Promise.all(rows.map(disconnectFor));
    toast(`Disconnected ${n} account${n === 1 ? '' : 's'}`, 'success');
    setSelectedIds(new Set());
    await loadInventory();
  }

  async function handleDeletePermanently(row: UnifiedAccountRow) {
    if (!(await confirm(`Permanently delete "${row.name}"? This is irreversible — its discovered resources and history are deleted too, not just this connection. Use Disconnect instead if you might reconnect it later.`))) return;
    await deletePermanentlyFor(row);
    toast(`Deleted "${row.name}" permanently`, 'success');
    await loadInventory();
  }

  async function handleBulkDeletePermanently() {
    const rows = [...selectedIds].map(findRow).filter((r): r is UnifiedAccountRow => !!r);
    const n = rows.length;
    if (!(await confirm(`Permanently delete ${n} selected account(s)? This is irreversible — their discovered resources and history are deleted too, not just the connections. Use Disconnect instead if you might reconnect them later.`))) return;
    await Promise.all(rows.map(deletePermanentlyFor));
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
      downloadExcel(
        'cloud-accounts-inventory',
        'Cloud Accounts',
        ['Name', 'Provider', 'Account / Project ID', 'Environment', 'Status', 'Connection Method', 'Region', 'Resources', 'Last Sync'],
        filtered.map(r => [
          r.name, r.provider.toUpperCase(), r.identifier, r.environment, r.status,
          r.connectionMethodLabel, r.region, r.resources ?? 0, r.lastSync ?? 'Never',
        ]),
      );
      toast(`Exported ${filtered.length.toLocaleString()} account${filtered.length === 1 ? '' : 's'} to Excel`, 'success');
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
    // whose account may not be in the currently-loaded inventory set.
    const name = knownName ?? findRow(id)?.name ?? 'Account';
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

  const columns: Column<UnifiedAccountRow>[] = useMemo(() => [
    ...(bulkMode ? [{
      key: 'select', header: '', render: (r: UnifiedAccountRow) => (
        <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelected(r.id)} onClick={e => e.stopPropagation()} />
      ),
    } as Column<UnifiedAccountRow>] : []),
    { key: 'name', header: 'Name', sticky: true, render: r => r.name, sortValue: r => r.name },
    { key: 'provider', header: 'Provider', render: r => <Badge tone="neutral">{r.provider === 'gcp' ? 'GCP' : r.provider === 'azure' ? 'Azure' : 'AWS'}</Badge>, sortValue: r => r.provider },
    { key: 'accountId', header: 'Account / Project ID', render: r => <span className="font-mono text-xs">{r.identifier}</span>, sortValue: r => r.identifier },
    { key: 'environment', header: 'Environment', render: r => <Badge tone="neutral">{r.environment}</Badge>, sortValue: r => r.environment },
    {
      key: 'status', header: 'Status', render: r => (
        <div className="flex flex-col gap-0.5">
          <Badge>{r.status}</Badge>
          {r.status === 'error' && r.errorMessage && <span className="text-[10px] text-red-500 max-w-[16rem] truncate" title={r.errorMessage}>{r.errorMessage}</span>}
        </div>
      ), sortValue: r => r.status,
    },
    { key: 'method', header: 'Connection', render: r => r.connectionMethodLabel, sortValue: r => r.connectionMethod },
    { key: 'region', header: 'Region', render: r => r.region, sortValue: r => r.region },
    { key: 'resources', header: 'Resources', render: r => r.resources?.toLocaleString() ?? '—', sortValue: r => r.resources ?? 0 },
    { key: 'lastSync', header: 'Last Sync', render: r => r.lastSync ? new Date(r.lastSync).toLocaleString() : 'Never', sortValue: r => r.lastSync ?? '' },
    {
      key: 'actions', header: '', render: r => (
        <RowActionsMenu
          row={r}
          validating={validatingIds.has(r.id)}
          syncing={syncStates[r.id]?.status === 'running'}
          isFavorited={favorites.some(f => f.path === `/cloud-accounts/${r.id}`)}
          onValidate={() => void runValidation(r.id)}
          onSync={() => syncNow(r)}
          onToggleFavorite={() => void toggleFavorite(r.id, r.name)}
          onUpdateCredentials={
            (r.provider === 'aws' && r.connectionMethod === 'access_key') ||
            (r.provider === 'gcp' && r.connectionMethod === 'service_account_key') ||
            (r.provider === 'azure' && r.connectionMethod === 'service_principal')
              ? () => setUpdateCredsFor(r) : undefined
          }
          onDisconnect={() => void handleDisconnect(r)}
          onDelete={() => void handleDeletePermanently(r)}
        />
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [bulkMode, selectedIds, validatingIds, allRows, syncStates, favorites]);

  const anyErrors = allRows.map(r => syncStates[r.id]).filter(s => s?.status === 'error' && s.error);

  // Sync Center merges what used to be three separate tabs (Sync Status,
  // Permission Validation, Connection Validation) into one row per account —
  // AWS-only (see file header): gcp-accounts-api has no permission-validation
  // endpoint in Phase 1.
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

  function openWizard(provider: 'aws' | 'gcp' | 'azure') {
    setChooserOpen(false);
    if (provider === 'aws') setAwsWizardOpen(true);
    else if (provider === 'gcp') setGcpWizardOpen(true);
    else setAzureWizardOpen(true);
  }

  return (
    <div>
      <FilterBar title="Cloud Accounts" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 text-sm flex-wrap">
          {visibleTabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setChooserOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 shrink-0 transition-colors">+ Add Account</button>
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
              <StatCard label="AWS Accounts" value={String(dashboard.totalAccounts)} />
              <StatCard label="GCP Projects" value={gcpProjectCount === null ? '…' : String(gcpProjectCount)} />
              <StatCard label="Azure Subscriptions" value={azureAccountCount === null ? '…' : String(azureAccountCount)} />
              <StatCard label="Healthy" value={String(dashboard.healthyAccounts)} caption="AWS only" />
              <StatCard label="Failed" value={String(dashboard.failedAccounts)} caption="AWS only" />
              <StatCard label="Disconnected" value={String(dashboard.disconnectedAccounts)} caption="AWS only" />
              <StatCard label="Needing Attention" value={String(dashboard.accountsNeedingAttention)} caption="AWS only" />
              <StatCard label="Resources Discovered" value={dashboard.resourcesDiscovered.toLocaleString()} />
              <StatCard label="Credential Rotation Due" value={String(dashboard.rotationDue)} caption="AWS only" />
            </div>
            <p className="text-xs text-slate-400 -mt-3">GCP projects and Azure subscriptions appear in Inventory alongside AWS accounts, and their own health can be seen there.</p>

            {dashboard.accountsNeedingAttentionList.length > 0 && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 p-4">
                <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3 flex items-center gap-1.5">
                  <Icon name="alert-triangle" size={14} />
                  Accounts Needing Attention
                </h3>
                <ul className="flex flex-col divide-y divide-amber-100 dark:divide-amber-900/40">
                  {dashboard.accountsNeedingAttentionList.map(a => {
                    const isValidationPending = a.reason === 'Not yet validated';
                    return (
                      <li key={a.connectionId} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge tone={isValidationPending ? 'warning' : 'critical'}>{isValidationPending ? 'Pending' : 'Critical'}</Badge>
                          <button onClick={() => navigate(`/cloud-accounts/${a.connectionId}`)} className="text-slate-700 dark:text-slate-200 hover:underline font-medium truncate">{a.connectionName}</button>
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
                  <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Next Scheduled</dt><dd className="text-slate-400">On-demand</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500 dark:text-slate-400">Success Rate</dt><dd className="text-slate-400">—</dd></div>
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
                      <button onClick={() => navigate(`/cloud-accounts/${a.connectionId}`)} className="text-slate-700 dark:text-slate-200 hover:underline">{a.connectionName}</button>
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
                      <button onClick={() => navigate(`/cloud-accounts/${a.connectionId}`)} className="text-slate-700 dark:text-slate-200 hover:underline">{a.connectionName}</button>
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
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, account, or project ID…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-56" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Environment</span>
              <select value={environmentFilter} onChange={e => setEnvironmentFilter(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${environmentFilter ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Environments</option>
                {ENVIRONMENT_OPTIONS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            {(search || statusFilter || environmentFilter || providerFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter(''); setEnvironmentFilter(''); setProviderFilter(''); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
            )}
            <span className="text-xs text-slate-400 pb-2 ml-auto">{filtered.length.toLocaleString()} account{filtered.length === 1 ? '' : 's'} total</span>
            <button onClick={() => void exportExcel()} disabled={exportingExcel} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 mb-0" title="Exports every matching account, not just this page">
              {exportingExcel ? 'Exporting…' : 'Export Excel'}
            </button>
            {bulkMode && selectedIds.size > 0 && (
              <>
                <button onClick={() => void handleBulkDisconnect()} className="text-xs rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1.5">Disconnect {selectedIds.size} selected</button>
                <button onClick={() => void handleBulkDeletePermanently()} className="text-xs rounded-md border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5" title="Irreversible — also deletes resources and history for each selected account">Delete {selectedIds.size} selected permanently</button>
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
            <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Provider</span>
            <button onClick={() => setProviderFilter('')} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!providerFilter ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            {PROVIDER_CHIPS.map(p => (
              <button key={p.value} onClick={() => setProviderFilter(p.value)} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${providerFilter === p.value ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{p.label}</button>
            ))}
            <span className="text-xs rounded-full px-2.5 py-1 border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed" title="Azure connector is available in Enterprise plan">Azure</span>
          </div>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Status</span>
            <button onClick={() => setStatusFilter('')} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!statusFilter ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            {STATUS_CHIPS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs rounded-full px-2.5 py-1 border capitalize transition-colors ${statusFilter === s ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{s}</button>
            ))}
          </div>

          {inventoryLoading && !inventoryLoadedOnce ? (
            <TableSkeleton rows={8} cols={8} />
          ) : (
            <DataTable
              columns={columns}
              rows={pageRows}
              rowKey={r => r.id}
              pageSize={Math.max(pageSize, 1)}
              onRowClick={r => navigate(`/cloud-accounts/${r.id}`)}
              emptyMessage={allRows.length === 0 && !search && !statusFilter && !environmentFilter && !providerFilter ? 'No cloud accounts connected yet. Click "+ Add Account" to connect your first one.' : 'No accounts match these filters.'}
            />
          )}

          {filtered.length > 0 && (
            <div className="flex items-center justify-between mt-3 text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs">
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span>Page {page} of {totalPages} · {filtered.length.toLocaleString()} total</span>
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
          <div className="h-14 w-14 rounded-full bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center">
            <Icon name="cloud" size={24} className="text-brand-600 dark:text-brand-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Connect a New Cloud Account</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
            Connect an AWS account (via a cross-account IAM role or access keys), a GCP project (via a service account key or impersonation), or an Azure subscription (via a service principal). Each wizard walks through least-privilege permissions, region selection, and an initial connection check.
          </p>
          <button onClick={() => setChooserOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5">Start Onboarding</button>
          {filtered.length > 0 && (
            <p className="text-xs text-slate-400 mt-6">
              {allRows.length.toLocaleString()} account{allRows.length === 1 ? '' : 's'} already connected — see{' '}
              <button onClick={() => setTab('Inventory')} className="text-brand-600 dark:text-brand-400 hover:underline">Account Inventory</button> to manage them.
            </p>
          )}
        </div>
      )}

      {tab === 'Organizations' && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-400">Connected AWS accounts grouped by their 12-digit AWS account ID. GCP projects use project-level grouping instead.</p>
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
          <p className="text-xs text-slate-400 px-3 pt-3">Regional coverage for AWS accounts. GCP scanners operate at project level.</p>
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
              One row per AWS account: connection status, last sync time, and permission validation results — sts:GetCallerIdentity plus real checks against IAM, Organizations, CloudWatch, CloudTrail, the Resource Groups Tagging API, and Cost Explorer. Click a row to see individual checks. Click "Validate" to run a fresh check. For GCP projects or Azure subscriptions, use Sync Now on their Inventory row instead — neither has a permission-validation endpoint built yet.
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
                            <button onClick={e => { e.stopPropagation(); navigate(`/cloud-accounts/${row.connectionId}`); }} className="text-slate-700 dark:text-slate-200 hover:underline font-medium">{row.connectionName}</button>
                          </td>
                          <td className="px-3 py-2"><Badge tone="neutral">{row.connectionStatus}</Badge></td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.lastSync ? new Date(row.lastSync).toLocaleString() : 'Never'}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.lastPermissionCheck ? new Date(row.lastPermissionCheck).toLocaleString() : 'Never'}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              {row.deniedCount > 0 && <Badge tone="warning">{row.deniedCount} denied</Badge>}
                              {row.errorCount > 0 && <Badge tone="critical">{row.errorCount} error{row.errorCount === 1 ? '' : 's'}</Badge>}
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
              <span className="text-xs text-slate-400">Live CSV export from this org's current AWS account data.</span>
              <button onClick={() => void downloadReport(r.kind)} disabled={downloadingReport === r.kind} className="mt-1 text-xs rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5 self-start">
                {downloadingReport === r.kind ? 'Downloading…' : 'Download CSV'}
              </button>
            </div>
          ))}
        </div>
      )}

      <AddAccountChooser open={chooserOpen} onClose={() => setChooserOpen(false)} onChoose={openWizard} />
      <ConnectAwsAccountWizard open={awsWizardOpen} onClose={() => setAwsWizardOpen(false)} onConnected={loadInventory} projects={projects} />
      <ConnectGcpProjectWizard open={gcpWizardOpen} onClose={() => setGcpWizardOpen(false)} onConnected={loadInventory} projects={projects} />
      <ConnectAzureSubscriptionWizard open={azureWizardOpen} onClose={() => setAzureWizardOpen(false)} onConnected={loadInventory} projects={projects} />
      {updateCredsFor && (
        <UpdateCredentialsModal
          row={updateCredsFor}
          onClose={() => setUpdateCredsFor(null)}
          onUpdated={() => { setUpdateCredsFor(null); void loadInventory(); }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

/** Row-level "⋯" menu — replaces a row of competing text links with the single action point AWS Console / Datadog tables use. AWS-only actions (Validate Permissions, Open Console) are hidden for GCP rows rather than shown disabled, since they genuinely don't apply. */
function RowActionsMenu({ row, validating, syncing, isFavorited, onValidate, onSync, onToggleFavorite, onUpdateCredentials, onDisconnect, onDelete }: {
  row: UnifiedAccountRow;
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Rendered via a portal (see below) precisely because this table's wrapper
  // has overflow-x-auto for horizontal scrolling — a normal position:absolute
  // dropdown gets clipped by that overflow boundary the moment the "⋯"
  // trigger isn't at the very left edge, hiding every item past the first.
  // Escaping to document.body with fixed positioning sidesteps that
  // entirely; position is computed from the trigger's own bounding rect.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current) { setCoords(null); return; }
    const rect = buttonRef.current.getBoundingClientRect();
    const MENU_WIDTH = 224; // w-56
    setCoords({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, [open]);

  // Flip above the trigger if the menu would run off the bottom of the
  // viewport once its real height is known (only measurable post-render).
  useEffect(() => {
    if (!open || !coords || !menuRef.current || !buttonRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    if (menuRect.bottom > window.innerHeight) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords((prev) => (prev ? { ...prev, top: rect.top - menuRect.height - 4 } : prev));
    }
  }, [open, coords]);

  function copyId() {
    void navigator.clipboard.writeText(row.identifier);
    toast(`${row.provider === 'gcp' ? 'Project' : 'Account'} ID copied`, 'success');
    setOpen(false);
  }

  function openConsole() {
    window.open(`https://${row.region}.console.aws.amazon.com/console/home?region=${row.region}`, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  return (
    <div className="inline-block text-left" onClick={e => e.stopPropagation()}>
      <button ref={buttonRef} onClick={() => setOpen(v => !v)} className="rounded-md w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Row actions" aria-haspopup="menu" aria-expanded={open}>
        ⋯
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: 224 }}
          className="z-50 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 text-sm animate-[fadeIn_0.1s_ease-out]"
        >
          <button role="menuitem" onClick={() => { setOpen(false); onSync(); }} disabled={syncing} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50" title="Manually re-runs Discover Resources for this account right now">
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          {row.provider === 'aws' && (
            <button role="menuitem" onClick={() => { setOpen(false); onValidate(); }} disabled={validating} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50" title="Runs real sts:GetCallerIdentity + IAM/Organizations/CloudWatch/CloudTrail/Tagging/Cost Explorer permission checks">
              {validating ? 'Validating…' : 'Validate Permissions'}
            </button>
          )}
          {row.provider === 'aws' && (
            <button role="menuitem" onClick={openConsole} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60" title="Opens the AWS Console using your browser's current AWS sign-in session">
              Open AWS Console ↗
            </button>
          )}
          {row.provider === 'aws' && (
            <button role="menuitem" onClick={() => { setOpen(false); onToggleFavorite(); }} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60" title="Pin this account to the Overview page for quick access">
              {isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
            </button>
          )}
          <button role="menuitem" onClick={copyId} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60">Copy {row.provider === 'gcp' ? 'Project' : 'Account'} ID</button>
          {onUpdateCredentials && (
            <button role="menuitem" onClick={() => { setOpen(false); onUpdateCredentials(); }} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60">Update Credentials</button>
          )}
          <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
          <button role="menuitem" onClick={() => { setOpen(false); onDisconnect(); }} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">Disconnect</button>
          <button role="menuitem" onClick={() => { setOpen(false); onDelete(); }} className="w-full text-left px-3 py-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Irreversible — also deletes this account's resources and history">Delete Permanently</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Re-encrypts stored credentials in place — disconnect+re-add hits the
 * org_id+identifier unique constraint since disconnect is a soft
 * status-flip, not a row delete. Also the only way to rotate credentials at
 * all. Handles AWS access keys, GCP service account key JSON, and Azure
 * client secrets (Azure's PUT .../credentials only rotates the secret —
 * tenant/client id changes go through the Connect wizard's reconnect path,
 * same as AWS/GCP's identifiers are immutable here too).
 */
function UpdateCredentialsModal({ row, onClose, onUpdated }: { row: UnifiedAccountRow; onClose: () => void; onUpdated: () => void }) {
  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [serviceAccountKeyJson, setServiceAccountKeyJson] = useState('');
  const [azureClientSecret, setAzureClientSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      if (row.provider === 'gcp') {
        await api.updateGcpAccountCredentials(row.id, { serviceAccountKeyJson });
      } else if (row.provider === 'azure') {
        await api.updateAzureAccountCredentials(row.id, { azureClientSecret: azureClientSecret.trim() });
      } else {
        await api.updateAccountCredentials(row.id, { accessKeyId, secretAccessKey });
      }
      toast(`Credentials updated for "${row.name}"`, 'success');
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = row.provider === 'gcp' ? !!serviceAccountKeyJson.trim() : row.provider === 'azure' ? !!azureClientSecret.trim() : !!accessKeyId && !!secretAccessKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Update Credentials</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">✕</button>
        </div>
        <p className="text-xs text-slate-400">
          Replaces the stored credentials for <strong>{row.name}</strong> — used to rotate credentials, or to re-encrypt after the platform's encryption key changes. Status resets to "pending" until you re-run a sync/validation.
        </p>
        {row.provider === 'gcp' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Service Account Key (JSON)</span>
            <textarea value={serviceAccountKeyJson} onChange={e => setServiceAccountKeyJson(e.target.value)} rows={5} placeholder='{"type": "service_account", "project_id": "...", ...}' className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" />
          </label>
        ) : row.provider === 'azure' ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-500 dark:text-slate-400">Client Secret</span>
            <input type="password" value={azureClientSecret} onChange={e => setAzureClientSecret(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" placeholder="The secret's Value, not its Secret ID" />
            <span className="text-[11px] text-slate-400">Tenant ID and Client (application) ID can't be changed here — reconnect via "Add Cloud Account" if those need to change too.</span>
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Access Key ID</span>
              <input value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" placeholder="AKIA…" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Secret Access Key</span>
              <input type="password" value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" />
            </label>
          </>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          <button onClick={() => void submit()} disabled={submitting || !canSubmit} className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3 py-1.5">
            {submitting ? 'Saving…' : 'Save & Reconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}
