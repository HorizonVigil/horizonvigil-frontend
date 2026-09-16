import { api, type ScanRecord, type ScannerFinding } from './api';
import {
  toUnifiedAzureRow,
  toUnifiedGcpRow,
  toUnifiedRow,
  type UnifiedAccountRow,
} from './unifiedAccounts';
import type {
  AggregatedFinding,
  ScannerAttachment,
  Severity,
  SourceAsset,
  SourceInventoryFilters,
} from './demoData/sourceInventory';

/**
 * Real-data implementation for the Source Inventory "Repositories" category.
 *
 * Current certified scope:
 * - GitHub installations/repositories from the deployed Git integration API.
 * - Recent persisted scan records for Semgrep, Dependency-Check, Grype,
 *   Gitleaks, and TruffleHog.
 * - Detailed findings from one repository's matched completed scans.
 *
 * Artifactories/Registries/Clusters/Servers remain outside this adapter.
 * GitLab/Bitbucket are not fabricated as supported providers.
 *
 * Important bounded-read contract:
 * - getGitInstallations()/getInstallationRepos() is the current real API
 *   contract and returns its repository collection in one request per
 *   installation.
 * - Scan history is bounded to a fixed recent window per scanner.
 * - Repository detail reuses that bounded scan window, then fetches result
 *   pages only for the matched completed scans for that single repository.
 *
 * This module is not an authorization boundary. Backend/API scope and tenant
 * authorization remain authoritative.
 */

const REPO_SCANNERS = [
  'semgrep',
  'dependency-check',
  'grype',
  'gitleaks',
  'trufflehog',
] as const;

type RepoScanner = (typeof REPO_SCANNERS)[number];

const SCANNER_LABEL: Readonly<Record<RepoScanner, string>> = Object.freeze({
  semgrep: 'Semgrep',
  'dependency-check': 'Dependency-Check',
  grype: 'Grype',
  gitleaks: 'Gitleaks',
  trufflehog: 'TruffleHog',
});

interface RepoIdentity {
  installationId: string;
  installationLogin: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

const RECENT_SCANS_LIMIT = 200;
const DETAIL_RESULTS_LIMIT = 100;

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Stable, reversible repository ID.
 *
 * encodeURIComponent protects repository/installation values from colliding
 * with our separator and from producing malformed URLs.
 */
function encodeRepoId(
  installationId: string,
  fullName: string,
): string {
  return `repo-${encodeURIComponent(
    `${installationId}:${fullName}`,
  )}`;
}

function decodeRepoId(
  id: string,
): { installationId: string; fullName: string } | null {
  if (typeof id !== 'string') return null;

  const match = /^repo-(.+)$/.exec(id.trim());
  if (!match) return null;

  let decoded: string;

  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  const separator = decoded.indexOf(':');

  if (separator < 1 || separator === decoded.length - 1) {
    return null;
  }

  const installationId = decoded.slice(0, separator).trim();
  const fullName = decoded.slice(separator + 1).trim();

  if (!installationId || !fullName) return null;

  return {
    installationId,
    fullName,
  };
}

async function listAllRepos(): Promise<RepoIdentity[]> {
  const { items: installations } = await api.getGitInstallations();

  if (!Array.isArray(installations) || installations.length === 0) {
    return [];
  }

  const perInstallation = await Promise.all(
    installations
      .filter(
        (installation) =>
          typeof installation?.id === 'string' &&
          installation.id.trim().length > 0,
      )
      .map(async (installation) => {
        const { items } = await api.getInstallationRepos(
          installation.id,
        );

        if (!Array.isArray(items)) return [];

        return items
          .filter(
            (repo) =>
              typeof repo?.fullName === 'string' &&
              repo.fullName.trim().length > 0,
          )
          .map(
            (repo): RepoIdentity => ({
              installationId: installation.id,
              installationLogin:
                typeof installation.account_login === 'string'
                  ? installation.account_login
                  : '',
              fullName: repo.fullName.trim(),
              defaultBranch:
                typeof repo.defaultBranch === 'string'
                  ? repo.defaultBranch.trim()
                  : '',
              private: repo.private === true,
            }),
          );
      }),
  );

  const deduped = new Map<string, RepoIdentity>();

  for (const repo of perInstallation.flat()) {
    const key = `${repo.installationId}:${repo.fullName}`;

    if (!deduped.has(key)) {
      deduped.set(key, repo);
    }
  }

  return [...deduped.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  );
}

async function fetchRecentScansByScanner(): Promise<
  Record<RepoScanner, ScanRecord[]>
> {
  const entries = await Promise.all(
    REPO_SCANNERS.map(async (scanner) => {
      const response = await api.listScans(scanner, {
        limit: RECENT_SCANS_LIMIT,
      });

      const items = Array.isArray(response.items)
        ? response.items
        : [];

      return [
        scanner,
        items.filter((scan) => {
          return (
            typeof scan?.scan_id === 'string' &&
            scan.scan_id.trim().length > 0 &&
            scan?.target?.uri
          );
        }),
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    RepoScanner,
    ScanRecord[]
  >;
}

/**
 * `target.uri` does not have a documented canonical representation in this
 * client. It may be HTTPS, SSH, or a bare "org/repo", so exact parsing would
 * invent a stronger contract than the frontend has.
 *
 * Boundary-aware matching is still preferable to a raw substring match:
 * it prevents "org/repository" from matching "org/repository-old".
 */
function scanMatchesRepo(
  scan: ScanRecord,
  fullName: string,
): boolean {
  const uri = normalizeString(scan.target?.uri);
  const target = normalizeString(fullName);

  if (!uri || !target) return false;

  const normalizedUri = uri.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedUri === normalizedTarget) return true;

  const suffixes = [
    `/${normalizedTarget}`,
    `:${normalizedTarget}.git`,
    `/${normalizedTarget}.git`,
    normalizedTarget.endsWith('.git')
      ? `:${normalizedTarget}`
      : `:${normalizedTarget}.git`,
  ];

  return suffixes.some((suffix) =>
    normalizedUri.endsWith(suffix),
  );
}

function scanTimestamp(
  scan: ScanRecord,
): string | null {
  const candidate = scan.finished_at ?? scan.created_at;

  if (typeof candidate !== 'string' || candidate.trim() === '') {
    return null;
  }

  const parsed = Date.parse(candidate);

  return Number.isNaN(parsed) ? null : candidate;
}

function scannerAttachmentStatus(
  status: ScanRecord['status'],
): ScannerAttachment['status'] {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'running':
    case 'queued':
      return 'running';
    default:
      return 'failed';
  }
}

function riskScoreFromFindingCount(
  findingCount: number,
): number {
  if (!Number.isFinite(findingCount) || findingCount <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, findingCount * 3));
}

export interface RepoAssetRow extends SourceAsset {
  totalFindings: number;
}

function assetFromRepo(
  repo: RepoIdentity,
  scansByScanner: Record<RepoScanner, ScanRecord[]>,
): RepoAssetRow {
  const scanners: ScannerAttachment[] = [];
  let totalFindings = 0;
  let latestOverall: ScanRecord | null = null;
  let latestOverallTimestamp = -Infinity;

  for (const scanner of REPO_SCANNERS) {
    const matched = scansByScanner[scanner]
      .filter((scan) => scanMatchesRepo(scan, repo.fullName))
      .sort((a, b) => {
        const aTime = scanTimestamp(a);
        const bTime = scanTimestamp(b);

        return (
          (bTime ? Date.parse(bTime) : -Infinity) -
          (aTime ? Date.parse(aTime) : -Infinity)
        );
      });

    if (matched.length === 0) continue;

    const latest = matched[0];
    const latestTimestamp = scanTimestamp(latest);

    scanners.push({
      scanner: SCANNER_LABEL[scanner],
      status: scannerAttachmentStatus(latest.status),
      lastRunAt: latestTimestamp,
    });

    for (const scan of matched) {
      const findingCount =
        typeof scan.finding_count === 'number' &&
        Number.isFinite(scan.finding_count) &&
        scan.finding_count >= 0
          ? scan.finding_count
          : 0;

      totalFindings += findingCount;
    }

    const latestTime = latestTimestamp
      ? Date.parse(latestTimestamp)
      : -Infinity;

    if (latestTime > latestOverallTimestamp) {
      latestOverall = latest;
      latestOverallTimestamp = latestTime;
    }
  }

  scanners.sort((a, b) =>
    a.scanner.localeCompare(b.scanner),
  );

  const overallStatus = latestOverall
    ? scannerAttachmentStatus(latestOverall.status)
    : null;

  const scanRollup: SourceAsset['scanRollup'] =
    !latestOverall
      ? 'stale'
      : overallStatus === 'completed'
        ? 'completed'
        : overallStatus === 'running'
          ? 'partial'
          : 'failed';

  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };

  return {
    id: encodeRepoId(repo.installationId, repo.fullName),
    category: 'repository',
    subType: 'GitHub',
    name: repo.fullName,
    owner: '—',
    scanners,
    scanRollup,
    lastAggregatedScanAt: scanTimestamp(
      latestOverall as ScanRecord,
    ),
    bySeverity,
    riskScore: riskScoreFromFindingCount(totalFindings),
    internetExposed: null,
    totalFindings,
  };
}

function applyClientFilters(
  items: readonly RepoAssetRow[],
  filters: SourceInventoryFilters,
): RepoAssetRow[] {
  let result = [...items];

  const search = filters.search?.trim().toLowerCase();

  if (search) {
    result = result.filter((asset) =>
      asset.name.toLowerCase().includes(search),
    );
  }

  if (filters.subType) {
    result = result.filter(
      (asset) => asset.subType === filters.subType,
    );
  }

  if (filters.scanStatus) {
    result = result.filter(
      (asset) => asset.scanRollup === filters.scanStatus,
    );
  }

  if (filters.scanner) {
    result = result.filter((asset) =>
      asset.scanners.some(
        (scanner) => scanner.scanner === filters.scanner,
      ),
    );
  }

  if (filters.owner) {
    result = result.filter(
      (asset) => asset.owner === filters.owner,
    );
  }

  if (filters.internetExposed) {
    result = result.filter(
      (asset) => asset.internetExposed === true,
    );
  }

  /**
   * Severity remains intentionally unapplied at repository-list level because
   * ScanRecord exposes only total finding_count here. Applying the filter to
   * the zero-filled bySeverity record would falsely mean "no repositories
   * match". Detail-level scan results provide the actual per-severity data.
   */
  return result;
}

export async function getRealRepoAssets(
  filters: SourceInventoryFilters = {},
): Promise<{
  items: RepoAssetRow[];
  total: number;
}> {
  if (
    filters.subType &&
    filters.subType !== 'GitHub'
  ) {
    return {
      items: [],
      total: 0,
    };
  }

  const [repos, scansByScanner] = await Promise.all([
    listAllRepos(),
    fetchRecentScansByScanner(),
  ]);

  const items = applyClientFilters(
    repos.map((repo) =>
      assetFromRepo(repo, scansByScanner),
    ),
    filters,
  );

  return {
    items,
    total: items.length,
  };
}

export async function getRealRepoAssetById(
  id: string,
): Promise<SourceAsset | null> {
  const decoded = decodeRepoId(id);

  if (!decoded) return null;

  try {
    const repos = await listAllRepos();

    const repo = repos.find(
      (candidate) =>
        candidate.installationId === decoded.installationId &&
        candidate.fullName === decoded.fullName,
    );

    if (!repo) return null;

    const scansByScanner =
      await fetchRecentScansByScanner();

    return assetFromRepo(repo, scansByScanner);
  } catch {
    return null;
  }
}

const SEVERITY_RANK: Readonly<Record<Severity, number>> =
  Object.freeze({
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    informational: 0,
  });

/**
 * Detail aggregation is bounded to the repository's matched completed scans.
 *
 * CVE is the only cross-scanner identity the current real finding contract
 * supports safely. Findings without a CVE remain individual findings instead
 * of being heuristically merged from incompatible location schemas.
 */
export async function getRealRepoAggregatedFindings(
  asset: SourceAsset,
): Promise<AggregatedFinding[]> {
  const decoded = decodeRepoId(asset.id);

  if (!decoded) return [];

  const scansByScanner =
    await fetchRecentScansByScanner();

  const matchedScans: {
    scanner: RepoScanner;
    scan: ScanRecord;
  }[] = [];

  for (const scanner of REPO_SCANNERS) {
    for (const scan of scansByScanner[scanner]) {
      if (
        scan.status === 'completed' &&
        scanMatchesRepo(scan, decoded.fullName)
      ) {
        matchedScans.push({
          scanner,
          scan,
        });
      }
    }
  }

  const resultsPerScan = await Promise.all(
    matchedScans.map(
      async ({ scanner, scan }) => {
        try {
          const response = await api.getScanResults(
            scanner,
            scan.scan_id,
            { limit: DETAIL_RESULTS_LIMIT },
          );

          return Array.isArray(response.items)
            ? response.items
            : [];
        } catch {
          /**
           * One unavailable scanner result should not erase all other real
           * scanner results for this repository.
           */
          return [];
        }
      },
    ),
  );

  const allFindings = resultsPerScan.flat();

  const withCve = allFindings.filter(
    (
      finding,
    ): finding is ScannerFinding & { cve: string } =>
      typeof finding.cve === 'string' &&
      finding.cve.trim().length > 0,
  );

  const withoutCve = allFindings.filter(
    (finding) =>
      typeof finding.cve !== 'string' ||
      finding.cve.trim().length === 0,
  );

  const cveGroups = new Map<
    string,
    ScannerFinding[]
  >();

  for (const finding of withCve) {
    const cve = finding.cve.trim().toUpperCase();
    const existing = cveGroups.get(cve);

    if (existing) {
      existing.push(finding);
    } else {
      cveGroups.set(cve, [finding]);
    }
  }

  const grouped: AggregatedFinding[] = [
    ...cveGroups.entries(),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group]) => {
      const top = [...group].sort(
        (a, b) =>
          SEVERITY_RANK[b.severity] -
          SEVERITY_RANK[a.severity],
      )[0];

      const detectionSources = [
        ...new Set(
          group.map(
            (finding) =>
              SCANNER_LABEL[
                finding.scanner as RepoScanner
              ] ?? finding.scanner,
          ),
        ),
      ].sort((a, b) => a.localeCompare(b));

      return {
        id: top.finding_id,
        cve: top.cve,
        title: top.title,
        severity: top.severity,
        detectionSources,
        status:
          top.status === 'accepted_risk'
            ? 'suppressed'
            : top.status,
      };
    });

  const ungrouped: AggregatedFinding[] = withoutCve
    .slice()
    .sort((a, b) => a.finding_id.localeCompare(b.finding_id))
    .map((finding) => ({
      id: finding.finding_id,
      cve: null,
      title: finding.title,
      severity: finding.severity,
      detectionSources: [
        SCANNER_LABEL[
          finding.scanner as RepoScanner
        ] ?? finding.scanner,
      ],
      status:
        finding.status === 'accepted_risk'
          ? 'suppressed'
          : finding.status,
    }));

  return [...grouped, ...ungrouped];
}
