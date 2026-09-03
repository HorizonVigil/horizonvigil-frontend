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
import { OverviewPanel } from '../components/cloudAccounts/OverviewPanel';
import { ConnectionsPanel } from '../components/cloudAccounts/ConnectionsPanel';
import { HierarchyPanel } from '../components/cloudAccounts/HierarchyPanel';
import { HealthPanel } from '../components/cloudAccounts/HealthPanel';
import { ChangesPanel } from '../components/cloudAccounts/ChangesPanel';
import { ActivityPanel } from '../components/cloudAccounts/ActivityPanel';
import { AccessMatrix } from '../components/cloudAccounts/AccessMatrix';
import { BulkOnboardingModal } from '../components/cloudAccounts/BulkOnboardingModal';
import { Modal } from '../components/Modal';
import { useConfirm } from '../components/ConfirmDialog';
import { TableSkeleton } from '../components/Skeleton';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import { useToast } from '../lib/toast';
import { Icon } from '../components/icons';
import { downloadExcel } from '../lib/excelExport';
import { api, ApiError, type CloudConnection, type GcpConnection, type AzureConnection, type AccountSummary, type AccountPermissionSummary, type Favorite, type CloudIdentity, type IdentitySummary, type IdentityEdge } from '../lib/api';
import { type UnifiedAccountRow, toUnifiedRow, toUnifiedGcpRow, toUnifiedAzureRow } from '../lib/unifiedAccounts';
import { fetchAllPages } from '../lib/fetchAllPages';

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
// Inventory is the one tab that's genuinely multi-cloud. It used to merge
// AWS/GCP/Azure into one client-side table on the assumption that "the
// realistic account count per org is low enough this doesn't need
// server-side paging" -- false at real enterprise scale (thousands of
// accounts per cloud), and the merged fetch silently truncated at the
// server's per-request cap with no indication anything was missing past
// row 200. Now: filtering to one specific provider switches to that
// provider's own real, fully paginated server-side list (DataTable's
// `server` mode) -- unlimited access to every account on that cloud, not
// just the first page. The "All" merged view stays a bounded, honestly
// labeled snapshot (the first page from each cloud) rather than either
// silently truncating or looping every page from every provider into one
// client array, which would just relocate the same problem into a multi-MB
// browser payload on every page load. See the disclosure banner rendered
// in that mode. Dashboard, Organizations, Regions, Sync Center, and Reports
// stay AWS-only in their data — gcp-accounts-api has no dashboard/
// organizations/regions/sync-status/reports endpoints yet (only accounts
// CRUD + discovery), and fabricating numbers for a tab GCP has no backend
// behind would violate this codebase's own "never ship a tab with nothing
// real behind it" rule.
// Restructured to the Cloud Accounts spec §4 information architecture. Tab
// *values* are kept close to the originals where a body was migrated
// verbatim (Inventory / Sync Center / Regions / Reports) so existing
// `?tab=` bookmarks and navConfig links keep working; TAB_LABEL carries the
// spec's display name. New tabs: Overview (was Dashboard), Connections,
// Hierarchy (was Organizations), Access (was Identities + access matrix),
// Health, Changes, Activity, Settings. Onboarding folds into "+ Connect
// Cloud" + the Bulk Onboarding flow.
const TABS = ['Overview', 'Connections', 'Inventory', 'Hierarchy', 'Access', 'Sync Center', 'Health', 'Changes', 'Activity', 'Regions', 'Settings'] as const;
type Tab = typeof TABS[number];

const TAB_LABEL: Record<Tab, string> = {
  Overview: 'Overview', Connections: 'Connections', Inventory: 'Accounts', Hierarchy: 'Hierarchy',
  Access: 'Access & Permissions', 'Sync Center': 'Sync & Discovery', Health: 'Health', Changes: 'Changes',
  Activity: 'Activity', Regions: 'Regions', Settings: 'Settings',
};

// useSubmenuAccess keys off the navConfig label, so the two are bridged by hand.
const TAB_TO_NAV_LABEL: Record<Tab, string> = {
  Overview: 'Overview', Connections: 'Connections', Inventory: 'Account Inventory', Hierarchy: 'Hierarchy',
  Access: 'Access & Permissions', 'Sync Center': 'Sync & Discovery', Health: 'Health', Changes: 'Changes',
  Activity: 'Activity', Regions: 'Regions', Settings: 'Settings',
};

const IDENTITY_PRIVILEGE_TONE: Record<string, 'good' | 'warning' | 'critical'> = { scoped: 'good', broad: 'warning', admin_equivalent: 'critical' };

const STATUS_CHIPS = ['connected', 'pending', 'error', 'disconnected', 'expired'] as const;
const PROVIDER_CHIPS = [{ value: 'aws', label: 'AWS' }, { value: 'gcp', label: 'GCP' }, { value: 'azure', label: 'Azure' }] as const;
const ENVIRONMENT_OPTIONS = ['production', 'staging', 'dev', 'sandbox', 'qa', 'security', 'dr', 'legacy'];
const PAGE_SIZES = [25, 50, 100];

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/**
 * Each cloud models "permissions" differently, so this reads the exact
 * fields each connector's own identity-ingestion code actually writes into
 * cloud_identities.metadata, per provider, rather than one generic shape:
 * AWS attaches real policy names (attachedPolicies/inlinePolicies, from
 * ListAttached*Policies/List*Policies), GCP attaches the IAM roles this
 * identity is bound to (boundRoles, from the project's own getIamPolicy),
 * Azure attaches resolved role-assignment names (roleNames, from a real
 * Microsoft.Authorization/roleDefinitions lookup -- see roleAssignments.ts's
 * own doc comment for why that's ARM, not a fabricated Graph call).
 */
function IdentityPermissionsList({ identity }: { identity: CloudIdentity }) {
  const metadata = identity.metadata ?? {};
  if (identity.provider === 'aws') {
    const attached = (metadata.attachedPolicies as string[] | undefined) ?? [];
    const inline = (metadata.inlinePolicies as string[] | undefined) ?? [];
    if (attached.length === 0 && inline.length === 0) return <p className="text-xs text-slate-400">No attached or inline policies.</p>;
    return (
      <ul className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-0.5">
        {attached.map((name, i) => <li key={`a-${i}`}><Badge tone="neutral">Attached</Badge> {name}</li>)}
        {inline.map((name, i) => <li key={`i-${i}`}><Badge tone="neutral">Inline</Badge> {name}</li>)}
      </ul>
    );
  }
  if (identity.provider === 'gcp') {
    const roles = (metadata.boundRoles as string[] | undefined) ?? [];
    if (roles.length === 0) return <p className="text-xs text-slate-400">Not bound to any IAM role on this project.</p>;
    return <ul className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-0.5">{roles.map((r, i) => <li key={i}>{r}</li>)}</ul>;
  }
  // Azure
  const roleNames = (metadata.roleNames as string[] | undefined) ?? [];
  if (roleNames.length === 0) return <p className="text-xs text-slate-400">No role assignments found.</p>;
  return <ul className="text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-0.5">{roleNames.map((r, i) => <li key={i}>{r}</li>)}</ul>;
}

export function CloudAccounts() {
  const { projects, currentOrg } = useOrg();
  const { refreshToken, connections: allConnectionRows } = useFilters();
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
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);
  const [awsConnections, setAwsConnections] = useState<CloudConnection[]>([]);
  const [gcpConnections, setGcpConnections] = useState<GcpConnection[]>([]);
  const [azureConnections, setAzureConnections] = useState<AzureConnection[]>([]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [awsWizardOpen, setAwsWizardOpen] = useState(false);
  const [gcpWizardOpen, setGcpWizardOpen] = useState(false);
  const [azureWizardOpen, setAzureWizardOpen] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api.getFavorites()
      .then(r => { if (!cancelled) setFavorites(r.favorites); })
      .catch(err => {
        if (!cancelled) toast(err instanceof ApiError ? err.message : 'Failed to load Favorites.', 'error');
      });
    return () => { cancelled = true; };
  }, [refreshToken, toast]);

  async function toggleFavorite(connectionId: string, name: string, provider: 'aws' | 'gcp' | 'azure') {
    const path = `/cloud-accounts/${connectionId}`;
    const existing = favorites.find(f => f.path === path);

    try {
      if (existing) {
        await api.removeFavorite(existing.id);
        setFavorites(prev => prev.filter(f => f.id !== existing.id));
        toast(`Removed "${name}" from Favorites`, 'success');
      } else {
        const { favorite } = await api.addFavorite({ type: `${provider}-account`, label: name, path });
        setFavorites(prev => [...prev, favorite]);
        toast(`Added "${name}" to Favorites — see it on Overview`, 'success');
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Failed to update Favorites.', 'error');
    }
  }


  // Inventory search/filter/bulk/pagination state. When a specific provider
  // is selected, `page`/`pageSize` drive real server-side pagination against
  // that provider's own API (DataTable's `server` mode) via `providerTotal`
  // (the real total from that API's `pagination.total`, not a client count).
  // In "All" mode there's no single paginated source to drive -- see
  // `loadInventory` below for what that view fetches instead.
  const [search, setSearchRaw] = useState('');
  const [statusFilter, setStatusFilterRaw] = useState('');
  const [environmentFilter, setEnvironmentFilterRaw] = useState('');
  const [providerFilter, setProviderFilterRaw] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(50);
  const [providerTotal, setProviderTotal] = useState(0);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryLoadedOnce, setInventoryLoadedOnce] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  // API helpers in this codebase do not expose AbortSignal, so use request
  // generations to prevent stale responses from overwriting newer state.
  const inventoryRequestRef = useRef(0);
  const identitiesRequestRef = useRef(0);

  const resetInventorySelection = () => setSelectedIds(new Set());
  const setSearch = (v: string) => { setSearchRaw(v); setPage(1); resetInventorySelection(); };
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); setPage(1); resetInventorySelection(); };
  const setEnvironmentFilter = (v: string) => { setEnvironmentFilterRaw(v); setPage(1); resetInventorySelection(); };
  const setProviderFilter = (v: string) => { setProviderFilterRaw(v); setPage(1); resetInventorySelection(); };
  const setPageSize = (v: number) => { setPageSizeRaw(v); setPage(1); resetInventorySelection(); };
  const setInventoryPage = (v: number) => { setPage(v); resetInventorySelection(); };

  // Tab-specific data
  const [syncStatus, setSyncStatus] = useState<AccountSummary[]>([]);
  const [regions, setRegions] = useState<{ region: string; resourceCount: number; accountsEnabled: number; accountsWithResources: number }[]>([]);
  const [permissionsSummary, setPermissionsSummary] = useState<AccountPermissionSummary[]>([]);
  const [syncCenterLoaded, setSyncCenterLoaded] = useState(false);
  const [expandedSyncRow, setExpandedSyncRow] = useState<string | null>(null);
  const [updateCredsFor, setUpdateCredsFor] = useState<UnifiedAccountRow | null>(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Identities tab (cloud_identities) — its own server-side pagination, same
  // pattern as Inventory's provider-filtered path, since this list can be
  // just as large as the account list itself (one row per IAM user/role).
  const [identities, setIdentities] = useState<CloudIdentity[]>([]);
  const [identitySummary, setIdentitySummary] = useState<IdentitySummary | null>(null);
  const [identitiesTotal, setIdentitiesTotal] = useState(0);
  const [identitiesLoading, setIdentitiesLoading] = useState(true);
  const [identityPage, setIdentityPage] = useState(1);
  const [identityPageSize, setIdentityPageSize] = useState(50);
  const [identitySearch, setIdentitySearch] = useState('');
  const [identityPrivilegeFilter, setIdentityPrivilegeFilter] = useState('');
  const [identityHumanFilter, setIdentityHumanFilter] = useState<'' | 'true' | 'false'>('');
  const [identityProviderFilter, setIdentityProviderFilter] = useState('');
  const [identitiesError, setIdentitiesError] = useState<string | null>(null);
  const [selectedIdentity, setSelectedIdentity] = useState<CloudIdentity | null>(null);
  const [identityEdges, setIdentityEdges] = useState<{ outbound: IdentityEdge[]; inbound: IdentityEdge[] } | null>(null);
  // The list endpoint deliberately omits `metadata` (LIST_SELECT in
  // identities.ts) to keep the paged response light -- the permissions list
  // below needs it, so it's fetched separately per-identity, same lazy-load
  // pattern as identityEdges right below.
  const [selectedIdentityDetail, setSelectedIdentityDetail] = useState<CloudIdentity | null>(null);

  const loadInventory = useCallback(async () => {
    const requestId = ++inventoryRequestRef.current;
    setInventoryLoading(true);
    setInventoryError(null);

    try {
      const apiFilters = {
        status: statusFilter || undefined,
        environment: environmentFilter || undefined,
        search: search || undefined,
      };

      if (providerFilter) {
        // Provider-specific mode is genuinely server-paginated.
        const res = providerFilter === 'gcp'
          ? await api.getGcpAccounts({ ...apiFilters, page, limit: pageSize })
          : providerFilter === 'azure'
            ? await api.getAzureAccounts({ ...apiFilters, page, limit: pageSize })
            : await api.getAccounts({ ...apiFilters, page, limit: pageSize });

        if (requestId !== inventoryRequestRef.current) return;

        setAwsConnections(providerFilter === 'aws' ? res.items as CloudConnection[] : []);
        setGcpConnections(providerFilter === 'gcp' ? res.items as GcpConnection[] : []);
        setAzureConnections(providerFilter === 'azure' ? res.items as AzureConnection[] : []);
        setProviderTotal(res.pagination.total);
      } else {
        // "All" remains a bounded first-page snapshot by design. This avoids
        // loading thousands of rows into the browser just to render a table.
        const [awsRes, gcpRes, azureRes] = await Promise.all([
          api.getAccounts({ ...apiFilters, page: 1, limit: pageSize }),
          api.getGcpAccounts({ ...apiFilters, page: 1, limit: pageSize }),
          api.getAzureAccounts({ ...apiFilters, page: 1, limit: pageSize }),
        ]);

        if (requestId !== inventoryRequestRef.current) return;

        setAwsConnections(awsRes.items);
        setGcpConnections(gcpRes.items);
        setAzureConnections(azureRes.items);
        setProviderTotal(
          awsRes.pagination.total +
          gcpRes.pagination.total +
          azureRes.pagination.total,
        );
      }
    } catch (err) {
      if (requestId !== inventoryRequestRef.current) return;
      setInventoryError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load cloud accounts.');
    } finally {
      if (requestId === inventoryRequestRef.current) {
        setInventoryLoading(false);
        setInventoryLoadedOnce(true);
      }
    }
  }, [providerFilter, statusFilter, environmentFilter, search, page, pageSize]);


  useEffect(() => { void loadInventory(); }, [loadInventory, refreshToken]);
  // Test-connection state keeps running in the background (see syncContext.tsx)
  // even if you navigate away mid-request — this refreshes the table once it
  // finishes, whether that happens while you're on this page or you come back later.
  useSyncCompletion([...awsConnections.map(c => c.id), ...gcpConnections.map(c => c.id), ...azureConnections.map(c => c.id)], loadInventory);

  // Each secondary tab's data is only fetched once you actually open it, and
  // re-fetched on refreshToken while that tab is active. Promise.allSettled
  // (not .then chains left to reject silently) so one failing call surfaces
  // a toast instead of leaving that tab's data permanently stuck on its
  // loading/empty state with no explanation -- and a `cancelled` guard so a
  // slow response from a tab the user has already switched away from can't
  // land late and overwrite whatever tab's data is now on screen.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // Overview / Connections / Hierarchy / Health / Changes / Activity
        // tabs each own their data-loading in their own component now.
        if (tab === 'Regions') {
          const r = await api.getAwsAccountsRegions();
          if (!cancelled) setRegions(r.regions);
        } else if (tab === 'Sync Center') {
          setSyncCenterLoaded(false);
          const [sync, permissions] = await Promise.allSettled([api.getAccountsSyncStatus(), api.getAwsAccountsPermissionsSummary()]);
          if (cancelled) return;
          if (sync.status === 'fulfilled') setSyncStatus(sync.value.accounts); else toast(sync.reason instanceof Error ? sync.reason.message : 'Failed to load sync status.', 'error');
          if (permissions.status === 'fulfilled') setPermissionsSummary(permissions.value.accounts); else toast(permissions.reason instanceof Error ? permissions.reason.message : 'Failed to load permission summary.', 'error');
          setSyncCenterLoaded(true);
        }
      } catch (err) {
        if (!cancelled) toast(err instanceof Error ? err.message : 'Failed to load account data.', 'error');
        setSyncCenterLoaded(true);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [tab, refreshToken, toast]);

  const loadIdentities = useCallback(async () => {
    const requestId = ++identitiesRequestRef.current;
    setIdentitiesLoading(true);
    setIdentitiesError(null);

    const [listRes, summaryRes] = await Promise.allSettled([
      api.getIdentities({
        page: identityPage,
        limit: identityPageSize,
        search: identitySearch || undefined,
        provider: identityProviderFilter || undefined,
        privilegeLevel: identityPrivilegeFilter || undefined,
        isHuman: identityHumanFilter === '' ? undefined : identityHumanFilter === 'true',
      }),
      api.getIdentitySummary(),
    ]);

    if (requestId !== identitiesRequestRef.current) return;

    if (listRes.status === 'fulfilled') {
      setIdentities(listRes.value.items);
      setIdentitiesTotal(listRes.value.pagination.total);
    } else {
      setIdentitiesError(
        listRes.reason instanceof Error ? listRes.reason.message : 'Failed to load identities.',
      );
    }

    if (summaryRes.status === 'fulfilled') {
      setIdentitySummary(summaryRes.value);
    } else {
      // Keep list data usable even when the optional summary endpoint fails.
      toast(
        summaryRes.reason instanceof Error ? summaryRes.reason.message : 'Failed to load identity summary.',
        'error',
      );
    }

    setIdentitiesLoading(false);
  }, [
    identityPage,
    identityPageSize,
    identitySearch,
    identityPrivilegeFilter,
    identityHumanFilter,
    identityProviderFilter,
    toast,
  ]);


  useEffect(() => {
    if (tab === 'Access') void loadIdentities();
  }, [tab, loadIdentities, refreshToken]);

  useEffect(() => {
    if (!selectedIdentity) { setIdentityEdges(null); setSelectedIdentityDetail(null); return; }
    let cancelled = false;
    const selectedId = selectedIdentity.id;
    setIdentityEdges(null);
    setSelectedIdentityDetail(null);
    void Promise.allSettled([api.getIdentityEdges(selectedId), api.getIdentity(selectedId)]).then(([edges, detail]) => {
      if (cancelled) return;
      if (edges.status === 'fulfilled') setIdentityEdges(edges.value);
      else toast(edges.reason instanceof Error ? edges.reason.message : 'Failed to load identity relationships.', 'error');
      if (detail.status === 'fulfilled') setSelectedIdentityDetail(detail.value);
      else toast(detail.reason instanceof Error ? detail.reason.message : 'Failed to load identity details.', 'error');
    });
    return () => { cancelled = true; };
  }, [selectedIdentity, toast]);

  // Status/environment/search/provider filters are all applied server-side
  // now (see loadInventory) -- awsConnections/gcpConnections/azureConnections
  // already only hold matching rows, so no further client-side filtering is
  // needed here. In provider-specific mode this is exactly the current page;
  // in "All" mode it's the bounded per-cloud snapshot described above.
  const allRows = useMemo(() => [...awsConnections.map(toUnifiedRow), ...gcpConnections.map(toUnifiedGcpRow), ...azureConnections.map(toUnifiedAzureRow)], [awsConnections, gcpConnections, azureConnections]);

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
    const results = await Promise.allSettled(rows.map(disconnectFor));
    const failed = results.filter(r => r.status === 'rejected').length;
    setSelectedIds(new Set());
    await loadInventory();
    if (failed === 0) {
      toast(`Disconnected ${n} account${n === 1 ? '' : 's'}`, 'success');
    } else {
      toast(`Disconnected ${n - failed} of ${n}; ${failed} failed.`, 'error');
    }
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
    const results = await Promise.allSettled(rows.map(deletePermanentlyFor));
    const failed = results.filter(r => r.status === 'rejected').length;
    setSelectedIds(new Set());
    await loadInventory();
    if (failed === 0) {
      toast(`Deleted ${n} account${n === 1 ? '' : 's'} permanently`, 'success');
    } else {
      toast(`Deleted ${n - failed} of ${n}; ${failed} failed.`, 'error');
    }
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
      // Loops the real API to completion (respecting the active filters)
      // rather than exporting whatever's currently loaded in the table --
      // that used to be the same client-truncated array the table itself was
      // capped to, so the tooltip's "every matching account" claim was false
      // past 200 accounts. Provider-filtered exports hit just that one
      // provider's API; "All" exports all three, same filters applied to each.
      const apiFilters = { status: statusFilter || undefined, environment: environmentFilter || undefined, search: search || undefined };
      let rows: UnifiedAccountRow[];
      if (providerFilter === 'gcp') {
        rows = (await fetchAllPages((p, limit) => api.getGcpAccounts({ ...apiFilters, page: p, limit }))).map(toUnifiedGcpRow);
      } else if (providerFilter === 'azure') {
        rows = (await fetchAllPages((p, limit) => api.getAzureAccounts({ ...apiFilters, page: p, limit }))).map(toUnifiedAzureRow);
      } else if (providerFilter === 'aws') {
        rows = (await fetchAllPages((p, limit) => api.getAccounts({ ...apiFilters, page: p, limit }))).map(toUnifiedRow);
      } else {
        const [aws, gcp, azure] = await Promise.all([
          fetchAllPages((p, limit) => api.getAccounts({ ...apiFilters, page: p, limit })),
          fetchAllPages((p, limit) => api.getGcpAccounts({ ...apiFilters, page: p, limit })),
          fetchAllPages((p, limit) => api.getAzureAccounts({ ...apiFilters, page: p, limit })),
        ]);
        rows = [...aws.map(toUnifiedRow), ...gcp.map(toUnifiedGcpRow), ...azure.map(toUnifiedAzureRow)];
      }
      downloadExcel(
        'cloud-accounts-inventory',
        'Cloud Accounts',
        ['Name', 'Provider', 'Account / Project ID', 'Environment', 'Status', 'Connection Method', 'Region', 'Resources', 'Last Sync'],
        rows.map(r => [
          r.name, r.provider.toUpperCase(), r.identifier, r.environment, r.status,
          r.connectionMethodLabel, r.region, r.resources ?? 0, r.lastSync ?? 'Never',
        ]),
      );
      toast(`Exported ${rows.length.toLocaleString()} account${rows.length === 1 ? '' : 's'} to Excel`, 'success');
    } finally {
      setExportingExcel(false);
    }
  }


  const identityColumns: Column<CloudIdentity>[] = useMemo(() => [
    { key: 'display_name', header: 'Identity', sticky: true, sortValue: r => r.display_name ?? r.native_id, render: r => (
      <div className="flex flex-col">
        <span className="text-slate-800 dark:text-slate-100 font-medium">{r.display_name ?? r.native_id}</span>
        <span className="text-xs text-slate-400">{r.native_id}</span>
      </div>
    ) },
    { key: 'provider', header: 'Cloud', sortValue: r => r.provider, render: r => <Badge tone="neutral">{r.provider.toUpperCase()}</Badge> },
    { key: 'identity_type', header: 'Type', sortValue: r => r.identity_type, render: r => <span className="capitalize">{r.identity_type.replace(/_/g, ' ')}</span> },
    { key: 'is_human', header: 'Kind', sortValue: r => (r.is_human ? 'Human' : 'Non-human'), render: r => <Badge tone="neutral">{r.is_human ? 'Human' : 'Non-human'}</Badge> },
    { key: 'privilege_level', header: 'Privilege', sortValue: r => r.privilege_level ?? '', render: r => r.privilege_level ? <Badge tone={IDENTITY_PRIVILEGE_TONE[r.privilege_level]}>{r.privilege_level.replace(/_/g, ' ')}</Badge> : <span className="text-slate-400">—</span> },
    { key: 'mfa_enabled', header: 'MFA', sortValue: r => String(r.mfa_enabled), render: r => (
      r.mfa_enabled === null ? <span className="text-slate-400">n/a</span> : <Badge tone={r.mfa_enabled ? 'good' : 'critical'}>{r.mfa_enabled ? 'Enabled' : 'Off'}</Badge>
    ) },
    { key: 'last_used_at', header: 'Last Used', sortValue: r => r.last_used_at ?? '', render: r => r.last_used_at ? new Date(r.last_used_at).toLocaleDateString() : <span className="text-slate-400">Never</span> },
  ], []);

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
      }
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
          onToggleFavorite={() => void toggleFavorite(r.id, r.name, r.provider)}
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
      {/* Region/Date filters don't apply anywhere on this page -- none of its
          8 tabs read region/dateRange from useFilters() (only refreshToken
          is used); each tab that needs region/privilege/kind/provider
          filtering already has its own local, tab-specific chips (Inventory's
          provider chips, Identities' Cloud/Privilege/Kind chips, etc). Same
          "don't show a control that silently does nothing" principle
          showAccountFilter={false} above already applied -- Region/Date were
          just missed. */}
      <FilterBar title="Cloud Accounts" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex gap-1 text-sm flex-wrap">
          {visibleTabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setBulkOpen(true)} className="rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">Bulk Onboard</button>
          <button onClick={() => setChooserOpen(true)} className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2 transition-colors">+ Connect Cloud</button>
        </div>
      </div>

      {tab === 'Overview' && (
        <OverviewPanel
          refreshToken={refreshToken}
          onProviderClick={(p) => { setProviderFilter(p); setTab('Inventory'); }}
        />
      )}
      {tab === 'Connections' && (
        <ConnectionsPanel rows={allConnectionRows} onAddConnection={() => setChooserOpen(true)} />
      )}
      {tab === 'Hierarchy' && (
        <HierarchyPanel rows={allConnectionRows} orgName={currentOrg?.name ?? ''} refreshToken={refreshToken} />
      )}
      {tab === 'Health' && <HealthPanel refreshToken={refreshToken} />}
      {tab === 'Changes' && <ChangesPanel rows={allConnectionRows} />}
      {tab === 'Activity' && <ActivityPanel refreshToken={refreshToken} />}
      {tab === 'Settings' && <SettingsTab folderProjectCount={projects.length} />}

      {tab === 'Inventory' && (
        <>
          {anyErrors.length > 0 && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {anyErrors[0]!.error}
            </div>
          )}
          {inventoryError && (
            <div className="mb-3 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3">
              <span>Couldn't load the latest account list: {inventoryError}</span>
              <button
                type="button"
                onClick={() => void loadInventory()}
                className="shrink-0 text-xs underline hover:no-underline"
              >
                Retry
              </button>
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
            <span className="text-xs text-slate-400 pb-2 ml-auto">
              {providerFilter
                ? `${providerTotal.toLocaleString()} account${providerTotal === 1 ? '' : 's'} total`
                : `${providerTotal.toLocaleString()} matching account${providerTotal === 1 ? '' : 's'} across all clouds`}
            </span>
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
          </div>
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Status</span>
            <button onClick={() => setStatusFilter('')} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!statusFilter ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            {STATUS_CHIPS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs rounded-full px-2.5 py-1 border capitalize transition-colors ${statusFilter === s ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{s}</button>
            ))}
          </div>

          {!providerFilter && providerTotal > allRows.length && (
            <div className="mb-3 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
              Showing the first {allRows.length.toLocaleString()} of {providerTotal.toLocaleString()} matching accounts across all clouds — filter by provider above to see the complete list for one cloud.
            </div>
          )}

          {inventoryLoading && !inventoryLoadedOnce ? (
            <TableSkeleton rows={8} cols={8} />
          ) : (
            <DataTable
              columns={columns}
              rows={allRows}
              rowKey={r => r.id}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZES}
              onRowClick={r => navigate(`/cloud-accounts/${r.id}`)}
              emptyMessage={allRows.length === 0 && !search && !statusFilter && !environmentFilter && !providerFilter ? 'No cloud accounts connected yet. Click "+ Add Account" to connect your first one.' : 'No accounts match these filters.'}
              server={providerFilter ? {
                page, pageSize, total: providerTotal,
                loading: inventoryLoading,
                onPageChange: setInventoryPage,
                onPageSizeChange: setPageSize,
              } : undefined}
            />
          )}
        </>
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

      {tab === 'Access' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Access &amp; Permissions</h3>
            <p className="text-xs text-slate-400">
              What HorizonVigil can access in each connected environment, and every cloud identity it has discovered. Open an
              account (Access tab) to see its exact permission-validation matrix and the actions HorizonVigil never performs.
            </p>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            One row per identity across every connected cloud — AWS (IAM users, roles, and groups), GCP (service accounts and real project IAM-policy members), or Azure (role-assignment principals: users, service principals, managed identities, groups). Click a row for its full permissions list — attached/inline policies on AWS, bound IAM roles on GCP, resolved role-assignment names on Azure. Privilege level is computed per-cloud from each account's own IAM data (AWS additionally has MFA/access-key staleness from its credential report; GCP/Azure don't expose that the same way). Azure identities show their principal ID rather than a resolved name — that needs Microsoft Graph access this connection doesn't have yet.
          </p>
          {identitiesError && (
            <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              Couldn't load identities: {identitiesError}
            </div>
          )}
          {identitySummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Identities" value={String(identitySummary.total)} icon="users-2" />
              <StatCard label="Admin-Equivalent" value={String(identitySummary.adminEquivalent)} icon="shield-alert" iconTone={identitySummary.adminEquivalent > 0 ? 'critical' : 'neutral'} />
              <StatCard label="Broad Privilege" value={String(identitySummary.broad)} icon="alert-triangle" iconTone={identitySummary.broad > 0 ? 'warning' : 'neutral'} />
              <StatCard label="Human, No MFA" value={String(identitySummary.humanWithoutMfa)} icon="lock" iconTone={identitySummary.humanWithoutMfa > 0 ? 'critical' : 'neutral'} />
            </div>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] uppercase tracking-wide text-slate-400 mr-1">Cloud</span>
            <button onClick={() => { setIdentityProviderFilter(''); setIdentityPage(1); }} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!identityProviderFilter ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            {PROVIDER_CHIPS.map(p => (
              <button key={p.value} onClick={() => { setIdentityProviderFilter(p.value); setIdentityPage(1); }} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${identityProviderFilter === p.value ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{p.label}</button>
            ))}
            <span className="text-[11px] uppercase tracking-wide text-slate-400 ml-3 mr-1">Privilege</span>
            <button onClick={() => { setIdentityPrivilegeFilter(''); setIdentityPage(1); }} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!identityPrivilegeFilter ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            {(['scoped', 'broad', 'admin_equivalent'] as const).map(level => (
              <button key={level} onClick={() => { setIdentityPrivilegeFilter(level); setIdentityPage(1); }} className={`text-xs rounded-full px-2.5 py-1 border capitalize transition-colors ${identityPrivilegeFilter === level ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{level.replace(/_/g, ' ')}</button>
            ))}
            <span className="text-[11px] uppercase tracking-wide text-slate-400 ml-3 mr-1">Kind</span>
            <button onClick={() => { setIdentityHumanFilter(''); setIdentityPage(1); }} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${identityHumanFilter === '' ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>All</button>
            <button onClick={() => { setIdentityHumanFilter('true'); setIdentityPage(1); }} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${identityHumanFilter === 'true' ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Human</button>
            <button onClick={() => { setIdentityHumanFilter('false'); setIdentityPage(1); }} className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${identityHumanFilter === 'false' ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>Non-human</button>
          </div>
          {identitiesLoading && identities.length === 0 ? (
            <TableSkeleton rows={8} cols={6} />
          ) : (
            <DataTable
              columns={identityColumns}
              rows={identities}
              rowKey={r => r.id}
              pageSizeOptions={PAGE_SIZES}
              onRowClick={r => setSelectedIdentity(r)}
              emptyMessage={identitiesTotal === 0 && !identitySearch && !identityPrivilegeFilter && !identityHumanFilter && !identityProviderFilter ? 'No identities found yet — run "Discover Resources" on a connected account to populate this from its IAM data.' : 'No identities match these filters.'}
              server={{
                page: identityPage, pageSize: identityPageSize, total: identitiesTotal,
                search: identitySearch, loading: identitiesLoading,
                onPageChange: setIdentityPage,
                onPageSizeChange: n => { setIdentityPageSize(n); setIdentityPage(1); },
                onSearchChange: q => { setIdentitySearch(q); setIdentityPage(1); },
              }}
            />
          )}
        </div>
      )}

      {selectedIdentity && (
        <Modal open={!!selectedIdentity} onClose={() => setSelectedIdentity(null)} title={selectedIdentity.display_name ?? selectedIdentity.native_id}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs text-slate-400 block">Type</span><span className="capitalize text-slate-700 dark:text-slate-200">{selectedIdentity.identity_type.replace(/_/g, ' ')}</span></div>
              <div><span className="text-xs text-slate-400 block">Kind</span><span className="text-slate-700 dark:text-slate-200">{selectedIdentity.is_human ? 'Human' : 'Non-human'}</span></div>
              <div><span className="text-xs text-slate-400 block">Privilege</span>{selectedIdentity.privilege_level ? <Badge tone={IDENTITY_PRIVILEGE_TONE[selectedIdentity.privilege_level]}>{selectedIdentity.privilege_level.replace(/_/g, ' ')}</Badge> : <span className="text-slate-400">—</span>}</div>
              <div><span className="text-xs text-slate-400 block">MFA</span>{selectedIdentity.mfa_enabled === null ? <span className="text-slate-400">n/a</span> : <Badge tone={selectedIdentity.mfa_enabled ? 'good' : 'critical'}>{selectedIdentity.mfa_enabled ? 'Enabled' : 'Off'}</Badge>}</div>
              <div><span className="text-xs text-slate-400 block">Last Used</span><span className="text-slate-700 dark:text-slate-200">{selectedIdentity.last_used_at ? new Date(selectedIdentity.last_used_at).toLocaleString() : 'Never'}</span></div>
              <div><span className="text-xs text-slate-400 block">First Seen</span><span className="text-slate-700 dark:text-slate-200">{new Date(selectedIdentity.first_seen_at).toLocaleDateString()}</span></div>
            </div>
            {selectedIdentity.privilege_reasons && selectedIdentity.privilege_reasons.length > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-400 block mb-1.5">Why this privilege level</span>
                <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-300 flex flex-col gap-0.5">
                  {selectedIdentity.privilege_reasons.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
              </div>
            )}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-1.5">Permissions</span>
              {!selectedIdentityDetail ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : (
                <IdentityPermissionsList identity={selectedIdentityDetail} />
              )}
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 block mb-1.5">Relationships</span>
              {!identityEdges ? (
                <p className="text-xs text-slate-400">Loading…</p>
              ) : identityEdges.outbound.length === 0 && identityEdges.inbound.length === 0 ? (
                <p className="text-xs text-slate-400">No relationships recorded — nothing scanned assumes this identity or is contained by it.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
                  {identityEdges.outbound.map(e => <li key={e.id}>Assumed by a resource — {e.relationship_type.toLowerCase()} ({Math.round(e.confidence * 100)}% confidence)</li>)}
                  {identityEdges.inbound.map(e => <li key={e.id}>Contains/assumes another entity — {e.relationship_type.toLowerCase()} ({Math.round(e.confidence * 100)}% confidence)</li>)}
                </ul>
              )}
            </div>
          </div>
        </Modal>
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
      <BulkOnboardingModal open={bulkOpen} onClose={() => setBulkOpen(false)} rows={allConnectionRows} onImported={loadInventory} />
      {confirmDialog}
    </div>
  );
}

/** Cloud Accounts — Settings tab (spec §4). Default scoping, credential rotation, and the AWS Organization prerequisites for bulk onboarding. */
function SettingsTab({ folderProjectCount }: { folderProjectCount: number }) {
  const { toast } = useToast();
  const [externalId, setExternalId] = useState<{ externalId: string; roleName: string } | null>(null);
  const [loadingExt, setLoadingExt] = useState(false);

  async function loadExternalId() {
    setLoadingExt(true);
    try {
      setExternalId(await api.getAwsOrgExternalId());
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load the AWS Organization external ID.', 'error');
    } finally {
      setLoadingExt(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Scope &amp; defaults</h3>
        <p className="text-xs text-slate-400">
          {folderProjectCount} project{folderProjectCount === 1 ? '' : 's'} configured. Accounts are assigned to a project in the
          Connect wizard or from an account's Settings tab. Manage folders and projects under{' '}
          <span className="text-slate-500 dark:text-slate-400">Organization Management</span>.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Bulk onboarding from an AWS Organization</h3>
        <ol className="text-xs text-slate-500 dark:text-slate-400 list-decimal list-inside space-y-1">
          <li>Connect your AWS Organizations management account as a normal cross-account-role connection.</li>
          <li>Deploy the <code>HorizonVigilRead</code> role as a StackSet across your Organization, using the external ID below.</li>
          <li>Use <strong>Bulk Onboard</strong> (top right) to import every member account in one step.</li>
        </ol>
        <div className="mt-3 flex items-center gap-2">
          {externalId ? (
            <>
              <code className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 font-mono">{externalId.externalId}</code>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(externalId.externalId); toast('External ID copied', 'success'); }} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">Copy</button>
              <span className="text-xs text-slate-400">role: {externalId.roleName}</span>
            </>
          ) : (
            <button type="button" onClick={() => void loadExternalId()} disabled={loadingExt} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
              {loadingExt ? 'Loading…' : 'Reveal external ID'}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Reports</h3>
        <p className="text-xs text-slate-400 mb-2">CSV exports of the current AWS account data.</p>
        <div className="flex flex-wrap gap-2">
          {(['account-summary', 'health', 'permissions', 'sync', 'cost'] as const).map((kind) => (
            <button key={kind} type="button"
              onClick={async () => {
                try {
                  const { blob, filename } = await api.downloadAwsAccountsReport(kind);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = filename; a.rel = 'noopener';
                  document.body.appendChild(a); a.click(); a.remove();
                  window.setTimeout(() => URL.revokeObjectURL(url), 0);
                } catch (err) {
                  toast(err instanceof ApiError ? err.message : 'Report download failed.', 'error');
                }
              }}
              className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 capitalize">
              {kind.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Row-level "⋯" menu. Provider-specific actions are hidden when they do not apply. */
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
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !buttonRef.current) { setCoords(null); return; }

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const MENU_WIDTH = 224;
      setCoords({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
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

  async function copyId() {
    try {
      await navigator.clipboard.writeText(row.identifier);
      toast(`${row.provider === 'gcp' ? 'Project' : 'Account'} ID copied`, 'success');
      setOpen(false);
    } catch {
      toast('Could not copy the ID. Check browser clipboard permissions.', 'error');
    }
  }

  function openConsole() {
    const region = row.region?.trim();
    const url = region
      ? `https://${region}.console.aws.amazon.com/console/home?region=${encodeURIComponent(region)}`
      : 'https://console.aws.amazon.com/';
    window.open(url, '_blank', 'noopener,noreferrer');
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
          <button role="menuitem" onClick={() => { setOpen(false); onToggleFavorite(); }} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60" title="Pin this account to the Overview page for quick access">
            {isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
          </button>
          <button role="menuitem" onClick={() => void copyId()} className="w-full text-left px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60">Copy {row.provider === 'gcp' ? 'Project' : 'Account'} ID</button>
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
  const [azureAuthType, setAzureAuthType] = useState<'client_secret' | 'client_certificate'>(
    row.provider === 'azure' && (row.raw as AzureConnection).azure_auth_type === 'client_certificate' ? 'client_certificate' : 'client_secret',
  );
  const [azureClientSecret, setAzureClientSecret] = useState('');
  const [azureCertificatePem, setAzureCertificatePem] = useState('');
  const [azurePrivateKeyPem, setAzurePrivateKeyPem] = useState('');
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
        await api.updateAzureAccountCredentials(row.id, {
          azureAuthType,
          ...(azureAuthType === 'client_certificate'
            ? { azureCertificatePem: azureCertificatePem.trim(), azurePrivateKeyPem: azurePrivateKeyPem.trim() }
            : { azureClientSecret: azureClientSecret.trim() }),
        });
      } else {
        await api.updateAccountCredentials(row.id, {
          accessKeyId: accessKeyId.trim(),
          secretAccessKey: secretAccessKey.trim(),
        });
      }
      toast(`Credentials updated for "${row.name}"`, 'success');
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = row.provider === 'gcp'
    ? !!serviceAccountKeyJson.trim()
    : row.provider === 'azure'
      ? (azureAuthType === 'client_certificate' ? !!azureCertificatePem.trim() && !!azurePrivateKeyPem.trim() : !!azureClientSecret.trim())
      : !!accessKeyId && !!secretAccessKey;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-credentials-title"
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 id="update-credentials-title" className="text-base font-semibold text-slate-900 dark:text-white">Update Credentials</h2>
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
          <>
            <div className="flex gap-1 text-sm">
              {(['client_secret', 'client_certificate'] as const).map(t => (
                <button key={t} type="button" onClick={() => setAzureAuthType(t)} className={`px-3 py-1.5 rounded-md ${azureAuthType === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                  {t === 'client_secret' ? 'Client Secret' : 'Client Certificate'}
                </button>
              ))}
            </div>
            {azureAuthType === 'client_secret' ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-slate-500 dark:text-slate-400">Client Secret</span>
                <input type="password" autoComplete="new-password" value={azureClientSecret} onChange={e => setAzureClientSecret(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" placeholder="The secret's Value, not its Secret ID" />
              </label>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Certificate (PEM)</span>
                  <textarea value={azureCertificatePem} onChange={e => setAzureCertificatePem(e.target.value)} rows={4} placeholder="-----BEGIN CERTIFICATE-----" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Private Key (PEM)</span>
                  <textarea value={azurePrivateKeyPem} onChange={e => setAzurePrivateKeyPem(e.target.value)} rows={4} placeholder="-----BEGIN PRIVATE KEY-----" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" />
                  <span className="text-[11px] text-slate-400">PKCS8 format ("BEGIN PRIVATE KEY") — convert with `openssl pkcs8 -topk8 -nocrypt` if needed.</span>
                </label>
              </>
            )}
            <span className="text-[11px] text-slate-400">Tenant ID and Client (application) ID can't be changed here — reconnect via "Add Cloud Account" if those need to change too.</span>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Access Key ID</span>
              <input autoComplete="username" value={accessKeyId} onChange={e => setAccessKeyId(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" placeholder="AKIA…" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-500 dark:text-slate-400">Secret Access Key</span>
              <input type="password" autoComplete="new-password" value={secretAccessKey} onChange={e => setSecretAccessKey(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono text-xs" />
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