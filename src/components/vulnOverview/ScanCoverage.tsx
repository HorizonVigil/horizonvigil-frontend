import { useEffect, useState } from 'react';
import { Badge } from '../Badge';
import { api } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

interface Props {
  connections: UnifiedAccountRow[];
}

interface ScanCountState { repo: number; container: number; urlApi: number }

/**
 * Never a fabricated scanned/total fraction -- real descriptive text per
 * category instead, per this page's "Not Scanned vs Scan Failed vs Scan
 * Stale vs no vulnerabilities" governing rule. Cloud is the one category
 * with enough real per-connection state (status + last_sync_at) to hit all
 * four buckets honestly; the others describe what real data does exist
 * (connected repos, scans recorded) without inventing a coverage percentage
 * nothing in the schema actually tracks.
 */
export function ScanCoverage({ connections }: Props) {
  const [repoCount, setRepoCount] = useState<number | null>(null);
  const [scanCounts, setScanCounts] = useState<ScanCountState>({ repo: 0, container: 0, urlApi: 0 });
  const [clusterInventory, setClusterInventory] = useState<{ pods: number; nodes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getGitInstallations().then(async ({ items: installations }) => {
      const repoLists = await Promise.all(installations.map(inst => api.getInstallationRepos(inst.id).catch(() => ({ items: [] }))));
      if (!cancelled) setRepoCount(repoLists.reduce((sum, r) => sum + r.items.length, 0));
    }).catch(() => { if (!cancelled) setRepoCount(0); });

    void Promise.allSettled([
      api.listScans('semgrep', { limit: 1 }), api.listScans('gitleaks', { limit: 1 }), api.listScans('trufflehog', { limit: 1 }),
      api.listScans('dependency-check', { limit: 1 }), api.listScans('grype', { limit: 1 }),
      api.listScans('trivy', { limit: 1 }),
      api.listScans('nuclei', { limit: 1 }),
    ]).then(results => {
      if (cancelled) return;
      const total = (idx: number) => (results[idx].status === 'fulfilled' ? (results[idx] as PromiseFulfilledResult<{ total: number }>).value.total : 0);
      setScanCounts({
        repo: total(0) + total(1) + total(2) + total(3) + total(4),
        container: total(5),
        urlApi: total(6),
      });
    });

    void Promise.allSettled([api.getEksPods({ limit: 1 }), api.getGkePods({ limit: 1 }), api.getEksNodes({ limit: 1 })]).then(results => {
      if (cancelled) return;
      const total = (r: PromiseSettledResult<{ pagination: { total: number } }>) => (r.status === 'fulfilled' ? r.value.pagination.total : 0);
      setClusterInventory({ pods: total(results[0]) + total(results[1]), nodes: total(results[2]) });
    });

    return () => { cancelled = true; };
  }, []);

  const cloudConns = connections.filter(c => ['aws', 'gcp', 'azure'].includes(c.provider));
  const now = Date.now();
  const notScanned = cloudConns.filter(c => !c.lastSync).length;
  const scanFailed = cloudConns.filter(c => c.status === 'error').length;
  const scanStale = cloudConns.filter(c => c.lastSync && c.status !== 'error' && now - new Date(c.lastSync).getTime() > STALE_MS).length;
  const healthy = cloudConns.length - notScanned - scanFailed - scanStale;

  const rows: Array<{ label: string; body: React.ReactNode }> = [
    {
      label: 'Cloud',
      body: cloudConns.length === 0 ? <Badge tone="neutral">Not connected</Badge> : (
        <div className="flex flex-wrap gap-1.5">
          {healthy > 0 && <Badge tone="good">{healthy} healthy</Badge>}
          {notScanned > 0 && <Badge tone="neutral">{notScanned} not scanned</Badge>}
          {scanStale > 0 && <Badge tone="warning">{scanStale} stale</Badge>}
          {scanFailed > 0 && <Badge tone="critical">{scanFailed} failed</Badge>}
        </div>
      ),
    },
    { label: 'Repositories', body: <span className="text-xs text-slate-500 dark:text-slate-400">{repoCount === null ? 'Loading…' : repoCount === 0 ? 'No repositories connected' : `${repoCount} connected · ${scanCounts.repo} SAST/SCA/Secrets scans recorded`}</span> },
    { label: 'Container Images', body: <span className="text-xs text-slate-500 dark:text-slate-400">{scanCounts.container > 0 ? `${scanCounts.container} Trivy scans recorded` : 'No Trivy scans recorded yet'}</span> },
    { label: 'URL & API', body: <span className="text-xs text-slate-500 dark:text-slate-400">{scanCounts.urlApi > 0 ? `${scanCounts.urlApi} Nuclei scans recorded` : 'No Nuclei scans recorded yet'}</span> },
    { label: 'Server & VM', body: <Badge tone="neutral">No scanner connected</Badge> },
    { label: 'Cluster & Runtime', body: <span className="text-xs text-slate-500 dark:text-slate-400">{clusterInventory === null ? 'Loading…' : clusterInventory.pods > 0 ? `${clusterInventory.pods} pods / ${clusterInventory.nodes} nodes discovered live — no vulnerability scanner connected yet` : 'No cluster connected'}</span> },
  ];

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Scan Coverage</h3>
      <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="text-slate-600 dark:text-slate-300 font-medium">{r.label}</span>
            {r.body}
          </li>
        ))}
      </ul>
    </div>
  );
}
