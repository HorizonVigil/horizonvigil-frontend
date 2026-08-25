import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Donut } from '../components/charts/Donut';
import { useTabParam } from '../lib/useTabParam';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Icon } from '../components/icons';
import { useToast } from '../lib/toast';
import { useConfirm } from '../components/ConfirmDialog';
import { api, ApiError, type GcpConnection, type CloudResource, type ValidationRun, type RecurringFailure, type PermissionCheckResult, type GcpIdentitySummary, type ActivityEntry } from '../lib/api';

const TABS = ['Overview', 'Resources', 'Permissions', 'Sync History', 'Activity'] as const;
type Tab = typeof TABS[number];

/** GCP Compute Engine's own status values (RUNNING/TERMINATED/...), not AWS's lowercase 'running'/'stopped' — see gcp-accounts-api's scanners/compute.ts, which stores GCP's status verbatim. Only stop/start are wired yet (see gcpRemediation.ts's doc comment on why setMachineType/disk-delete equivalents of AWS's resize/delete_volume aren't built in this pass). */
function eligibleGcpRemediationAction(r: CloudResource): 'stop_instance' | 'start_instance' | null {
  if (r.resource_type_key !== 'gcp_compute_instance') return null;
  if (r.state === 'RUNNING') return 'stop_instance';
  if (r.state === 'TERMINATED') return 'start_instance';
  return null;
}
const GCP_ACTION_LABEL: Record<'stop_instance' | 'start_instance', string> = { stop_instance: 'Stop instance', start_instance: 'Start instance' };

/**
 * Five tabs — still not a full mirror of AwsAccountDetail.tsx's eight (Cost
 * and Recommendations have no GCP backend yet), but Sync History and
 * Activity now do: both reuse connection_validation_runs/audit_log, the
 * same tables AWS already wrote to, just via routes GCP's discovery.ts and
 * permissions.ts didn't call yet. Permissions is real too (routes/
 * permissions.ts — oauth2 tokeninfo identity check plus Compute/Cloud SQL/
 * GKE/Cloud Functions/Pub/Sub/IAM/Resource Manager read probes), mirroring
 * AwsAccountDetail.tsx's tab exactly except for GcpIdentitySummary's
 * email+scopes shape instead of an ARN. The Resources tab reuses the
 * existing provider-agnostic api.getResourceInventory (cloud_resources has
 * no AWS-specific columns), same as AwsAccountDetail.tsx does.
 *
 * All hooks (including the two useMemo below) run unconditionally before
 * the `!connection` early return — see the exact bug this avoids, found
 * and fixed in AwsAccountDetail.tsx this session.
 */
export function GcpProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncStates, startDiscovery } = useSync();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [connection, setConnection] = useState<GcpConnection | null>(null);
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceCategory, setResourceCategory] = useState('');
  const [resourceRegion, setResourceRegion] = useState('');
  const [resourceStatus, setResourceStatus] = useState('');
  const [remediating, setRemediating] = useState<string | null>(null);
  const [permissionRun, setPermissionRun] = useState<ValidationRun | null>(null);
  const [permissionChecks, setPermissionChecks] = useState<PermissionCheckResult[]>([]);
  const [gcpIdentity, setGcpIdentity] = useState<GcpIdentitySummary | null>(null);
  const [validating, setValidating] = useState(false);
  const [syncRuns, setSyncRuns] = useState<ValidationRun[]>([]);
  const [recurringFailures, setRecurringFailures] = useState<RecurringFailure[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const [conn, resourcesRes] = await Promise.all([
      api.getGcpAccount(id),
      api.getResourceInventory({ connectionId: id, limit: 200 }),
    ]);
    setConnection(conn);
    setResources(resourcesRes.items);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useSyncCompletion(id ? [id] : [], load);

  const loadPermissions = useCallback(async () => {
    if (!id) return;
    const res = await api.getGcpProjectPermissions(id);
    setPermissionRun(res.run);
    setPermissionChecks(res.checks);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (tab === 'Permissions') void loadPermissions();
    else if (tab === 'Sync History') void api.getGcpAccountSyncHistory(id).then(r => { setSyncRuns(r.runs); setRecurringFailures(r.recurringFailures); });
    else if (tab === 'Activity') void api.getGcpAccountActivity(id, { limit: 100 }).then(r => setActivity(r.items));
  }, [tab, id, loadPermissions]);

  async function runValidation() {
    if (!id) return;
    setValidating(true);
    try {
      const result = await api.validateGcpProjectPermissions(id);
      setGcpIdentity(result.identity);
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

  const resourceCategories = useMemo(() => Array.from(new Set(resources.map(r => r.category))).sort(), [resources]);
  const resourceRegions = useMemo(() => Array.from(new Set(resources.map(r => r.region).filter((r): r is string => !!r))).sort(), [resources]);
  const resourceStatuses = useMemo(() => Array.from(new Set(resources.map(r => r.status))).sort(), [resources]);
  const filteredResources = useMemo(() => resources.filter(r => {
    if (resourceCategory && r.category !== resourceCategory) return false;
    if (resourceRegion && r.region !== resourceRegion) return false;
    if (resourceStatus && r.status !== resourceStatus) return false;
    if (resourceSearch) {
      const q = resourceSearch.toLowerCase();
      if (!(r.resource_name ?? r.resource_id).toLowerCase().includes(q) && !r.resource_type_key.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [resources, resourceCategory, resourceRegion, resourceStatus, resourceSearch]);

  async function requestGcpRemediation(r: CloudResource, actionType: 'stop_instance' | 'start_instance') {
    if (!id) return;
    const ok = await confirm(
      `Request "${GCP_ACTION_LABEL[actionType]}" for ${r.resource_name ?? r.resource_id}? This goes through an approval + dry-run before anything actually runs against GCP — nothing happens immediately.`,
    );
    if (!ok) return;
    setRemediating(r.id);
    try {
      await api.requestGcpRemediation({ connectionId: id, resourceId: r.id, actionType });
      toast('Remediation requested — an admin needs to approve it in Automation → Remediation before it runs.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not request remediation', 'error');
    } finally {
      setRemediating(null);
    }
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
    <div>
      <FilterBar title={connection.connection_name ?? connection.gcp_project_id} breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>} showAccountFilter={false} />

      <div className="flex items-center gap-2 mb-4">
        <Badge>{connection.status}</Badge>
        <Badge tone="neutral">{connection.environment}</Badge>
        <span className="text-xs text-slate-400 font-mono">{connection.gcp_project_id}</span>
        <div className="flex-1" />
        <button onClick={() => id && startDiscovery(id, 'gcpAccounts')} disabled={syncing} title="Scans this project for Compute Engine instances, Cloud Storage buckets, Cloud SQL instances, and GKE clusters" className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          {syncing ? 'Working…' : 'Discover Resources'}
        </button>
        <button onClick={() => void runValidation()} disabled={validating} title="Runs a real oauth2 identity check plus Compute Engine/Cloud SQL/GKE/Cloud Functions/Pub/Sub/IAM/Resource Manager read probes" className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1.5 disabled:opacity-50">
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

      <div className="flex gap-1 text-sm flex-wrap mb-5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-md whitespace-nowrap ${tab === t ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Total Resources" value={(connection.resource_summary?.totalResources ?? resources.length).toLocaleString()} />
            <StatCard label="Last Sync" value={connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleDateString() : 'Never'} />
            <StatCard label="Auth Method" value={connection.connection_method === 'service_account_impersonation' ? 'Impersonation' : 'Service account key'} />
            <StatCard label="Default Region" value={connection.default_region} />
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
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Search</span>
              <input value={resourceSearch} onChange={e => setResourceSearch(e.target.value)} placeholder="Name or type…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-52" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Category</span>
              <select value={resourceCategory} onChange={e => setResourceCategory(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${resourceCategory ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Categories</option>
                {resourceCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Region</span>
              <select value={resourceRegion} onChange={e => setResourceRegion(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${resourceRegion ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Regions</option>
                {resourceRegions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Status</span>
              <select value={resourceStatus} onChange={e => setResourceStatus(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${resourceStatus ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <option value="">All Statuses</option>
                {resourceStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            {(resourceSearch || resourceCategory || resourceRegion || resourceStatus) && (
              <button onClick={() => { setResourceSearch(''); setResourceCategory(''); setResourceRegion(''); setResourceStatus(''); }} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
            )}
            <span className="text-xs text-slate-400 pb-2 ml-auto">{filteredResources.length.toLocaleString()} of {resources.length.toLocaleString()} loaded</span>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {filteredResources.length === 0 ? (
              <EmptyState
                icon="box"
                title={resources.length === 0 ? 'No resources discovered for this project yet' : 'No resources match these filters'}
                description={resources.length === 0 ? 'Run Discover Resources above to scan this project.' : undefined}
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResources.slice(0, 200).map(r => {
                    const action = eligibleGcpRemediationAction(r);
                    return (
                      <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{r.resource_name ?? r.resource_id}</td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">{r.resource_type_key}</td>
                        <td className="px-3 py-2"><Badge tone="neutral">{r.category}</Badge></td>
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.region ?? '—'}</td>
                        <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
                        <td className="px-3 py-2 text-xs">
                          {action && (
                            <button onClick={e => { e.stopPropagation(); void requestGcpRemediation(r, action); }} disabled={remediating === r.id} title="Requests approval to run this action for real against GCP — nothing happens until an admin approves and executes it." className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">
                              {remediating === r.id ? 'Requesting…' : GCP_ACTION_LABEL[action]}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {resources.length >= 200 && (
              <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                <button onClick={() => navigate(`/resources/all?account=${connection.id}`)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">View all resources for this project →</button>
              </div>
            )}
          </div>
        </div>
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
                {(gcpIdentity?.email ?? permissionRun.identity_arn) && <span className="font-mono">{gcpIdentity?.email ?? permissionRun.identity_arn}</span>}
                <span>Started {new Date(permissionRun.started_at).toLocaleString()}{permissionRun.finished_at ? ` · Finished ${new Date(permissionRun.finished_at).toLocaleString()}` : ''}</span>
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
                {!check.verified && <span className="text-slate-400 text-xs" title="This check's exact GCP API shape hasn't been confirmed against a live project yet">unverified</span>}
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
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
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
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{new Date(run.started_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}</td>
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
                <span className="text-xs text-slate-400 shrink-0">{new Date(entry.occurredAt).toLocaleString()}</span>
              </li>
            ))}
            {activity.length === 0 && <li className="px-3 py-8 text-center text-slate-400 text-sm">No activity recorded for this project yet.</li>}
          </ul>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
