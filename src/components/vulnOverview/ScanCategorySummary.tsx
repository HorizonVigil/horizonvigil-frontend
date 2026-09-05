import { useEffect, useState } from 'react';
import { Badge } from '../Badge';
import { Icon, type IconName } from '../icons';
import { api, type VulnerabilityDashboard } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';

// Which finding_source keys (dashboard.bySource) belong to each category --
// mirrors the exact spelling in VulnerabilityFinding['finding_source'].
// Server & VM has no sources at all (no scanner exists); Cluster & Runtime
// has no *vulnerability* sources -- its "open findings" is intentionally
// left undefined below and paired with real live pod/node inventory instead.
const CLOUD_SOURCES = ['aws_config', 'iam_access_analyzer', 'iam_access_analyzer_unused', 'security_hub', 'guardduty', 'inspector', 'trusted_advisor', 'gcp_scc', 'defender', 'scanner_prowler'];
const REPO_SOURCES = ['scanner_semgrep', 'scanner_gitleaks', 'scanner_trufflehog', 'scanner_dependency_check', 'scanner_grype'];
const URL_API_SOURCES = ['scanner_nuclei'];
const CONTAINER_SOURCES = ['trivy', 'scanner_trivy'];

// Scanner-platform scan-history keys behind each scanner-backed category --
// same source-of-truth listScans() calls KpiRow uses for Total Scans, just
// grouped per category here instead of summed across all of them.
const REPO_SCANNERS = ['semgrep', 'gitleaks', 'trufflehog', 'dependency-check', 'grype'] as const;
const URL_API_SCANNERS = ['nuclei'] as const;
const CONTAINER_SCANNERS = ['trivy'] as const;

interface CategoryDef {
  key: string;
  label: string;
  icon: IconName;
  to: string;
  ctaLabel: string;
  sources?: string[];
  scanners?: readonly string[];
}

const CATEGORIES: CategoryDef[] = [
  { key: 'cloud', label: 'Cloud Scans', icon: 'cloud', to: '/cloud-security?tab=Overview', ctaLabel: 'View Cloud Findings', sources: CLOUD_SOURCES },
  { key: 'repository', label: 'Repository Scans', icon: 'git-branch', to: '/code-security?tab=Overview', ctaLabel: 'Open Repository Scans', sources: REPO_SOURCES, scanners: REPO_SCANNERS },
  { key: 'url-api', label: 'URL & API Scans', icon: 'globe', to: '/application-security?tab=Overview', ctaLabel: 'Open URL & API Scans', sources: URL_API_SOURCES, scanners: URL_API_SCANNERS },
  // The literal '&' in this tab name has to be percent-encoded here (%26) --
  // unlike a raw space (fine as-is, see the other `to` targets and
  // securityWidgets.tsx's ExposuresKpi precedent), an unencoded '&' IS the
  // query-string delimiter, so it would silently truncate `tab` to "Docker "
  // and land on this page's default tab instead.
  { key: 'container', label: 'Container Image Scans', icon: 'package', to: '/container-security?tab=Docker %26 Container Images', ctaLabel: 'Open Container Scans', sources: CONTAINER_SOURCES, scanners: CONTAINER_SCANNERS },
  { key: 'server-vm', label: 'Server & VM Scans', icon: 'server', to: '/infrastructure-security', ctaLabel: 'View Status' },
  { key: 'cluster-runtime', label: 'Cluster & Runtime Scans', icon: 'layers', to: '/container-security?tab=Kubernetes Security', ctaLabel: 'View Live Inventory' },
];

interface ScannerStat { count: number; lastScan: string | null }

interface Props {
  dashboard: VulnerabilityDashboard | null;
  connections: UnifiedAccountRow[];
  navigate: (path: string) => void;
}

function sumSources(dashboard: VulnerabilityDashboard | null, sources: string[]): number {
  if (!dashboard) return 0;
  return dashboard.bySource.filter(s => sources.includes(s.source)).reduce((sum, s) => sum + s.count, 0);
}

/**
 * The one component that actually delivers the spec's "6 simple scan
 * categories" framing -- nothing in this app renders navConfig.ts's groups
 * as a visible sidebar, so this card grid IS the user-facing surface (see
 * navConfig.ts's own comment on the Scan Categories group for why).
 */
export function ScanCategorySummary({ dashboard, connections, navigate }: Props) {
  const [scannerStats, setScannerStats] = useState<Record<string, ScannerStat>>({});
  const [reachable, setReachable] = useState<Record<string, boolean>>({});
  const [clusterPods, setClusterPods] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const allScanners = Array.from(new Set(CATEGORIES.flatMap(c => c.scanners ?? [])));
    void Promise.allSettled(allScanners.map(s => api.listScans(s, { limit: 1 }))).then(results => {
      if (cancelled) return;
      setScannerStats(Object.fromEntries(allScanners.map((s, i) => {
        const r = results[i];
        return [s, r.status === 'fulfilled' ? { count: r.value.total, lastScan: r.value.items[0]?.finished_at ?? null } : { count: 0, lastScan: null }];
      })));
    });
    void api.getScannerStatuses().then(res => { if (!cancelled) setReachable(Object.fromEntries(res.scanners.map(s => [s.scanner, s.reachable]))); });
    void Promise.allSettled([api.getEksPods({ limit: 1 }), api.getGkePods({ limit: 1 })]).then(results => {
      if (cancelled) return;
      setClusterPods(results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.pagination.total : 0), 0));
    });
    return () => { cancelled = true; };
  }, []);

  const cloudConns = connections.filter(c => ['aws', 'gcp', 'azure'].includes(c.provider));
  const cloudConnected = cloudConns.filter(c => c.status === 'connected').length;
  const cloudLastSync = cloudConns.reduce<string | null>((latest, c) => (!c.lastSync ? latest : (!latest || c.lastSync > latest ? c.lastSync : latest)), null);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {CATEGORIES.map(cat => {
        const isCloud = cat.key === 'cloud';
        const isServerVm = cat.key === 'server-vm';
        const isClusterRuntime = cat.key === 'cluster-runtime';
        const openFindings = cat.sources ? sumSources(dashboard, cat.sources) : null;
        const scannerEntries = (cat.scanners ?? []).map(s => scannerStats[s]).filter((s): s is ScannerStat => !!s);
        const scanCount = cat.scanners ? scannerEntries.reduce((sum, s) => sum + s.count, 0) : null;
        const lastScan = isCloud ? cloudLastSync : scannerEntries.reduce<string | null>((latest, s) => (!s.lastScan ? latest : (!latest || s.lastScan > latest ? s.lastScan : latest)), null);
        const anyReachable = (cat.scanners ?? []).some(s => reachable[s]);
        const status: 'healthy' | 'unhealthy' | 'none' | 'unknown' = isServerVm
          ? 'none'
          : isClusterRuntime
          ? (clusterPods ? 'unknown' : 'none')
          : isCloud
          ? (cloudConns.length === 0 ? 'none' : cloudConnected === cloudConns.length ? 'healthy' : 'unhealthy')
          : (cat.scanners ?? []).length === 0
          ? 'unknown'
          : anyReachable ? 'healthy' : 'unhealthy';

        return (
          <div key={cat.key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <Icon name={cat.icon} size={15} className="text-slate-400" />
                {cat.label}
              </span>
              <Badge tone={status === 'healthy' ? 'good' : status === 'unhealthy' ? 'critical' : status === 'none' ? 'neutral' : 'neutral'}>
                {status === 'healthy' ? 'Healthy' : status === 'unhealthy' ? 'Issues' : status === 'none' ? 'Not connected' : 'Unknown'}
              </Badge>
            </div>

            {isServerVm ? (
              <p className="text-xs text-slate-400">No scanner connected for servers/VMs — 0 hosts have ever been scanned.</p>
            ) : isClusterRuntime ? (
              <p className="text-xs text-slate-400">
                {clusterPods === null ? 'Loading live cluster inventory…' : clusterPods > 0 ? `${clusterPods.toLocaleString()} pods discovered live via EKS/GKE — no vulnerability scanner connected yet.` : 'No cluster connected — connect an EKS or GKE cluster to see live inventory here.'}
              </p>
            ) : (
              <>
                <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {openFindings === null ? '—' : openFindings.toLocaleString()}
                  <span className="text-xs font-normal text-slate-400 ml-1.5">open findings</span>
                </div>
                <p className="text-xs text-slate-400">
                  {isCloud
                    ? (cloudConns.length === 0 ? 'No cloud accounts connected' : `${cloudConnected} / ${cloudConns.length} connections synced${lastScan ? ` · last ${new Date(lastScan).toLocaleDateString()}` : ''}`)
                    : (scanCount ? `${scanCount} scans recorded${lastScan ? ` · last ${new Date(lastScan).toLocaleDateString()}` : ''}` : 'No scans recorded yet')}
                </p>
              </>
            )}

            <button type="button" onClick={() => navigate(cat.to)} className="mt-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline text-left">
              {cat.ctaLabel} →
            </button>
          </div>
        );
      })}
    </div>
  );
}
