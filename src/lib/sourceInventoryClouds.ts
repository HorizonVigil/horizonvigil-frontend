import { api, type VulnerabilityFinding } from './api';
import { toUnifiedRow, toUnifiedGcpRow, toUnifiedAzureRow, type UnifiedAccountRow } from './unifiedAccounts';
import type {
  SourceAsset, AggregatedFinding, ScannerAttachment, Severity,
  CategoryOverviewStats, SourceInventoryFilters,
} from './demoData/sourceInventory';

/**
 * The real-data counterpart to lib/demoData/sourceInventory.ts, for the
 * Clouds category only -- Repositories/Artifactories/Registries/Clusters/
 * Servers stay mock (no real backend yet) and are untouched by this file.
 *
 * Composes only endpoints that are already real and already deployed
 * (aws/gcp/azure-accounts-api's account lists, vulnerability-management-api's
 * findings + dashboard) -- no new backend routes, no new deploys. Multi-
 * provider pagination follows the exact pattern CloudAccounts.tsx's own
 * Inventory tab already established (see its header comment): filtering to
 * one provider gets that provider's own real, fully server-paginated list;
 * "All" stays a bounded, honestly-labeled snapshot (first page from each
 * cloud) rather than looping every page from every provider into one
 * client array, which is the exact anti-pattern that codebase already hit
 * and fixed once.
 */

const PROVIDER_LABEL: Record<UnifiedAccountRow['provider'], string> = { aws: 'AWS', gcp: 'GCP', azure: 'Azure' };

const FINDING_SOURCE_LABEL: Record<string, string> = {
  security_hub: 'Security Hub', guardduty: 'GuardDuty', inspector: 'Inspector',
  iam_access_analyzer: 'IAM Access Analyzer', iam_access_analyzer_unused: 'IAM Access Analyzer (Unused)',
  aws_config: 'AWS Config', trusted_advisor: 'Trusted Advisor',
  gcp_scc: 'Security Command Center', defender: 'Defender for Cloud', trivy: 'Trivy',
};

const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, informational: 0 };

/** The real scanner-attachment names Clouds assets can actually carry --
 * distinct from SOURCE_CATEGORY_CONFIG.cloud.scannerPool (Prowler/Commercial
 * CSPM/etc), which is the mock model's invented pool and doesn't match what
 * real findings ever produce. Excludes 'trivy' (container-specific, not a
 * cloud-posture source). */
export const REAL_CLOUD_SCANNER_NAMES = [
  'Security Hub', 'GuardDuty', 'Inspector', 'IAM Access Analyzer', 'IAM Access Analyzer (Unused)',
  'AWS Config', 'Trusted Advisor', 'Security Command Center', 'Defender for Cloud',
];

function emptySeverity(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
}

function riskScoreFor(bySeverity: Record<Severity, number>): number {
  return Math.min(100, Math.round(bySeverity.critical * 12 + bySeverity.high * 5 + bySeverity.medium * 1.5 + bySeverity.low * 0.3));
}

/** connected -> posture data is being collected; pending -> not yet run;
 * error/disconnected/expired -> not currently producing data. A plain,
 * stated mapping from the connection's own real status, not a fabricated
 * per-scanner run state. */
function scanRollupFor(status: string): SourceAsset['scanRollup'] {
  if (status === 'connected') return 'completed';
  if (status === 'pending') return 'stale';
  return 'failed';
}

function parseCloudAssetId(id: string): { provider: UnifiedAccountRow['provider']; connectionId: string } | null {
  const match = /^cloud-(aws|gcp|azure)-(.+)$/.exec(id);
  if (!match) return null;
  return { provider: match[1] as UnifiedAccountRow['provider'], connectionId: match[2] };
}

/** One SourceAsset per real connection, scanners/bySeverity/riskScore
 * derived from that connection's own real open findings -- never
 * fabricated. `owner` and `internetExposed` have no real field anywhere in
 * CloudConnection/GcpConnection/AzureConnection or VulnerabilityFinding, so
 * they render as "not available" ('—' / null) rather than inventing one,
 * unlike the mock generator. */
function assetFromRow(row: UnifiedAccountRow, findings: VulnerabilityFinding[]): SourceAsset {
  const bySeverity = emptySeverity();
  const latestBySource = new Map<string, string>();
  for (const f of findings) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    const prev = latestBySource.get(f.finding_source);
    if (!prev || f.discovered_at > prev) latestBySource.set(f.finding_source, f.discovered_at);
  }
  const scanners: ScannerAttachment[] = [...latestBySource.entries()].map(([source, lastRunAt]) => ({
    scanner: FINDING_SOURCE_LABEL[source] ?? source, status: 'completed', lastRunAt,
  }));
  return {
    id: `cloud-${row.provider}-${row.id}`,
    category: 'cloud',
    subType: PROVIDER_LABEL[row.provider],
    name: row.name,
    owner: '—',
    scanners,
    scanRollup: scanRollupFor(row.status),
    lastAggregatedScanAt: row.lastSync,
    bySeverity,
    riskScore: riskScoreFor(bySeverity),
    internetExposed: null,
  };
}

function bucketByConnection(findings: VulnerabilityFinding[]): Map<string, VulnerabilityFinding[]> {
  const map = new Map<string, VulnerabilityFinding[]>();
  for (const f of findings) {
    if (!map.has(f.connection_id)) map.set(f.connection_id, []);
    map.get(f.connection_id)!.push(f);
  }
  return map;
}

/** Client-side-only narrowing for filter dimensions that have no real
 * server-side equivalent (severity/scanStatus/scanner -- connections have no
 * such columns to filter by). Applied over whatever page/snapshot is
 * already in hand, never by fetching more to satisfy the filter -- same
 * "never loop every page" discipline as the provider-vs-all pagination
 * split above. owner/internetExposed filters naturally return no matches
 * here since real Clouds assets always have owner:'—'/internetExposed:null
 * -- an honest "not available", not a bug. */
function applyClientFilters(items: SourceAsset[], filters: SourceInventoryFilters): SourceAsset[] {
  let out = items;
  if (filters.severity) out = out.filter(a => a.bySeverity[filters.severity!] > 0);
  if (filters.scanStatus) out = out.filter(a => a.scanRollup === filters.scanStatus);
  if (filters.scanner) out = out.filter(a => a.scanners.some(s => s.scanner === filters.scanner));
  if (filters.owner) out = out.filter(a => a.owner === filters.owner);
  if (filters.internetExposed) out = out.filter(a => a.internetExposed === true);
  return out;
}

export async function getRealCloudAssetsPage(
  page: number, pageSize: number, filters: SourceInventoryFilters = {},
): Promise<{ items: SourceAsset[]; total: number; snapshotNotice: string | null }> {
  if (filters.subType === 'OCI' || filters.subType === 'Other') {
    // Honest empty result -- no OCI connector exists in this product yet.
    return { items: [], total: 0, snapshotNotice: null };
  }

  const search = filters.search || undefined;
  const provider = filters.subType === 'AWS' ? 'aws' : filters.subType === 'GCP' ? 'gcp' : filters.subType === 'Azure' ? 'azure' : null;

  let rows: UnifiedAccountRow[];
  let total: number;
  let snapshotNotice: string | null = null;

  if (provider === 'aws') {
    const res = await api.getAccounts({ search, page, limit: pageSize });
    rows = res.items.map(toUnifiedRow);
    total = res.pagination.total;
  } else if (provider === 'gcp') {
    const res = await api.getGcpAccounts({ search, page, limit: pageSize });
    rows = res.items.map(toUnifiedGcpRow);
    total = res.pagination.total;
  } else if (provider === 'azure') {
    const res = await api.getAzureAccounts({ search, page, limit: pageSize });
    rows = res.items.map(toUnifiedAzureRow);
    total = res.pagination.total;
  } else {
    const [awsRes, gcpRes, azureRes] = await Promise.all([
      api.getAccounts({ search, page: 1, limit: pageSize }),
      api.getGcpAccounts({ search, page: 1, limit: pageSize }),
      api.getAzureAccounts({ search, page: 1, limit: pageSize }),
    ]);
    rows = [...awsRes.items.map(toUnifiedRow), ...gcpRes.items.map(toUnifiedGcpRow), ...azureRes.items.map(toUnifiedAzureRow)];
    const grandTotal = awsRes.pagination.total + gcpRes.pagination.total + azureRes.pagination.total;
    // Bounded snapshot -- total reflects only what's actually loaded, so the
    // pager doesn't imply further pages that "All" mode will never fetch.
    total = rows.length;
    if (grandTotal > rows.length) {
      snapshotNotice = `Showing the first ${rows.length.toLocaleString()} of ${grandTotal.toLocaleString()} matching accounts across all clouds — filter by provider above to see the complete list for one cloud.`;
    }
  }

  // One bounded fetch of real open findings, bucketed client-side by
  // connection_id -- no per-connection-list-endpoint aggregate exists
  // server-side today. If an org has more open findings than this limit,
  // per-account counts below become a lower bound; a real aggregate-by-
  // connection endpoint would remove this cap and is a reasonable future
  // pass, not this one.
  const findingsRes = await api.getFindings({ status: 'open', limit: 500 });
  const byConnection = bucketByConnection(findingsRes.items);
  const items = applyClientFilters(rows.map(row => assetFromRow(row, byConnection.get(row.id) ?? [])), filters);

  return { items, total, snapshotNotice };
}

export async function getRealCloudAssetById(id: string): Promise<SourceAsset | null> {
  const parsed = parseCloudAssetId(id);
  if (!parsed) return null;
  const { provider, connectionId } = parsed;

  try {
    const [row, findingsRes] = await Promise.all([
      provider === 'aws' ? api.getAccount(connectionId).then(toUnifiedRow)
        : provider === 'gcp' ? api.getGcpAccount(connectionId).then(toUnifiedGcpRow)
        : api.getAzureAccount(connectionId).then(toUnifiedAzureRow),
      api.getFindings({ connection_id: connectionId, status: 'open', limit: 500 }),
    ]);
    return assetFromRow(row, findingsRes.items);
  } catch {
    return null;
  }
}

/** The one place the "detected by multiple scanners" concept has to be
 * visibly true using real data -- findings sharing the same resource_id
 * (or resource_arn when a source doesn't set resource_id) collapse into one
 * AggregatedFinding with every distinct finding_source that flagged it. A
 * group naming 2+ sources (e.g. Security Hub AND GuardDuty both flagging
 * the same instance) is a real, not simulated, instance of the dedup
 * concept. `cve` has no real field on VulnerabilityFinding -- null,
 * rendered '—' by the page, same convention VulnerabilityDetail.tsx already
 * uses for fields real data doesn't have. */
export async function getRealCloudAggregatedFindings(asset: SourceAsset): Promise<AggregatedFinding[]> {
  const parsed = parseCloudAssetId(asset.id);
  if (!parsed) return [];

  const res = await api.getFindings({ connection_id: parsed.connectionId, status: 'open', limit: 100 });
  const groups = new Map<string, VulnerabilityFinding[]>();
  for (const f of res.items) {
    const key = f.resource_id ?? f.resource_arn ?? f.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }

  return [...groups.values()].map(group => {
    const top = [...group].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])[0];
    const detectionSources = [...new Set(group.map(f => FINDING_SOURCE_LABEL[f.finding_source] ?? f.finding_source))];
    return { id: top.id, cve: null, title: top.title, severity: top.severity, detectionSources, status: top.status };
  });
}

export async function getRealCloudOverviewStats(): Promise<CategoryOverviewStats> {
  const [dash, awsTotal, gcpTotal, azureTotal, awsNotConnected, gcpNotConnected, azureNotConnected] = await Promise.all([
    api.getVulnerabilityDashboard(),
    api.getAccounts({ limit: 1 }).then(r => r.pagination.total),
    api.getGcpAccounts({ limit: 1 }).then(r => r.pagination.total),
    api.getAzureAccounts({ limit: 1 }).then(r => r.pagination.total),
    Promise.all([
      api.getAccounts({ status: 'error', limit: 1 }).then(r => r.pagination.total),
      api.getAccounts({ status: 'pending', limit: 1 }).then(r => r.pagination.total),
    ]).then(([a, b]) => a + b),
    Promise.all([
      api.getGcpAccounts({ status: 'error', limit: 1 }).then(r => r.pagination.total),
      api.getGcpAccounts({ status: 'pending', limit: 1 }).then(r => r.pagination.total),
    ]).then(([a, b]) => a + b),
    Promise.all([
      api.getAzureAccounts({ status: 'error', limit: 1 }).then(r => r.pagination.total),
      api.getAzureAccounts({ status: 'pending', limit: 1 }).then(r => r.pagination.total),
    ]).then(([a, b]) => a + b),
  ]);

  return {
    total: awsTotal + gcpTotal + azureTotal,
    bySubType: [
      { subType: 'AWS', count: awsTotal }, { subType: 'GCP', count: gcpTotal }, { subType: 'Azure', count: azureTotal },
      { subType: 'OCI', count: 0 }, { subType: 'Other', count: 0 },
    ],
    // Real, org-wide, and confirmed to include AWS-native + GCP SCC + Azure
    // Defender findings (they share vulnerability_findings) -- the
    // dashboard's own doc comment only excludes the separate
    // cloudops360-scanner-* fleet, which is irrelevant to cloud posture.
    bySeverity: {
      critical: dash.bySeverity.critical ?? 0, high: dash.bySeverity.high ?? 0, medium: dash.bySeverity.medium ?? 0,
      low: dash.bySeverity.low ?? 0, informational: dash.bySeverity.informational ?? 0,
    },
    staleOrFailedCount: awsNotConnected + gcpNotConnected + azureNotConnected,
  };
}
