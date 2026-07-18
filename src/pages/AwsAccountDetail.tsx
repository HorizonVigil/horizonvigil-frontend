import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { Badge } from '../components/Badge';
import { Donut } from '../components/charts/Donut';
import { api, type CloudConnection, type CloudResource } from '../lib/api';

export function AwsAccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [connection, setConnection] = useState<CloudConnection | null>(null);
  const [resources, setResources] = useState<CloudResource[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ connections }, { resources: res }] = await Promise.all([
      api.getConnections(),
      api.getResources({ connectionId: id, limit: 1000 }),
    ]);
    setConnection(connections.find(c => c.id === id) ?? null);
    setResources(res);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (!connection) return <div className="text-sm text-slate-400">Loading…</div>;

  const iamCounts = {
    users: resources.filter(r => r.resourceTypeKey === 'iam_user').length,
    roles: resources.filter(r => r.resourceTypeKey === 'iam_role').length,
    policies: resources.filter(r => r.resourceTypeKey === 'iam_policy').length,
  };
  const categoryCounts: Record<string, number> = {};
  for (const r of resources) categoryCounts[r.category] = (categoryCounts[r.category] ?? 0) + 1;

  const rotationDue = connection.keyRotationDueAt ? new Date(connection.keyRotationDueAt) : null;
  const rotationOverdue = rotationDue ? rotationDue.getTime() < Date.now() : false;

  async function runAction(action: 'sync' | 'test') {
    if (!id) return;
    setBusy(action);
    setTestResult(null);
    setSyncError(null);
    try {
      if (action === 'sync') {
        // One scanner per request — see discovery.ts for why a single
        // do-everything request gets silently killed on Cloudflare's free tier.
        await api.runDiscoverySteps(id, (done, total) => setProgress({ done, total }));
        await api.syncConnectionCost(id).catch(() => {});
        await api.generateRecommendations(id).catch(() => {});
        await load();
      } else {
        const result = await api.testConnection(id);
        setTestResult(result.detail);
      }
    } catch (err) {
      setSyncError((err as Error).message || 'Sync failed.');
      await load();
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  return (
    <div>
      <FilterBar title={connection.connectionName ?? connection.awsAccountId} breadcrumb={<Link to="/aws-accounts" className="text-xs text-slate-400 hover:underline">← AWS Accounts</Link>} />

      <div className="flex items-center gap-2 mb-5">
        <Badge>{connection.status}</Badge>
        <Badge tone="neutral">{connection.environment}</Badge>
        <span className="text-xs text-slate-400 font-mono">{connection.awsAccountId}</span>
        <div className="flex-1" />
        <button onClick={() => void runAction('test')} disabled={!!busy} className="text-xs rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
          {busy === 'test' ? 'Testing…' : 'Re-authenticate / Test'}
        </button>
        <button onClick={() => void runAction('sync')} disabled={!!busy} className="text-xs rounded-md bg-brand-600 hover:bg-brand-700 text-white px-2.5 py-1.5 disabled:opacity-50">
          {busy === 'sync' ? (progress ? `Scanning ${progress.done}/${progress.total}…` : 'Starting…') : 'Sync Now'}
        </button>
      </div>
      {testResult && <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 -mt-3">{testResult}</p>}
      {syncError && (
        <div className="mb-4 -mt-2 rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300 flex justify-between items-center">
          <span>{syncError}</span>
          <button onClick={() => setSyncError(null)} className="text-red-400 hover:text-red-600 ml-3">×</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Resources" value={resources.length.toLocaleString()} />
        <StatCard label="IAM Users / Roles / Policies" value={`${iamCounts.users} / ${iamCounts.roles} / ${iamCounts.policies}`} />
        <StatCard label="Last Sync" value={connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleDateString() : 'Never'} />
        <StatCard label="Services Scanned" value={connection.resourceSummary?.servicesTotal ?? '—'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Breakdown</h3>
          <Donut data={Object.entries(categoryCounts).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(resources.length), caption: 'resources' }} />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Credentials</h3>
          <div className="text-sm space-y-2">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Method</span><span className="text-slate-800 dark:text-slate-100">{connection.connectionMethod === 'cross_account_role' ? 'Cross-account role' : 'Access key'}</span></div>
            {connection.maskedAccessKey && (
              <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Access Key</span><span className="font-mono text-slate-800 dark:text-slate-100">{connection.maskedAccessKey}</span></div>
            )}
            {connection.roleArn && (
              <div className="flex justify-between gap-2"><span className="text-slate-500 dark:text-slate-400 shrink-0">Role ARN</span><span className="font-mono text-xs text-slate-800 dark:text-slate-100 truncate">{connection.roleArn}</span></div>
            )}
            {rotationDue && (
              <div className={`rounded-md px-2.5 py-1.5 text-xs mt-2 ${rotationOverdue ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                {rotationOverdue ? 'Key rotation overdue — ' : 'Next rotation due '}{rotationDue.toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {connection.resourceSummary?.errors && connection.resourceSummary.errors.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 p-4 mb-5">
          <h3 className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">Scan Warnings</h3>
          <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside space-y-0.5">
            {connection.resourceSummary.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <button onClick={() => navigate('/resources')} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">View all resources for this account →</button>
    </div>
  );
}
