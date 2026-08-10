import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Donut } from '../components/charts/Donut';
import { useTabParam } from '../lib/useTabParam';
import { useSync, useSyncCompletion } from '../lib/syncContext';
import { useToast } from '../lib/toast';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { useConfirm } from '../components/ConfirmDialog';
import { Icon } from '../components/icons';
import {
  api, ApiError,
  type CloudConnection, type CloudResource, type CostSnapshot,
  type PermissionCheckResult, type ValidationRun, type CostRecommendation, type ActivityEntry, type Favorite,
  type RemediationActionType,
} from '../lib/api';

/** Which of the six supported remediation actions (if any) this resource is currently eligible for, from cached inventory — the authoritative check happens live against AWS at dry-run time. */
function eligibleRemediationAction(r: CloudResource): RemediationActionType | null {
  if (r.resource_type_key === 'ec2_instance') {
    if (r.state === 'running') return 'stop_instance';
    if (r.state === 'stopped') return 'start_instance';
    return null;
  }
  if (r.resource_type_key === 'elastic_ip') {
    return (r.relationships?.instanceId || r.relationships?.networkInterfaceId) ? null : 'release_eip';
  }
  if (r.resource_type_key === 'ebs_volume') {
    const attached = (r.relationships?.attachedInstanceIds as unknown[] | undefined ?? []).filter(Boolean);
    return attached.length > 0 ? null : 'delete_volume';
  }
  if (r.resource_type_key === 'ebs_snapshot') {
    return r.state === 'completed' ? 'delete_snapshot' : null;
  }
  if (r.resource_type_key === 'ec2_ami') {
    return r.state === 'available' ? 'deregister_ami' : null;
  }
  return null;
}

const ACTION_LABEL: Record<RemediationActionType, string> = {
  stop_instance: 'Stop instance', start_instance: 'Start instance', release_eip: 'Release Elastic IP', delete_volume: 'Delete volume',
  delete_snapshot: 'Delete snapshot', deregister_ami: 'Deregister AMI', resize_instance: 'Resize instance',
};

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

const TABS = ['Overview', 'Resources', 'Cost', 'Permissions', 'Regions', 'Sync History', 'Recommendations', 'Activity'] as const;
type Tab = typeof TABS[number];

type AccountCredentials = {
  connectionMethod: string; maskedAccessKey: string | null; keyRotatedAt: string | null;
  rotationDueInDays: number | null; roleArn: string | null; externalId: string | null;
};

export function AwsAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { syncStates, startSync, startDiscovery } = useSync();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [remediating, setRemediating] = useState<string | null>(null);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Overview');
  const [connection, setConnection] = useState<CloudConnection | null>(null);
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [costSnapshots, setCostSnapshots] = useState<CostSnapshot[]>([]);
  const [credentials, setCredentials] = useState<AccountCredentials | null>(null);

  // Tab-specific data
  const [accountCost, setAccountCost] = useState<{ monthToDate: number; byService: Record<string, number> } | null>(null);
  const [syncingCost, setSyncingCost] = useState(false);
  const [curSyncing, setCurSyncing] = useState(false);
  const [curProgress, setCurProgress] = useState('');
  const [permissionRun, setPermissionRun] = useState<ValidationRun | null>(null);
  const [permissionChecks, setPermissionChecks] = useState<PermissionCheckResult[]>([]);
  const [validating, setValidating] = useState(false);
  const [regions, setRegions] = useState<{ region: string; isDefault: boolean; resourceCount: number; lastScan: string | null }[]>([]);
  const [syncRuns, setSyncRuns] = useState<ValidationRun[]>([]);
  const [recommendations, setRecommendations] = useState<CostRecommendation[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [resourceSearch, setResourceSearch] = useState('');
  const [resourceCategory, setResourceCategory] = useState('');
  const [resourceRegion, setResourceRegion] = useState('');
  const [resourceStatus, setResourceStatus] = useState('');
  const [favorite, setFavorite] = useState<Favorite | null>(null);

  useEffect(() => {
    if (!id) return;
    void api.getFavorites().then(r => setFavorite(r.favorites.find(f => f.path === `/cloud-accounts/${id}`) ?? null));
  }, [id]);

  async function toggleFavorite() {
    if (!id || !connection) return;
    const name = connection.connection_name ?? connection.aws_account_id;
    if (favorite) {
      await api.removeFavorite(favorite.id);
      setFavorite(null);
      toast(`Removed "${name}" from Favorites`, 'success');
    } else {
      const { favorite: created } = await api.addFavorite({ type: 'aws-account', label: name, path: `/cloud-accounts/${id}` });
      setFavorite(created);
      toast(`Added "${name}" to Favorites — see it on Overview`, 'success');
    }
  }

  const load = useCallback(async () => {
    if (!id) return;
    const [conn, resourcesRes, costRes, creds] = await Promise.all([
      api.getAccount(id),
      api.getResourceInventory({ connectionId: id, limit: 200 }),
      api.getCostExplorer({ connectionId: id, limit: 200 }),
      api.getAccountCredentials(id),
    ]);
    setConnection(conn);
    setResources(resourcesRes.items);
    setCostSnapshots(costRes.items);
    setCredentials(creds);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  // Test-connection state keeps running in the background (see syncContext.tsx)
  // even if you navigate away mid-request — this refreshes once it finishes,
  // whether that happens while you're sitting on this page or you come back later.
  useSyncCompletion(id ? [id] : [], load);

  const loadPermissions = useCallback(async () => {
    if (!id) return;
    const res = await api.getAccountPermissions(id);
    setPermissionRun(res.run);
    setPermissionChecks(res.checks);
  }, [id]);

  // Each secondary tab's data is only fetched once you actually open it.
  useEffect(() => {
    if (!id) return;
    if (tab === 'Cost') void api.getAccountCost(id).then(setAccountCost);
    else if (tab === 'Permissions') void loadPermissions();
    else if (tab === 'Regions') void api.getAccountRegions(id).then(r => setRegions(r.regions));
    else if (tab === 'Sync History') void api.getAccountSyncHistory(id).then(r => setSyncRuns(r.runs));
    else if (tab === 'Recommendations') void api.getAccountRecommendations(id).then(r => setRecommendations(r.recommendations));
    else if (tab === 'Activity') void api.getAccountActivity(id, { limit: 100 }).then(r => setActivity(r.items));
  }, [tab, id, loadPermissions]);

  async function syncCost() {
    if (!id) return;
    setSyncingCost(true);
    try {
      const result = await api.syncAccountCost(id);
      toast(result.synced > 0 ? `Synced ${result.synced} cost line item${result.synced === 1 ? '' : 's'} from AWS` : 'Synced — no cost data found for this account this month', 'success');
      setAccountCost(await api.getAccountCost(id));
      void api.detectCostAnomalies(id).catch(() => {});
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Cost sync failed', 'error');
    } finally {
      setSyncingCost(false);
    }
  }

  async function syncCur() {
    if (!id) return;
    setCurSyncing(true);
    try {
      setCurProgress('Finding your Cost & Usage Report…');
      await api.discoverCur(id);
      setCurProgress('Fetching this month\'s manifest…');
      const { reportKeys } = await api.getCurManifest(id);
      if (reportKeys.length === 0) {
        toast('CUR report found, but no data files are published yet for this billing period.', 'error');
        return;
      }
      for (let i = 0; i < reportKeys.length; i++) {
        let skipRows = 0;
        let done = false;
        while (!done) {
          setCurProgress(`Ingesting file ${i + 1} of ${reportKeys.length} — ${skipRows.toLocaleString()} rows so far…`);
          const result = await api.ingestCurStep(id, reportKeys[i], skipRows);
          skipRows = result.rowsProcessed;
          done = result.done;
        }
      }
      await api.finalizeCur(id);
      toast('Cost & Usage Report synced — Cost Allocation, Chargeback, and Showback now have real per-resource data.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Cost & Usage Report sync failed', 'error');
    } finally {
      setCurSyncing(false);
      setCurProgress('');
    }
  }

  async function runValidation() {
    if (!id) return;
    setValidating(true);
    try {
      const result = await api.validateAccountPermissions(id);
      toast(result.status === 'succeeded' ? 'Validated — identity confirmed' : 'Validation failed', result.status === 'succeeded' ? 'success' : 'error');
      await loadPermissions();
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Validation failed', 'error');
    } finally {
      setValidating(false);
    }
  }

  async function requestRemediation(r: CloudResource, actionType: RemediationActionType) {
    if (!id) return;
    const ok = await confirm(
      `Request "${ACTION_LABEL[actionType]}" for ${r.resource_name ?? r.resource_id}? This goes through an approval + dry-run before anything actually runs against AWS — nothing happens immediately.`,
    );
    if (!ok) return;
    setRemediating(r.id);
    try {
      await api.requestRemediation({ connectionId: id, resourceId: r.id, actionType });
      toast('Remediation requested — an admin needs to approve it in Automation → Remediation before it runs.', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not request remediation', 'error');
    } finally {
      setRemediating(null);
    }
  }

  // These must run unconditionally on every render, before the `!connection`
  // early return below — calling useMemo only after that guard meant it ran
  // zero times while loading and four times once `connection` populated,
  // violating React's Rules of Hooks and crashing the whole render tree
  // (a blank/black page on every account detail visit, prod included).
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

  const iamCounts = {
    users: resources.filter(r => r.resource_type_key === 'iam_user').length,
    roles: resources.filter(r => r.resource_type_key === 'iam_role').length,
    policies: resources.filter(r => r.resource_type_key === 'iam_policy').length,
  };
  const categoryCounts: Record<string, number> = {};
  for (const r of resources) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;

  const totalCost = costSnapshots.reduce((sum, c) => sum + Number(c.unblended_cost), 0);
  const costByService: Record<string, number> = {};
  for (const c of costSnapshots) costByService[c.service] = (costByService[c.service] ?? 0) + Number(c.unblended_cost);
  const topServices = Object.entries(costByService).sort(([, a], [, b]) => b - a).slice(0, 5);

  return (
    <div>
      <FilterBar title={connection.connection_name ?? connection.aws_account_id} breadcrumb={<Link to="/cloud-accounts" className="text-xs text-slate-400 hover:underline">← Cloud Accounts</Link>} showAccountFilter={false} />

      <div className="flex items-center gap-2 mb-4">
        <Badge>{connection.status}</Badge>
        <Badge tone="neutral">{connection.environment}</Badge>
        <span className="text-xs text-slate-400 font-mono">{connection.aws_account_id}</span>
        <div className="flex-1" />
        <button onClick={() => void toggleFavorite()} title={favorite ? 'Remove from Favorites' : 'Add to Favorites — pins this account on the Overview page'} className="text-amber-400 hover:text-amber-500 px-1">
          <Icon name={favorite ? 'star-filled' : 'star'} size={18} />
        </button>
        <button onClick={() => id && startSync(id)} disabled={syncing} title="Confirms stored credentials are present and well-formed — not a live AWS check" className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          {syncing ? 'Working…' : 'Test Connection'}
        </button>
        <button onClick={() => id && startDiscovery(id)} disabled={syncing} title="Scans this account's regions for resources across 30+ AWS services, plus real GuardDuty, Security Hub, and IAM Access Analyzer findings (see Vulnerability Management) — real AWS API calls" className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          {syncing ? 'Working…' : 'Discover Resources'}
        </button>
        <button onClick={() => void runValidation()} disabled={validating} title="Runs real sts:GetCallerIdentity + IAM/Organizations/CloudWatch/CloudTrail/Tagging/Cost Explorer permission checks" className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1.5 disabled:opacity-50">
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
            <StatCard label="IAM Users / Roles / Policies" value={`${iamCounts.users} / ${iamCounts.roles} / ${iamCounts.policies}`} />
            <StatCard label="Last Sync" value={connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleDateString() : 'Never'} />
            <StatCard label="Cost (Explorer, loaded range)" value={money(totalCost)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Breakdown</h3>
              <Donut data={Object.entries(categoryCounts).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(resources.length), caption: 'resources' }} />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Credentials</h3>
              <div className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Method</span><span className="text-slate-800 dark:text-slate-100">{(credentials?.connectionMethod ?? connection.connection_method) === 'cross_account_role' ? 'Cross-account role' : 'Access key'}</span></div>
                {credentials?.maskedAccessKey && (
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Access Key</span><span className="font-mono text-slate-800 dark:text-slate-100">{credentials.maskedAccessKey}</span></div>
                )}
                {(credentials?.roleArn ?? connection.role_arn) && (
                  <div className="flex justify-between gap-2"><span className="text-slate-500 dark:text-slate-400 shrink-0">Role ARN</span><span className="font-mono text-xs text-slate-800 dark:text-slate-100 truncate">{credentials?.roleArn ?? connection.role_arn}</span></div>
                )}
                <div className="flex justify-between gap-2"><span className="text-slate-500 dark:text-slate-400 shrink-0">Regions Scanned</span><span className="text-xs text-slate-800 dark:text-slate-100 text-right">{connection.scan_regions?.length ? connection.scan_regions.join(', ') : connection.default_region}</span></div>
                {credentials?.rotationDueInDays != null && (
                  <div className={`rounded-md px-2.5 py-1.5 text-xs mt-2 ${credentials.rotationDueInDays < 0 ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                    {credentials.rotationDueInDays < 0 ? `Key rotation overdue by ${Math.abs(credentials.rotationDueInDays)} days` : `Next key rotation due in ${credentials.rotationDueInDays} days`}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost (Cost Explorer)</h3>
              {costSnapshots.length > 0 ? (
                <div className="text-sm space-y-2">
                  <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Total (loaded range)</span><span className="text-slate-800 dark:text-slate-100 font-medium">{money(totalCost)}</span></div>
                  <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                    {topServices.map(([service, cost]) => (
                      <li key={service} className="flex justify-between py-1.5 text-xs">
                        <span className="text-slate-600 dark:text-slate-300">{service}</span>
                        <span className="text-slate-800 dark:text-slate-100 tabular-nums">{money(cost)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-slate-400">Service/region-level cost from Cost Explorer, not per-resource.</p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No cost data yet for this account.</p>
              )}
            </div>
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
                  const action = eligibleRemediationAction(r);
                  return (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200 cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}>{r.resource_name ?? r.resource_id}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}>{r.resource_type_key}</td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}><Badge tone="neutral">{r.category}</Badge></td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400 cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}>{r.region ?? '—'}</td>
                      <td className="px-3 py-2 cursor-pointer" onClick={() => navigate(`/resources/all?resource=${r.id}`)}><Badge>{r.status}</Badge></td>
                      <td className="px-3 py-2 text-xs">
                        {action && (
                          <button onClick={e => { e.stopPropagation(); void requestRemediation(r, action); }} disabled={remediating === r.id} title="Requests approval to run this action for real against AWS — nothing happens until an admin approves and executes it." className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50">
                            {remediating === r.id ? 'Requesting…' : ACTION_LABEL[action]}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredResources.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">{resources.length === 0 ? 'No resources discovered for this account yet.' : 'No resources match these filters.'}</td></tr>
                )}
              </tbody>
            </table>
            {resources.length >= 200 && (
              <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-800">
                <button onClick={() => navigate(`/resources/all?account=${connection.id}`)} className="text-xs text-brand-600 dark:text-brand-400 hover:underline">View all resources for this account →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'Cost' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end items-center gap-2">
            {curProgress && <span className="text-xs text-slate-400">{curProgress}</span>}
            <button onClick={() => void syncCur()} disabled={curSyncing} title="Discovers your AWS Cost & Usage Report (with resource IDs) and ingests it — real per-resource cost, powers Cost Allocation/Chargeback/Showback on the Cost Management page. Requires a CUR report set up in AWS Billing Console with 'Include resource IDs' checked." className="text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
              {curSyncing ? 'Syncing…' : 'Sync Cost & Usage Report'}
            </button>
            <button onClick={() => void syncCost()} disabled={syncingCost} title="Pulls real month-to-date cost from AWS Cost Explorer (ce:GetCostAndUsage) using this account's own credentials" className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-2.5 py-1.5">
              {syncingCost ? 'Syncing…' : 'Sync Cost from AWS'}
            </button>
          </div>
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
                {(!accountCost || Object.keys(accountCost.byService).length === 0) && <li className="py-1.5 text-sm text-slate-400">No cost data synced yet — click "Sync Cost from AWS" above.</li>}
              </ul>
            </div>
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
                {permissionRun.identity_arn && <span className="font-mono">{permissionRun.identity_arn}</span>}
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
                {!check.verified && <span className="text-slate-400 text-xs" title="This check's exact AWS API shape hasn't been confirmed against a live account yet">unverified</span>}
              </div>
            ))}
            {permissionChecks.length === 0 && <p className="text-sm text-slate-400">No permission checks recorded yet.</p>}
          </div>
        </div>
      )}

      {tab === 'Regions' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2">Default</th>
                <th className="px-3 py-2 text-right">Resources</th>
                <th className="px-3 py-2">Last Scan</th>
              </tr>
            </thead>
            <tbody>
              {regions.map(r => (
                <tr key={r.region} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-mono text-xs">{r.region}</td>
                  <td className="px-3 py-2">{r.isDefault && <Badge tone="neutral">Default</Badge>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{r.resourceCount.toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{r.lastScan ? new Date(r.lastScan).toLocaleString() : 'Never'}</td>
                </tr>
              ))}
              {regions.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">No regions enabled for this account.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Sync History' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
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
                  <td className="px-3 py-2"><Badge tone={run.status === 'succeeded' ? 'good' : run.status === 'running' ? 'warning' : 'critical'}>{run.status}</Badge></td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{run.identity_arn ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{new Date(run.started_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{run.triggered_by ?? '—'}</td>
                  <td className="px-3 py-2 text-red-500 text-xs">{run.error_message ?? '—'}</td>
                </tr>
              ))}
              {syncRuns.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">No validation runs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'Recommendations' && (
        <div className="flex flex-col gap-2">
          {recommendations.map(rec => (
            <div key={rec.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={rec.priority === 'high' ? 'critical' : rec.priority === 'medium' ? 'warning' : 'good'}>{rec.priority}</Badge>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{rec.issue}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{rec.recommended_action}</p>
              </div>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{money(rec.potential_monthly_savings)}/mo</span>
            </div>
          ))}
          {recommendations.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No open recommendations for this account.</p>}
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
            {activity.length === 0 && <li className="px-3 py-8 text-center text-slate-400 text-sm">No activity recorded for this account yet.</li>}
          </ul>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
