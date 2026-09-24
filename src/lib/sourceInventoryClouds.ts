import { api, type VulnerabilityFinding } from './api';
import {
  toUnifiedAzureRow,
  toUnifiedGcpRow,
  toUnifiedRow,
  type UnifiedAccountRow,
} from './unifiedAccounts';
import type {
  AggregatedFinding,
  CategoryOverviewStats,
  ScannerAttachment,
  Severity,
  SourceAsset,
  SourceInventoryFilters,
} from './demoData/sourceInventory';

/**
 * Real-data implementation for the Clouds source-inventory category.
 *
 * Scope:
 * - AWS/GCP/Azure cloud connections are backed by deployed account APIs.
 * - Cloud findings are backed by the deployed vulnerability findings API.
 * - OCI/Other remain explicit empty states because there is no real connector
 *   represented by these functions.
 *
 * Deliberate bounded-read behavior:
 * - Provider-specific account lists use the server's pagination.
 * - "All" provider mode loads only the first page from each provider and
 *   reports the actually loaded item count, with an explicit snapshot notice
 *   when more matching accounts exist.
 * - Finding enrichment is bounded. We never loop over every account and issue
 *   one findings request per account.
 *
 * This module is presentation/data composition only. It must not be treated as
 * an authorization boundary; API/backend scope enforcement remains
 * authoritative.
 */

const PROVIDER_LABEL: Readonly<
  Record<UnifiedAccountRow['provider'], string>
> = Object.freeze({
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
});

const FINDING_SOURCE_LABEL: Readonly<Record<string, string>> = Object.freeze({
  security_hub: 'Security Hub',
  guardduty: 'GuardDuty',
  inspector: 'Inspector',
  iam_access_analyzer: 'IAM Access Analyzer',
  iam_access_analyzer_unused: 'IAM Access Analyzer (Unused)',
  aws_config: 'AWS Config',
  trusted_advisor: 'Trusted Advisor',
  gcp_scc: 'Security Command Center',
  defender: 'Defender for Cloud',
  trivy: 'Trivy',
});

const SEVERITY_RANK: Readonly<Record<Severity, number>> = Object.freeze({
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  informational: 0,
});

/**
 * Real scanner attachments currently observable on cloud posture findings.
 *
 * Trivy is intentionally excluded because it is container-specific and is not
 * a cloud-posture scanner for this source-inventory category.
 */
export const REAL_CLOUD_SCANNER_NAMES: readonly string[] = Object.freeze([
  'Security Hub',
  'GuardDuty',
  'Inspector',
  'IAM Access Analyzer',
  'IAM Access Analyzer (Unused)',
  'AWS Config',
  'Trusted Advisor',
  'Security Command Center',
  'Defender for Cloud',
]);

/**
 * Keep enrichment bounded. This is intentionally a hard ceiling rather than
 * an accidental result of a caller's page size.
 */
const FINDINGS_ENRICHMENT_LIMIT = 500;
const AGGREGATED_FINDINGS_LIMIT = 100;

/**
 * Convert the unified account status into the coarse source-inventory state.
 *
 * This is deliberately connection-level state, not a fabricated per-scanner
 * execution status. A connected account means collection data is expected to
 * be available; pending means not yet completed; every other state is treated
 * as unavailable/failed for this presentation layer.
 */
function scanRollupFor(
  status: string,
): SourceAsset['scanRollup'] {
  switch (status) {
    case 'connected':
      return 'completed';
    case 'pending':
      return 'stale';
    default:
      return 'failed';
  }
}

function emptySeverity(): Record<Severity, number> {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };
}

function riskScoreFor(
  bySeverity: Readonly<Record<Severity, number>>,
): number {
  const score =
    bySeverity.critical * 12 +
    bySeverity.high * 5 +
    bySeverity.medium * 1.5 +
    bySeverity.low * 0.3;

  return Math.max(
    0,
    Math.min(100, Number.isFinite(score) ? Math.round(score) : 0),
  );
}

function normalizeFindingSource(
  source: string | null | undefined,
): string | null {
  if (typeof source !== 'string') return null;

  const normalized = source.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeFindingDate(
  date: string | null | undefined,
): string | null {
  if (typeof date !== 'string' || date.trim() === '') return null;

  const parsed = Date.parse(date);
  return Number.isNaN(parsed) ? null : date;
}

function parseCloudAssetId(
  id: string,
): {
  provider: UnifiedAccountRow['provider'];
  connectionId: string;
} | null {
  if (typeof id !== 'string') return null;

  const match = /^cloud-(aws|gcp|azure)-(.+)$/.exec(id.trim());
  if (!match || !match[2].trim()) return null;

  return {
    provider: match[1] as UnifiedAccountRow['provider'],
    connectionId: match[2],
  };
}

/**
 * Build one real SourceAsset per cloud connection.
 *
 * Only fields supported by the real data model are populated. Unknown
 * ownership/exposure data remains explicitly unavailable.
 */
function assetFromRow(
  row: UnifiedAccountRow,
  findings: readonly VulnerabilityFinding[],
): SourceAsset {
  const bySeverity = emptySeverity();
  const latestBySource = new Map<string, string>();

  for (const finding of findings) {
    const severity = finding.severity;

    if (severity in bySeverity) {
      bySeverity[severity] += 1;
    }

    const source = normalizeFindingSource(finding.finding_source);
    const discoveredAt = normalizeFindingDate(finding.discovered_at);

    if (!source || !discoveredAt) continue;

    const previous = latestBySource.get(source);

    if (
      !previous ||
      Date.parse(discoveredAt) > Date.parse(previous)
    ) {
      latestBySource.set(source, discoveredAt);
    }
  }

  const scanners: ScannerAttachment[] = [...latestBySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, lastRunAt]) => ({
      scanner: FINDING_SOURCE_LABEL[source] ?? source,
      status: 'completed',
      lastRunAt,
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

function bucketByConnection(
  findings: readonly VulnerabilityFinding[],
): Map<string, VulnerabilityFinding[]> {
  const map = new Map<string, VulnerabilityFinding[]>();

  for (const finding of findings) {
    const connectionId = finding.connection_id?.trim();

    /**
     * Findings without connection ownership do not belong to a cloud-account
     * asset in this category. Keeping them out is preferable to inventing a
     * synthetic account bucket.
     */
    if (!connectionId) continue;

    const bucket = map.get(connectionId);

    if (bucket) {
      bucket.push(finding);
    } else {
      map.set(connectionId, [finding]);
    }
  }

  return map;
}

/**
 * Client-only filters are applied strictly to data already fetched.
 *
 * These dimensions have no real account-list server filter in the current
 * contract, so this function never triggers extra network calls to satisfy a
 * UI filter.
 */
function applyClientFilters(
  items: readonly SourceAsset[],
  filters: SourceInventoryFilters,
): SourceAsset[] {
  let result = [...items];

  if (filters.severity) {
    result = result.filter(
      (asset) => asset.bySeverity[filters.severity!] > 0,
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
    result = result.filter((asset) => asset.owner === filters.owner);
  }

  if (filters.internetExposed) {
    result = result.filter((asset) => asset.internetExposed === true);
  }

  return result;
}

function accountSearch(
  filters: SourceInventoryFilters,
): string | undefined {
  const search = filters.search?.trim();
  return search || undefined;
}

function providerForFilter(
  filters: SourceInventoryFilters,
): UnifiedAccountRow['provider'] | null {
  switch (filters.subType) {
    case 'AWS':
      return 'aws';
    case 'GCP':
      return 'gcp';
    case 'Azure':
      return 'azure';
    default:
      return null;
  }
}

async function getProviderAccountsPage(
  provider: UnifiedAccountRow['provider'],
  page: number,
  pageSize: number,
  search: string | undefined,
): Promise<{
  rows: UnifiedAccountRow[];
  total: number;
}> {
  if (provider === 'aws') {
    const response = await api.getAccounts({
      search,
      page,
      limit: pageSize,
    });

    return {
      rows: response.items.map(toUnifiedRow),
      total: response.pagination.total,
    };
  }

  if (provider === 'gcp') {
    const response = await api.getGcpAccounts({
      search,
      page,
      limit: pageSize,
    });

    return {
      rows: response.items.map(toUnifiedGcpRow),
      total: response.pagination.total,
    };
  }

  const response = await api.getAzureAccounts({
    search,
    page,
    limit: pageSize,
  });

  return {
    rows: response.items.map(toUnifiedAzureRow),
    total: response.pagination.total,
  };
}

function providerSpecificEmptyResult(
  subtype: SourceInventoryFilters['subType'],
): boolean {
  return subtype === 'OCI' || subtype === 'Other';
}

function buildAllProviderSnapshotNotice(
  loaded: number,
  grandTotal: number,
): string | null {
  if (grandTotal <= loaded) return null;

  return `Showing the first ${loaded.toLocaleString()} of ${grandTotal.toLocaleString()} matching accounts across all clouds — filter by provider above to see the complete list for one cloud.`;
}

/**
 * Returns one bounded page/snapshot of real cloud assets.
 *
 * Important: the returned `total` describes the current result set:
 * - provider-specific mode uses the backend total;
 * - All-cloud mode uses the number actually loaded because it is intentionally
 *   a bounded snapshot, not a client-side all-pages query.
 */
export async function getRealCloudAssetsPage(
  page: number,
  pageSize: number,
  filters: SourceInventoryFilters = {},
): Promise<{
  items: SourceAsset[];
  total: number;
  snapshotNotice: string | null;
}> {
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePageSize =
    Number.isInteger(pageSize) && pageSize > 0
      ? Math.min(pageSize, 100)
      : 25;

  if (providerSpecificEmptyResult(filters.subType)) {
    return {
      items: [],
      total: 0,
      snapshotNotice: null,
    };
  }

  const search = accountSearch(filters);
  const provider = providerForFilter(filters);

  let rows: UnifiedAccountRow[];
  let total: number;
  let snapshotNotice: string | null = null;

  if (provider) {
    const response = await getProviderAccountsPage(
      provider,
      safePage,
      safePageSize,
      search,
    );

    rows = response.rows;
    total = response.total;
  } else {
    /**
     * "All" intentionally loads only page 1 from each provider. The input
     * page is not applied here because doing so would make cross-provider
     * pagination misleading (e.g. page 2 could omit one provider entirely).
     */
    const responses = await Promise.all([
      getProviderAccountsPage('aws', 1, safePageSize, search),
      getProviderAccountsPage('gcp', 1, safePageSize, search),
      getProviderAccountsPage('azure', 1, safePageSize, search),
    ]);

    rows = responses.flatMap((response) => response.rows);

    const grandTotal = responses.reduce(
      (sum, response) => sum + response.total,
      0,
    );

    total = rows.length;
    snapshotNotice = buildAllProviderSnapshotNotice(
      rows.length,
      grandTotal,
    );
  }

  /**
   * One bounded findings read enriches the currently loaded account page.
   * Per-account findings calls are intentionally avoided here.
   *
   * A future aggregate-by-connection endpoint can remove this lower-bound
   * limitation without changing the SourceAsset contract.
   */
  const findingsResponse = await api.getFindings({
    status: 'open',
    limit: FINDINGS_ENRICHMENT_LIMIT,
  });

  const findingsByConnection = bucketByConnection(
    Array.isArray(findingsResponse.items)
      ? findingsResponse.items
      : [],
  );

  const assets = rows.map((row) =>
    assetFromRow(
      row,
      findingsByConnection.get(row.id) ?? [],
    ),
  );

  return {
    items: applyClientFilters(assets, filters),
    total,
    snapshotNotice,
  };
}

async function getCloudAccount(
  provider: UnifiedAccountRow['provider'],
  connectionId: string,
): Promise<UnifiedAccountRow> {
  if (provider === 'aws') {
    return toUnifiedRow(await api.getAccount(connectionId));
  }

  if (provider === 'gcp') {
    return toUnifiedGcpRow(await api.getGcpAccount(connectionId));
  }

  return toUnifiedAzureRow(
    await api.getAzureAccount(connectionId),
  );
}

export async function getRealCloudAssetById(
  id: string,
): Promise<SourceAsset | null> {
  const parsed = parseCloudAssetId(id);

  if (!parsed) return null;

  try {
    const [row, findingsResponse] = await Promise.all([
      getCloudAccount(parsed.provider, parsed.connectionId),
      api.getFindings({
        connection_id: parsed.connectionId,
        status: 'open',
        limit: FINDINGS_ENRICHMENT_LIMIT,
      }),
    ]);

    return assetFromRow(
      row,
      Array.isArray(findingsResponse.items)
        ? findingsResponse.items
        : [],
    );
  } catch {
    /**
     * Detail lookups are expected to handle missing/inaccessible connections
     * as a normal "not found" UI state. Callers can render their own error
     * boundary for transport errors elsewhere.
     */
    return null;
  }
}

/**
 * Real multi-scanner aggregation for one cloud asset.
 *
 * Findings are grouped by resource_id, falling back to resource_arn and then
 * the finding ID when a scanner has not supplied either resource identifier.
 */
export async function getRealCloudAggregatedFindings(
  asset: SourceAsset,
): Promise<AggregatedFinding[]> {
  const parsed = parseCloudAssetId(asset.id);

  if (!parsed) return [];

  const response = await api.getFindings({
    connection_id: parsed.connectionId,
    status: 'open',
    limit: AGGREGATED_FINDINGS_LIMIT,
  });

  const groups = new Map<string, VulnerabilityFinding[]>();

  for (const finding of Array.isArray(response.items)
    ? response.items
    : []) {
    const key =
      finding.resource_id?.trim() ||
      finding.resource_arn?.trim() ||
      finding.id;

    if (!key) continue;

    const bucket = groups.get(key);

    if (bucket) {
      bucket.push(finding);
    } else {
      groups.set(key, [finding]);
    }
  }

  return [...groups.values()].map((group) => {
    const top = [...group].sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] -
        SEVERITY_RANK[a.severity],
    )[0];

    const detectionSources = [
      ...new Set(
        group
          .map((finding) =>
            normalizeFindingSource(finding.finding_source),
          )
          .filter((source): source is string => Boolean(source))
          .map(
            (source) =>
              FINDING_SOURCE_LABEL[source] ?? source,
          ),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return {
      id: top.id,
      cve: null,
      title: top.title,
      severity: top.severity,
      detectionSources,
      status: top.status,
    };
  });
}

async function getNotConnectedTotalAws(): Promise<number> {
  const [error, pending] = await Promise.all([
    api.getAccounts({ status: 'error', limit: 1 }),
    api.getAccounts({ status: 'pending', limit: 1 }),
  ]);

  return error.pagination.total + pending.pagination.total;
}

async function getNotConnectedTotalGcp(): Promise<number> {
  const [error, pending] = await Promise.all([
    api.getGcpAccounts({ status: 'error', limit: 1 }),
    api.getGcpAccounts({ status: 'pending', limit: 1 }),
  ]);

  return error.pagination.total + pending.pagination.total;
}

async function getNotConnectedTotalAzure(): Promise<number> {
  const [error, pending] = await Promise.all([
    api.getAzureAccounts({ status: 'error', limit: 1 }),
    api.getAzureAccounts({ status: 'pending', limit: 1 }),
  ]);

  return error.pagination.total + pending.pagination.total;
}

export async function getRealCloudOverviewStats(): Promise<CategoryOverviewStats> {
  const [
    dashboard,
    awsTotalResponse,
    gcpTotalResponse,
    azureTotalResponse,
    awsNotConnected,
    gcpNotConnected,
    azureNotConnected,
  ] = await Promise.all([
    api.getVulnerabilityDashboard(),
    api.getAccounts({ limit: 1 }),
    api.getGcpAccounts({ limit: 1 }),
    api.getAzureAccounts({ limit: 1 }),
    getNotConnectedTotalAws(),
    getNotConnectedTotalGcp(),
    getNotConnectedTotalAzure(),
  ]);

  const awsTotal = awsTotalResponse.pagination.total;
  const gcpTotal = gcpTotalResponse.pagination.total;
  const azureTotal = azureTotalResponse.pagination.total;

  return {
    total: awsTotal + gcpTotal + azureTotal,
    bySubType: [
      { subType: 'AWS', count: awsTotal },
      { subType: 'GCP', count: gcpTotal },
      { subType: 'Azure', count: azureTotal },
      { subType: 'OCI', count: 0 },
      { subType: 'Other', count: 0 },
    ],
    bySeverity: {
      critical: Number.isFinite(dashboard.bySeverity.critical)
        ? dashboard.bySeverity.critical
        : 0,
      high: Number.isFinite(dashboard.bySeverity.high)
        ? dashboard.bySeverity.high
        : 0,
      medium: Number.isFinite(dashboard.bySeverity.medium)
        ? dashboard.bySeverity.medium
        : 0,
      low: Number.isFinite(dashboard.bySeverity.low)
        ? dashboard.bySeverity.low
        : 0,
      informational: Number.isFinite(
        dashboard.bySeverity.informational,
      )
        ? dashboard.bySeverity.informational
        : 0,
    },
    staleOrFailedCount:
      awsNotConnected +
      gcpNotConnected +
      azureNotConnected,
  };
}
