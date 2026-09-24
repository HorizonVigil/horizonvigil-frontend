import { useEffect, useState } from 'react';
import { Badge } from '../Badge';
import { api } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

interface Props {
  connections: UnifiedAccountRow[];
}

/**
 * Each count carries whether the read that produced it failed, so a zero can
 * be reported as "nothing recorded" or "could not be read" rather than both
 * collapsing into the same sentence.
 */
interface ScanCountState {
  repo: number;
  repoFailed: boolean;
  container: number;
  containerFailed: boolean;
  urlApi: number;
  urlApiFailed: boolean;
}

interface RepoCountState {
  value: number;
  /** Installations whose repository list could not be read. */
  unreadable: number;
  /** The installation list itself could not be read. */
  failed: boolean;
}

interface ClusterInventoryState {
  pods: number;
  nodes: number;
  failed: boolean;
}

/**
 * Each of these keeps three outcomes apart that a single "0" cannot:
 * still loading, read successfully and empty, and could not be read.
 */
function describeRepositories(
  repos: RepoCountState | null,
  scans: ScanCountState | null,
): string {
  if (repos === null) return 'Loading…';
  if (repos.failed) return 'Connected repositories could not be read';

  const scanText =
    scans === null
      ? 'scan totals loading'
      : scans.repoFailed
        ? 'scan totals could not be read'
        : `${scans.repo} SAST/SCA/Secrets scans recorded`;

  if (repos.unreadable > 0) {
    return `at least ${repos.value} connected · ${repos.unreadable} installation(s) could not be read · ${scanText}`;
  }

  return repos.value === 0
    ? 'No repositories connected'
    : `${repos.value} connected · ${scanText}`;
}

function describeScans(
  scans: ScanCountState | null,
  key: 'container' | 'urlApi',
  scanner: string,
): string {
  if (scans === null) return 'Loading…';

  const failed = key === 'container' ? scans.containerFailed : scans.urlApiFailed;
  if (failed) return `${scanner} scan history could not be read`;

  const count = scans[key];
  return count > 0 ? `${count} ${scanner} scans recorded` : `No ${scanner} scans recorded yet`;
}

function describeCluster(cluster: ClusterInventoryState | null): string {
  if (cluster === null) return 'Loading…';
  if (cluster.failed) return 'Cluster inventory could not be read';

  return cluster.pods > 0
    ? `${cluster.pods} pods / ${cluster.nodes} nodes discovered live — no vulnerability scanner connected yet`
    : 'No cluster connected';
}

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
  const [repoCount, setRepoCount] = useState<RepoCountState | null>(null);
  const [scanCounts, setScanCounts] = useState<ScanCountState | null>(null);
  const [clusterInventory, setClusterInventory] = useState<ClusterInventoryState | null>(null);

  useEffect(() => {
    let cancelled = false;
    /*
     * Every count here used to fall back to 0 on failure -- a per-installation
     * `.catch(() => ({ items: [] }))`, a `setRepoCount(0)` on a total failure,
     * and a `: 0` for each rejected scan/cluster query. The panel then said
     * "No repositories connected" and "No Trivy scans recorded yet" for an
     * estate whose APIs simply could not be read.
     *
     * A read that failed is tracked separately from a read that returned
     * nothing, so the row can say which happened.
     */
    void api.getGitInstallations().then(async ({ items: installations }) => {
      const repoLists = await Promise.allSettled(installations.map(inst => api.getInstallationRepos(inst.id)));
      if (cancelled) return;

      const unreadable = repoLists.filter(r => r.status === 'rejected').length;
      const counted = repoLists.reduce(
        (sum, r) => (r.status === 'fulfilled' ? sum + r.value.items.length : sum),
        0,
      );

      setRepoCount({ value: counted, unreadable, failed: false });
    }).catch(() => {
      if (!cancelled) setRepoCount({ value: 0, unreadable: 0, failed: true });
    });

    void Promise.allSettled([
      api.listScans('semgrep', { limit: 1 }), api.listScans('gitleaks', { limit: 1 }), api.listScans('trufflehog', { limit: 1 }),
      api.listScans('dependency-check', { limit: 1 }), api.listScans('grype', { limit: 1 }),
      api.listScans('trivy', { limit: 1 }),
      api.listScans('nuclei', { limit: 1 }),
    ]).then(results => {
      if (cancelled) return;
      const total = (idx: number) => (results[idx].status === 'fulfilled' ? (results[idx] as PromiseFulfilledResult<{ total: number }>).value.total : 0);
      const failed = (...idx: number[]) => idx.some(i => results[i].status === 'rejected');

      setScanCounts({
        repo: total(0) + total(1) + total(2) + total(3) + total(4),
        repoFailed: failed(0, 1, 2, 3, 4),
        container: total(5),
        containerFailed: failed(5),
        urlApi: total(6),
        urlApiFailed: failed(6),
      });
    });

    void Promise.allSettled([api.getEksPods({ limit: 1 }), api.getGkePods({ limit: 1 }), api.getEksNodes({ limit: 1 })]).then(results => {
      if (cancelled) return;
      const total = (r: PromiseSettledResult<{ pagination: { total: number } }>) => (r.status === 'fulfilled' ? r.value.pagination.total : 0);

      setClusterInventory({
        pods: total(results[0]) + total(results[1]),
        nodes: total(results[2]),
        failed: results.some(r => r.status === 'rejected'),
      });
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
    { label: 'Repositories', body: <span className="text-xs text-slate-500 dark:text-slate-400">{describeRepositories(repoCount, scanCounts)}</span> },
    { label: 'Container Images', body: <span className="text-xs text-slate-500 dark:text-slate-400">{describeScans(scanCounts, 'container', 'Trivy')}</span> },
    { label: 'URL & API', body: <span className="text-xs text-slate-500 dark:text-slate-400">{describeScans(scanCounts, 'urlApi', 'Nuclei')}</span> },
    { label: 'Server & VM', body: <Badge tone="neutral">No scanner connected</Badge> },
    { label: 'Cluster & Runtime', body: <span className="text-xs text-slate-500 dark:text-slate-400">{describeCluster(clusterInventory)}</span> },
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
