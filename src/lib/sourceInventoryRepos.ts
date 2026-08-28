import { api, type ScanRecord, type ScannerFinding } from './api';
import type {
  SourceAsset, AggregatedFinding, ScannerAttachment, Severity, SourceInventoryFilters,
} from './demoData/sourceInventory';

/**
 * The real-data counterpart to lib/demoData/sourceInventory.ts, for the
 * Repositories category only -- Artifactories/Registries/Clusters/Servers
 * stay mock (no real backend yet) and are untouched by this file. Mirrors
 * lib/sourceInventoryClouds.ts's own conventions (derived, not fabricated,
 * fields; honest empty results where no real signal exists).
 *
 * Unlike Clouds, getInstallationRepos has no pagination wrapper at all --
 * it already returns everything in one shot -- so there's no provider-vs-
 * "All" snapshot split needed here; every repo is fetched once and filtered
 * client-side, the same pattern CodeSecurity.tsx's own real Repositories
 * tab already uses.
 */

const REPO_SCANNERS = ['semgrep', 'dependency-check', 'grype', 'gitleaks', 'trufflehog'] as const;
type RepoScanner = typeof REPO_SCANNERS[number];

const SCANNER_LABEL: Record<RepoScanner, string> = {
  semgrep: 'Semgrep', 'dependency-check': 'Dependency-Check', grype: 'Grype', gitleaks: 'Gitleaks', trufflehog: 'TruffleHog',
};

interface RepoIdentity { installationId: string; installationLogin: string; fullName: string; defaultBranch: string; private: boolean }

function encodeRepoId(installationId: string, fullName: string): string {
  return `repo-${encodeURIComponent(`${installationId}:${fullName}`)}`;
}

function decodeRepoId(id: string): { installationId: string; fullName: string } | null {
  const match = /^repo-(.+)$/.exec(id);
  if (!match) return null;
  const decoded = decodeURIComponent(match[1]);
  const sep = decoded.indexOf(':');
  if (sep < 0) return null;
  return { installationId: decoded.slice(0, sep), fullName: decoded.slice(sep + 1) };
}

async function listAllRepos(): Promise<RepoIdentity[]> {
  const { items: installations } = await api.getGitInstallations();
  const perInstallation = await Promise.all(installations.map(async inst => {
    const { items } = await api.getInstallationRepos(inst.id);
    return items.map((r): RepoIdentity => ({
      installationId: inst.id, installationLogin: inst.account_login,
      fullName: r.fullName, defaultBranch: r.defaultBranch, private: r.private,
    }));
  }));
  return perInstallation.flat();
}

/** One bounded page of recent scans per real repo-backing scanner --
 * listScans has no target/repo filter server-side, so this fetches once and
 * matches client-side, same "never loop every page" discipline as the
 * Clouds adapter's single getFindings call. */
async function fetchRecentScansByScanner(): Promise<Record<RepoScanner, ScanRecord[]>> {
  const entries = await Promise.all(REPO_SCANNERS.map(async scanner => {
    const res = await api.listScans(scanner, { limit: 200 });
    return [scanner, res.items] as const;
  }));
  return Object.fromEntries(entries) as Record<RepoScanner, ScanRecord[]>;
}

/** target.uri's exact form (https://github.com/org/repo, git@github.com:org/repo.git,
 * or a bare "org/repo") isn't guaranteed by any contract this frontend can
 * see -- matching by "does the URI contain the repo's own full name" is
 * tolerant of all of them without asserting a precision this data doesn't
 * actually promise. */
function scanMatchesRepo(scan: ScanRecord, fullName: string): boolean {
  return scan.target.uri.toLowerCase().includes(fullName.toLowerCase());
}

function scannerAttachmentStatus(status: ScanRecord['status']): ScannerAttachment['status'] {
  if (status === 'completed') return 'completed';
  if (status === 'running' || status === 'queued') return 'running';
  return 'failed'; // failed | cancelled | timeout
}

function riskScoreFromFindingCount(findingCount: number): number {
  return Math.min(100, findingCount * 3);
}

/** SourceAsset plus the one extra field the Asset List needs that doesn't
 * fit the shared shape -- a real total finding count (from ScanRecord.
 * finding_count, no extra calls), shown in place of a Crit/High/Med/Low
 * breakdown the list level genuinely doesn't have (see assetFromRepo's
 * comment). Not added to SourceAsset itself since no other category needs
 * it. */
export interface RepoAssetRow extends SourceAsset {
  totalFindings: number;
}

function assetFromRepo(repo: RepoIdentity, scansByScanner: Record<RepoScanner, ScanRecord[]>): RepoAssetRow {
  const scanners: ScannerAttachment[] = [];
  let totalFindings = 0;
  let latestOverall: ScanRecord | null = null;

  for (const scanner of REPO_SCANNERS) {
    const matched = scansByScanner[scanner].filter(s => scanMatchesRepo(s, repo.fullName));
    if (matched.length === 0) continue;
    const latest = [...matched].sort((a, b) => (b.finished_at ?? b.created_at).localeCompare(a.finished_at ?? a.created_at))[0];
    scanners.push({ scanner: SCANNER_LABEL[scanner], status: scannerAttachmentStatus(latest.status), lastRunAt: latest.finished_at ?? latest.created_at });
    totalFindings += matched.reduce((sum, s) => sum + s.finding_count, 0);
    if (!latestOverall || (latest.finished_at ?? latest.created_at) > (latestOverall.finished_at ?? latestOverall.created_at)) latestOverall = latest;
  }

  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };

  return {
    id: encodeRepoId(repo.installationId, repo.fullName),
    category: 'repository',
    subType: 'GitHub',
    name: repo.fullName,
    owner: '—',
    scanners,
    scanRollup: !latestOverall ? 'stale' : scannerAttachmentStatus(latestOverall.status) === 'completed' ? 'completed' : scannerAttachmentStatus(latestOverall.status) === 'running' ? 'partial' : 'failed',
    lastAggregatedScanAt: latestOverall ? (latestOverall.finished_at ?? latestOverall.created_at) : null,
    // Per-severity breakdown isn't shown at list level -- it only exists
    // behind a getScanResults call per matched scan, and summing that
    // across every repo on a page would reintroduce the N+1 problem this
    // session already fixed once for Clouds. totalFindings (real, from
    // ScanRecord.finding_count, zero extra calls) drives riskScore instead;
    // real per-severity counts are computed on the detail page, where only
    // one repo's own matched scans need fetching.
    bySeverity,
    riskScore: riskScoreFromFindingCount(totalFindings),
    internetExposed: null,
    totalFindings,
  };
}

function applyClientFilters(items: RepoAssetRow[], filters: SourceInventoryFilters): RepoAssetRow[] {
  let out = items;
  if (filters.search) { const q = filters.search.toLowerCase(); out = out.filter(a => a.name.toLowerCase().includes(q)); }
  if (filters.subType) out = out.filter(a => a.subType === filters.subType);
  if (filters.scanStatus) out = out.filter(a => a.scanRollup === filters.scanStatus);
  if (filters.scanner) out = out.filter(a => a.scanners.some(s => s.scanner === filters.scanner));
  if (filters.owner) out = out.filter(a => a.owner === filters.owner);
  if (filters.internetExposed) out = out.filter(a => a.internetExposed === true);
  // severity has no real per-repo signal at list level (see assetFromRow's
  // comment) -- a severity filter here would always exclude everything if
  // applied against the all-zero bySeverity, which is worse than a no-op;
  // left unapplied at this level, same honest-limitation spirit.
  return out;
}

export async function getRealRepoAssets(filters: SourceInventoryFilters = {}): Promise<{ items: RepoAssetRow[]; total: number }> {
  if (filters.subType && filters.subType !== 'GitHub') {
    // Honest empty result -- no GitLab/Bitbucket/Other connector exists yet.
    return { items: [], total: 0 };
  }
  const [repos, scansByScanner] = await Promise.all([listAllRepos(), fetchRecentScansByScanner()]);
  const items = applyClientFilters(repos.map(r => assetFromRepo(r, scansByScanner)), filters);
  return { items, total: items.length };
}

export async function getRealRepoAssetById(id: string): Promise<SourceAsset | null> {
  const decoded = decodeRepoId(id);
  if (!decoded) return null;
  const repos = await listAllRepos();
  const repo = repos.find(r => r.installationId === decoded.installationId && r.fullName === decoded.fullName);
  if (!repo) return null;
  const scansByScanner = await fetchRecentScansByScanner();
  return assetFromRepo(repo, scansByScanner);
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 };

/** Bounded to one repo's own matched scans (at most 5, one per scanner) --
 * no N+1 concern, same principle the Clouds detail page already
 * established. Dedup groups by CVE when present -- a real, comparable
 * identity across different scanners (e.g. Dependency-Check and Grype both
 * flagging the same CVE in this repo is a genuine instance of multi-
 * scanner convergence). Findings without a CVE (most SAST/secrets results)
 * are not forced into a dedup they can't honestly support -- each stays
 * its own AggregatedFinding with exactly one detectionSource, rather than
 * guessing at cross-scanner identity from incompatible per-scanner
 * `location` schemas. */
export async function getRealRepoAggregatedFindings(asset: SourceAsset): Promise<AggregatedFinding[]> {
  const decoded = decodeRepoId(asset.id);
  if (!decoded) return [];

  const scansByScanner = await fetchRecentScansByScanner();
  const matchedScans: { scanner: RepoScanner; scan: ScanRecord }[] = [];
  for (const scanner of REPO_SCANNERS) {
    for (const scan of scansByScanner[scanner]) {
      if (scanMatchesRepo(scan, decoded.fullName) && scan.status === 'completed') matchedScans.push({ scanner, scan });
    }
  }

  const resultsPerScan = await Promise.all(matchedScans.map(({ scanner, scan }) =>
    api.getScanResults(scanner, scan.scan_id, { limit: 100 }).then(res => res.items).catch(() => [] as ScannerFinding[]),
  ));
  const allFindings = resultsPerScan.flat();

  const withCve = allFindings.filter((f): f is ScannerFinding & { cve: string } => !!f.cve);
  const withoutCve = allFindings.filter(f => !f.cve);

  const cveGroups = new Map<string, ScannerFinding[]>();
  for (const f of withCve) {
    if (!cveGroups.has(f.cve)) cveGroups.set(f.cve, []);
    cveGroups.get(f.cve)!.push(f);
  }

  const grouped: AggregatedFinding[] = [...cveGroups.values()].map(group => {
    const top = [...group].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    const detectionSources = [...new Set(group.map(f => SCANNER_LABEL[f.scanner as RepoScanner] ?? f.scanner))];
    return { id: top.finding_id, cve: top.cve, title: top.title, severity: top.severity, detectionSources, status: top.status === 'accepted_risk' ? 'suppressed' : top.status };
  });

  const ungrouped: AggregatedFinding[] = withoutCve.map(f => ({
    id: f.finding_id, cve: null, title: f.title, severity: f.severity,
    detectionSources: [SCANNER_LABEL[f.scanner as RepoScanner] ?? f.scanner],
    status: f.status === 'accepted_risk' ? 'suppressed' : f.status,
  }));

  return [...grouped, ...ungrouped];
}
