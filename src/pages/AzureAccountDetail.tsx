import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Donut } from '../components/charts/Donut';
import { ResourceFilterBar } from '../components/ResourceFilterBar';
import { EditAccountModal } from '../components/EditAccountModal';
import { AccountHealthTab } from '../components/cloudAccounts/AccountHealthTab';
import { AccessMatrix } from '../components/cloudAccounts/AccessMatrix';
import { useTabParam } from '../lib/useTabParam';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/icons';
import { useToast } from '../lib/toast';
import { api, ApiError, type AzureConnection, type CloudResource, type ValidationRun, type RecurringFailure, type PermissionCheckResult, type AzureIdentitySummary, type ActivityEntry } from '../lib/api';
import { money } from '../lib/format';
import { useResourceFilters } from '../lib/useResourceFilters';

const TABS = ['Overview', 'Health', 'Resources', 'Cost', 'Access', 'Permissions', 'Sync History', 'Activity'] as const;
type Tab = typeof TABS[number];

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string | null | undefined, fallback = 'Never'): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : DATE_TIME_FORMATTER.format(date);
}

export function AzureAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncStates, startDiscovery } = useSync();
  const { toast } = useToast();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [connection, setConnection] = useState<AzureConnection | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [accountCost, setAccountCost] = useState<{ monthToDate: number; byService: Record<string, number> } | null>(null);
  const [syncingCost, setSyncingCost] = useState(false);
  const [costSyncError, setCostSyncError] = useState<string | null>(null);
  const [permissionRun, setPermissionRun] = useState<ValidationRun | null>(null);
  const [permissionChecks, setPermissionChecks] = useState<PermissionCheckResult[]>([]);
  const [azureIdentity, setAzureIdentity] = useState<AzureIdentitySummary | null>(null);
  const [validating, setValidating] = useState(false);
  const [syncRuns, setSyncRuns] = useState<ValidationRun[]>([]);
  const [recurringFailures, setRecurringFailures] = useState<RecurringFailure[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const loadRequestRef = useRef(0);
  const tabRequestRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const load = useCallback(async () => {
    const accountId = id?.trim();

    if (!accountId) {
      setConnection(null);
      setResources([]);
      setLoadError('This Azure account URL is missing a subscription ID.');
      return;
    }

    const requestId = ++loadRequestRef.current;
    setLoadError(null);

    try {
      const [conn, resourcesRes] = await Promise.all([
        api.getAzureAccount(accountId),
        api.getResourceInventory({ connectionId: accountId, limit: 200 }),
      ]);

      if (requestId !== loadRequestRef.current) return;

      setConnection(conn);
      setResources(resourcesRes.items);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      setLoadError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load the Azure subscription.',
      );
    }
  }, [id]);


  useEffect(() => {
    setConnection(null);
    setResources([]);
    setAccountCost(null);
    setPermissionRun(null);
    setPermissionChecks([]);
    setAzureIdentity(null);
    setSyncRuns([]);
    setRecurringFailures([]);
    setActivity([]);
    setCostSyncError(null);
    setTabError(null);
    void load();
  }, [load, retryToken]);

  useSyncCompletion(id ? [id] : [], load);

  useEffect(() => {
    const accountId = id?.trim();
    if (!accountId || tab !== 'Cost') return;

    const requestId = ++tabRequestRef.current;
    setTabError(null);

    void api.getAzureAccountCost(accountId)
      .then(result => {
        if (requestId !== tabRequestRef.current) return;
        setAccountCost(result);
      })
      .catch(err => {
        if (requestId !== tabRequestRef.current) return;
        setTabError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load Azure cost data.',
        );
      });
  }, [tab, id, retryToken]);


  const loadPermissions = useCallback(async () => {
    const accountId = id?.trim();
    if (!accountId) return;

    const requestId = tabRequestRef.current;
    const res = await api.getAzureAccountPermissions(accountId);

    if (requestId !== tabRequestRef.current) return;

    setPermissionRun(res.run);
    setPermissionChecks(res.checks);
  }, [id]);


  useEffect(() => {
    if (!id || (tab !== 'Permissions' && tab !== 'Access')) return;

    const requestId = ++tabRequestRef.current;
    setTabError(null);

    void loadPermissions().catch(err => {
      if (requestId !== tabRequestRef.current) return;
      setTabError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load Azure permissions.',
      );
    });
  }, [tab, id, loadPermissions, retryToken]);

  useEffect(() => {
    const accountId = id?.trim();
    if (!accountId) return;

    if (tab !== 'Sync History' && tab !== 'Activity') return;

    const requestId = ++tabRequestRef.current;
    setTabError(null);

    const run = async () => {
      try {
        if (tab === 'Sync History') {
          const result = await api.getAzureAccountSyncHistory(accountId);
          if (requestId !== tabRequestRef.current) return;
          setSyncRuns(result.runs);
          setRecurringFailures(result.recurringFailures);
        } else {
          const result = await api.getAzureAccountActivity(accountId, { limit: 100 });
          if (requestId !== tabRequestRef.current) return;
          setActivity(result.items);
        }
      } catch (err) {
        if (requestId !== tabRequestRef.current) return;
        setTabError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : `Failed to load ${tab}.`,
        );
      }
    };

    void run();
  }, [tab, id, retryToken]);


  async function runValidation() {
    if (!id) return;
    setValidating(true);
    try {
      const result = await api.validateAzureAccountPermissions(id);
      setAzureIdentity(result.identity);
      toast(result.status === 'succeeded' ? 'Validated — identity confirmed' : 'Validation failed', result.status === 'succeeded' ? 'success' : 'error');
      await loadPermissions();
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Validation failed', 'error');
    } finally {
      setValidating(false);
    }
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of resources) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [resources]);

  const resourceFilters = useResourceFilters(resources);
  const filteredResources = resourceFilters.filtered;

  async function syncCost() {
    if (!id) return;
    setSyncingCost(true);
    setCostSyncError(null);
    try {
      const result = await api.syncAzureAccountCost(id);
      const message = result.synced > 0
        ? `Synced ${result.synced} cost line item${result.synced === 1 ? '' : 's'} from Azure`
        : 'Synced — no cost data found for this subscription this month';
      setCostSyncError(null);
      toast(message, 'success');
      setAccountCost(await api.getAzureAccountCost(id));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Cost sync failed';
      setCostSyncError(message);
      toast(message, 'error');
    } finally {
      setSyncingCost(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <FilterBar
          title="Unable to Load Azure Subscription"
          breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>}
          showAccountFilter={false}
          showRegionFilter={false}
          showDateFilter={false}
        />
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 p-5 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
          <button
            type="button"
            onClick={() => setRetryToken(token => token + 1)}
            className="text-sm rounded-md bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      </div>
    );
  }

  const sync = id ? syncStates[id] : undefined;
  const syncing = sync?.status === 'running';

  return (
    <div className="min-w-0">
      <FilterBar title={connection.connection_name ?? connection.azure_subscription_id} breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge>{connection.status}</Badge>
        <Badge tone="neutral">{connection.environment}</Badge>
        <span
          className="max-w-full truncate text-xs font-mono text-slate-400"
          title={connection.azure_subscription_id}
        >
          {connection.azure_subscription_id}
        </span>
        <div className="flex-1" />
        <button type="button" onClick={() => setEditOpen(true)} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
          Edit
        </button>
        <button type="button" onClick={() => id && startDiscovery(id, 'azureAccounts')} disabled={syncing} title="Scans this subscription for VMs, storage accounts, SQL/Cosmos DBs, AKS clusters, networking, Key Vault, and more" className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          {syncing ? 'Working…' : 'Discover Resources'}
        </button>
        <button type="button" onClick={() => void runValidation()} disabled={validating} title="Runs a real ARM Get Subscription identity check plus Virtual Machines/Storage/SQL/AKS/Key Vault/Role Assignments read probes" className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1.5 disabled:opacity-50">
          {validating ? 'Validating…' : 'Validate Permissions'}
        </button>
      </div>
      {sync?.status === 'running' && sync.total > 1 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 -mt-2">Scanning… step {sync.done + 1} of {sync.total} ({sync.stepId})</p>
      )}
      {sync?.status === 'done' && sync.warning && <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 -mt-2">{sync.warning}</p>}
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
      {tabError && (
        <div className="mb-4 -mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex items-center justify-between gap-3">
          <span>Couldn't load {tab}: {tabError}</span>
          <button
            type="button"
            onClick={() => setRetryToken(token => token + 1)}
            className="shrink-0 text-xs underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex gap-1 text-sm flex-wrap mb-5">
        {TABS.map(t => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 whitespace-nowrap text-sm transition-colors ${
              tab === t
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Total Resources" value={(connection.resource_summary?.totalResources ?? resources.length).toLocaleString()} />
            <StatCard label="Last Sync" value={connection.last_sync_at ? formatDate(connection.last_sync_at, 'Never').split(',')[0] : 'Never'} />
            <StatCard label="Auth Method" value="Service principal" />
            <StatCard label="Tenant" value={connection.azure_tenant_id} />
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Breakdown</h3>
            <Donut
              data={Object.entries(connection.resource_summary?.categoryCounts ?? categoryCounts).map(([label, value]) => ({ label, value, colorCategory: label }))}
              centerLabel={{ value: (connection.resource_summary?.totalResources ?? resources.length).toLocaleString(), caption: 'resources' }}
            />
          </div>
        </>
      )}

      {tab === 'Resources' && (
        <div className="flex flex-col gap-3">
          <ResourceFilterBar filters={resourceFilters} totalCount={resources.length} />

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {filteredResources.length === 0 ? (
              <EmptyState
                icon="box"
                title={resources.length === 0 ? 'No resources discovered for this subscription yet' : 'No resources match these filters'}
                description={resources.length === 0 ? 'Run Discover Resources above to scan this subscription.' : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.slice(0, 200).map(r => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                      role="link"
                      tabIndex={0}
                      onClick={() => navigate(`/resources/all?resource=${r.id}`)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/resources/all?resource=${r.id}`);
                        }
                      }}
                    >
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.resource_name ?? r.resource_id}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">{r.resource_type_key}</td>
                      <td className="px-3 py-2"><Badge tone="neutral">{r.category}</Badge></td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.region ?? '—'}</td>
                      <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
            {resources.length >= 200 && (
              <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                <button type="button" onClick={() => navigate(`/resources/all?account=${connection.id}`)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">View all resources for this subscription →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Cost' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => void syncCost()} disabled={syncingCost} title="Pulls real month-to-date cost from Azure Cost Management using this subscription's own credentials" className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-2.5 py-1.5">
              {syncingCost ? 'Syncing…' : 'Sync Cost from Azure'}
            </button>
          </div>
          {costSyncError && (
            <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {costSyncError}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Month to Date</h3>
              <div className="text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">{accountCost ? money(accountCost.monthToDate) : '—'}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">By Service</h3>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {Object.entries(accountCost?.byService ?? {}).sort(([, a], [, b]) => b - a).map(([service, cost]) => (
                  <li key={service} className="flex justify-between py-1.5 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{service}</span>
                    <span className="text-slate-800 dark:text-slate-100 tabular-nums">{money(cost)}</span>
                  </li>
                ))}
                {(!accountCost || Object.keys(accountCost.byService).length === 0) && <li className="py-1.5 text-sm text-slate-400">No cost data synced yet — click "Sync Cost from Azure" above.</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'Health' && id && <AccountHealthTab id={id} provider="azure" />}

      {tab === 'Access' && (
        <AccessMatrix checks={permissionChecks} lastCheckedAt={permissionRun?.finished_at ?? permissionRun?.started_at ?? null}
          onRevalidate={() => void runValidation()} revalidating={validating} />
      )}

      {tab === 'Permissions' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Latest Validation Run</h3>
              {permissionRun && <Badge tone={permissionRun.status === 'succeeded' ? 'good' : permissionRun.status === 'running' ? 'warning' : 'critical'}>{permissionRun.status}</Badge>}
            </div>
            {permissionRun ? (
              <div className="text-xs text-slate-400 flex flex-col gap-0.5">
                {(azureIdentity?.subscriptionName ?? permissionRun.identity_arn) && <span className="font-mono">{azureIdentity?.subscriptionName ?? permissionRun.identity_arn}</span>}
                <span>Started {formatDate(permissionRun.started_at, 'Unknown')}{permissionRun.finished_at ? ` · Finished ${formatDate(permissionRun.finished_at, 'Unknown')}` : ''}</span>
                {permissionRun.error_message && <span className="text-red-500">{permissionRun.error_message}</span>}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No validation run yet — click "Validate Permissions" above.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {permissionChecks.map(check => (
              <div key={check.service} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-2 text-sm" title={check.detail}>
                <span className={`h-2 w-2 rounded-full ${check.status === 'granted' ? 'bg-emerald-500' : check.status === 'not_applicable' ? 'bg-slate-400' : check.status === 'denied' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <span className="text-slate-700 dark:text-slate-200">{check.label}</span>
                {!check.verified && <span className="text-slate-400 text-xs" title="This check's exact Azure API shape hasn't been confirmed against a live subscription yet">unverified</span>}
              </div>
            ))}
            {permissionChecks.length === 0 && <p className="text-sm text-slate-400">No permission checks recorded yet.</p>}
          </div>
        </div>
      )}

      {tab === 'Sync History' && (
        <div className="flex flex-col gap-4">
          {recurringFailures.length > 0 && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-900/10 p-4">
              <h3 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">
                <Icon name="alert-triangle" size={14} />
                Recurring Failures
              </h3>
              <p className="text-xs text-amber-700 dark:text-amber-400 mb-3">
                These steps have failed consistently across recent runs. Each run below still shows "succeeded" overall — a small, stable failure rate doesn't flip the whole run to an error state — but a step failing this often is worth a closer look.
              </p>
              <ul className="flex flex-col divide-y divide-amber-100 dark:divide-amber-900/40">
                {recurringFailures.map(f => (
                  <li key={f.step} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="font-mono text-xs text-amber-900 dark:text-amber-200">{f.step}</span>
                    <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0">{f.failureCount} of last {f.runsChecked} runs</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Identity</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Finished</th>
                <th className="px-3 py-2">Triggered By</th>
                <th className="px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {syncRuns.map(run => (
                <tr key={run.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{run.run_type === 'discovery' ? 'Discover Resources' : 'Permission Check'}</td>
                  <td className="px-3 py-2"><Badge tone={run.status === 'succeeded' ? 'good' : run.status === 'running' ? 'warning' : 'critical'}>{run.status}</Badge></td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{run.identity_arn ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{formatDate(run.started_at, 'Unknown')}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{run.finished_at ? formatDate(run.finished_at, 'Unknown') : '—'}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{run.triggered_by ?? '—'}</td>
                  <td className="px-3 py-2 text-red-500 text-xs">{run.error_message ?? '—'}</td>
                </tr>
              ))}
              {syncRuns.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">No sync activity yet.</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === 'Activity' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {activity.map(entry => (
              <li key={entry.id} className="px-3 py-2.5 flex justify-between text-sm">
                <span className="text-slate-700 dark:text-slate-200">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')} <span className="text-slate-400">by {entry.actor?.email ?? 'system'}</span></span>
                <span className="text-xs text-slate-400 shrink-0">{formatDate(entry.occurredAt, 'Unknown')}</span>
              </li>
            ))}
            {activity.length === 0 && <li className="px-3 py-8 text-center text-slate-400 text-sm">No activity recorded for this subscription yet.</li>}
          </ul>
        </div>
      )}
      {connection && (
        <EditAccountModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          connectionName={connection.connection_name ?? connection.azure_subscription_id}
          environment={connection.environment}
          showRegion={false}
          showSupportPlan={false}
          onSave={async fields => {
            if (!id) return;
            await api.updateAzureAccount(id, {
              connectionName: fields.connectionName,
              environment: fields.environment,
            });
            await load();
            toast('Account updated.', 'success');
          }}
        />
      )}
    </div>
  );
}