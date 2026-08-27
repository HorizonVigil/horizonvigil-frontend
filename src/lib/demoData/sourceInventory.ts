import { rngFor, pick, weightedPick, daysAgoISO } from './random';

/**
 * Deterministic synthetic data for the Source Inventory pillar (Clouds/
 * Repositories/Artifactories/Registries/Clusters/Servers) -- see seed.ts's
 * own header comment for the shared discipline this follows: never
 * materialize the full asset set in memory, synthesize one page on demand
 * keyed by (category, page, index) so results are stable across
 * navigations, same PRNG helpers (lib/demoData/random.ts) as seed.ts.
 *
 * Core concept this module exists to demonstrate: an asset can have N
 * scanners attached (not one scanner = one asset row), and findings flagged
 * by more than one scanner collapse into a single finding with multiple
 * `detectionSources` -- never duplicate rows for the same underlying issue.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type SourceCategory = 'cloud' | 'repository' | 'artifactory' | 'registry' | 'cluster' | 'server';

export interface ScannerAttachment {
  scanner: string;
  status: 'completed' | 'running' | 'failed' | 'never_run';
  lastRunAt: string | null;
}

export interface AggregatedFinding {
  id: string;
  cve: string | null;
  title: string;
  severity: Severity;
  detectionSources: string[];
  status: 'open' | 'resolved' | 'suppressed';
}

export interface SourceAsset {
  id: string;
  category: SourceCategory;
  subType: string;
  name: string;
  owner: string;
  scanners: ScannerAttachment[];
  scanRollup: 'completed' | 'partial' | 'failed' | 'stale';
  lastAggregatedScanAt: string | null;
  bySeverity: Record<Severity, number>;
  riskScore: number;
  internetExposed: boolean;
}

interface SubTypeSpec { key: string; label: string; weight: number }
interface CategoryConfig {
  label: string;
  subTypes: SubTypeSpec[];
  total: number;
  scannerPool: string[];
  nameFor: (subType: string, rng: () => number, index: number) => string;
}

const OWNERS = ['Platform Team', 'AppSec Team', 'Cloud Infra Team', 'DevSecOps', 'Unassigned'];

function orgName(rng: () => number): string {
  return pick(rng, ['acme', 'globex', 'initech', 'umbrella', 'stark', 'wayne', 'hooli', 'wonka']);
}

export const SOURCE_CATEGORY_CONFIG: Record<SourceCategory, CategoryConfig> = {
  cloud: {
    label: 'Clouds',
    subTypes: [
      { key: 'aws', label: 'AWS', weight: 45 }, { key: 'gcp', label: 'GCP', weight: 20 },
      { key: 'azure', label: 'Azure', weight: 25 }, { key: 'oci', label: 'OCI', weight: 7 },
      { key: 'other', label: 'Other', weight: 3 },
    ],
    total: 1240,
    scannerPool: ['Prowler', 'Security Hub', 'Commercial CSPM', 'Native Posture Scanner'],
    nameFor: (subType, rng, i) => `${subType}-${pick(rng, ['prod', 'staging', 'dev', 'sandbox'])}-${orgName(rng)}-${String(i).padStart(4, '0')}`,
  },
  repository: {
    label: 'Repositories',
    subTypes: [
      { key: 'github', label: 'GitHub', weight: 55 }, { key: 'gitlab', label: 'GitLab', weight: 25 },
      { key: 'bitbucket', label: 'Bitbucket', weight: 15 }, { key: 'other', label: 'Other', weight: 5 },
    ],
    total: 2180,
    scannerPool: ['Semgrep', 'Gitleaks', 'TruffleHog', 'Dependency-Check', 'Commercial SAST'],
    nameFor: (_subType, rng, i) => `${orgName(rng)}/${pick(rng, ['api', 'web', 'worker', 'infra', 'mobile', 'data', 'auth', 'billing'])}-${pick(rng, ['service', 'app', 'lib', 'tool'])}-${i}`,
  },
  artifactory: {
    label: 'Artifactories',
    subTypes: [{ key: 'jfrog', label: 'JFrog Artifactory', weight: 70 }, { key: 'other', label: 'Other', weight: 30 }],
    total: 128,
    scannerPool: ['Grype', 'Syft', 'Commercial SCA'],
    nameFor: (_subType, rng, i) => `${pick(rng, ['npm', 'maven', 'pypi', 'generic', 'nuget'])}-repo-${orgName(rng)}-${i}`,
  },
  registry: {
    label: 'Registries',
    subTypes: [
      { key: 'ecr', label: 'ECR', weight: 35 }, { key: 'dockerhub', label: 'Docker Hub', weight: 15 },
      { key: 'acr', label: 'ACR', weight: 15 }, { key: 'gcr', label: 'GCR / Artifact Registry', weight: 20 },
      { key: 'ghcr', label: 'GHCR', weight: 10 }, { key: 'other', label: 'Other', weight: 5 },
    ],
    total: 214,
    scannerPool: ['Trivy', 'Grype', 'Commercial Image Scanner'],
    nameFor: (subType, rng, i) => `${subType}-${orgName(rng)}-registry-${i}`,
  },
  cluster: {
    label: 'Clusters',
    subTypes: [
      { key: 'kubernetes', label: 'Kubernetes', weight: 60 }, { key: 'rancher', label: 'Rancher', weight: 25 },
      { key: 'docker', label: 'Docker', weight: 15 },
    ],
    total: 156,
    scannerPool: ['Kube-bench', 'Kubescape', 'Commercial KSPM'],
    nameFor: (subType, rng, i) => `${subType}-cluster-${pick(rng, ['prod', 'staging', 'dev'])}-${i}`,
  },
  server: {
    label: 'Servers',
    subTypes: [
      { key: 'linux', label: 'Linux', weight: 45 }, { key: 'ubuntu', label: 'Ubuntu', weight: 35 },
      { key: 'windows', label: 'Windows', weight: 20 },
    ],
    total: 1480,
    scannerPool: ['Inspector', 'Commercial Vuln Scanner', 'OS Patch Scanner'],
    nameFor: (subType, rng, i) => `${subType}-host-${String(i).padStart(5, '0')}.${orgName(rng)}.internal`,
  },
};

const SEVERITY_WEIGHTS: readonly [Severity, number][] = [['critical', 2], ['high', 8], ['medium', 35], ['low', 45], ['informational', 10]];

function subTypeFor(config: CategoryConfig, rng: () => number): string {
  return weightedPick(rng, config.subTypes.map(s => [s.label, s.weight] as [string, number]));
}

function generateAsset(category: SourceCategory, globalIndex: number): SourceAsset {
  const config = SOURCE_CATEGORY_CONFIG[category];
  const rng = rngFor(globalIndex + category.charCodeAt(0) * 1_000_000);
  const subType = subTypeFor(config, rng);

  // ~20% of assets get 2+ scanners attached, proving the aggregation UI
  // actually merges results rather than just listing one scanner's output.
  const scannerCount = rng() < 0.2 ? 2 + Math.floor(rng() * (config.scannerPool.length - 1)) : 1;
  const shuffledPool = [...config.scannerPool].sort(() => rng() - 0.5);
  const scanners: ScannerAttachment[] = shuffledPool.slice(0, Math.min(scannerCount, config.scannerPool.length)).map(scanner => {
    const status = weightedPick(rng, [['completed', 85], ['running', 5], ['failed', 7], ['never_run', 3]] as const);
    return { scanner, status, lastRunAt: status === 'never_run' ? null : daysAgoISO(rng, 21) };
  });

  const completedCount = scanners.filter(s => s.status === 'completed').length;
  const failedCount = scanners.filter(s => s.status === 'failed').length;
  const scanRollup: SourceAsset['scanRollup'] =
    failedCount === scanners.length ? 'failed'
      : completedCount === scanners.length ? 'completed'
        : completedCount > 0 ? 'partial'
          : 'stale';

  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };
  const findingCount = Math.floor(rng() * 40);
  for (let i = 0; i < findingCount; i++) {
    bySeverity[weightedPick(rng, SEVERITY_WEIGHTS)]++;
  }
  const riskScore = Math.min(100, Math.round(bySeverity.critical * 12 + bySeverity.high * 5 + bySeverity.medium * 1.5 + bySeverity.low * 0.3));

  return {
    id: `${category}-${globalIndex}`,
    category,
    subType,
    name: config.nameFor(subType.toLowerCase().replace(/[^a-z0-9]+/g, '-'), rng, globalIndex),
    owner: pick(rng, OWNERS),
    scanners,
    scanRollup,
    lastAggregatedScanAt: scanners.length > 0 ? scanners.reduce<string | null>((latest, s) => (s.lastRunAt && (!latest || s.lastRunAt > latest) ? s.lastRunAt : latest), null) : null,
    bySeverity,
    riskScore,
    internetExposed: rng() < 0.08,
  };
}

export interface SourceInventoryFilters {
  subType?: string;
  severity?: Severity;
  scanStatus?: SourceAsset['scanRollup'];
  scanner?: string;
  owner?: string;
  internetExposed?: boolean;
  search?: string;
}

export function generateSourceAssetsPage(
  category: SourceCategory,
  page: number,
  pageSize: number,
  filters: SourceInventoryFilters = {},
): { items: SourceAsset[]; total: number } {
  const config = SOURCE_CATEGORY_CONFIG[category];
  // Filters narrow the reported total by a fixed, plausible ratio rather
  // than by actually scanning every asset -- same "no backing array to
  // scan" discipline as seed.ts's filteredTotal for findings.
  let total = config.total;
  if (filters.subType) total = Math.round(total * ((config.subTypes.find(s => s.label === filters.subType)?.weight ?? 10) / 100));
  if (filters.severity) total = Math.round(total * 0.3);
  if (filters.scanStatus) total = Math.round(total * (filters.scanStatus === 'completed' ? 0.7 : 0.15));
  if (filters.scanner) total = Math.round(total * 0.25);
  if (filters.owner) total = Math.round(total * 0.2);
  if (filters.internetExposed) total = Math.round(total * 0.08);
  if (filters.search) total = Math.min(total, 25);

  const start = (page - 1) * pageSize;
  const items: SourceAsset[] = [];
  // Over-generate slightly past pageSize when filters are active so a
  // filtered page still has real rows to show rather than empty gaps --
  // bounded (never more than a few pageSize's worth of extra work).
  for (let tried = 0; items.length < pageSize && tried < pageSize * 20 && start + tried < config.total; tried++) {
    const asset = generateAsset(category, start + tried);
    if (filters.subType && asset.subType !== filters.subType) continue;
    if (filters.severity && asset.bySeverity[filters.severity] === 0) continue;
    if (filters.scanStatus && asset.scanRollup !== filters.scanStatus) continue;
    if (filters.scanner && !asset.scanners.some(s => s.scanner === filters.scanner)) continue;
    if (filters.owner && asset.owner !== filters.owner) continue;
    if (filters.internetExposed && !asset.internetExposed) continue;
    if (filters.search && !asset.name.toLowerCase().includes(filters.search.toLowerCase())) continue;
    items.push(asset);
  }
  return { items, total };
}

export function generateSourceAssetById(category: SourceCategory, id: string): SourceAsset | null {
  const match = new RegExp(`^${category}-(\\d+)$`).exec(id);
  if (!match) return null;
  return generateAsset(category, Number(match[1]));
}

const CVES = ['CVE-2025-4127', 'CVE-2025-3011', 'CVE-2024-9821', 'CVE-2025-1188', 'CVE-2024-7734', 'CVE-2025-2290'];
const FINDING_TITLES = ['Outdated dependency with known exploit', 'Publicly exposed by default', 'Excess IAM privilege granted', 'Missing encryption at rest', 'Unpatched OS package', 'Weak default credentials', 'Insecure network policy'];

/** A real, deterministic finding list for one asset's detail view -- the
 * one place the "detected by multiple scanners" concept has to be visibly
 * true, not just present in the type. A finding flagged by 2+ of the
 * asset's own attached (completed) scanners gets multiple detectionSources;
 * everything else has exactly one. */
export function generateAggregatedFindings(asset: SourceAsset): AggregatedFinding[] {
  const rng = rngFor(asset.id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7) >>> 0);
  const completedScanners = asset.scanners.filter(s => s.status === 'completed').map(s => s.scanner);
  if (completedScanners.length === 0) return [];

  const count = Object.values(asset.bySeverity).reduce((a, b) => a + b, 0);
  const findings: AggregatedFinding[] = [];
  for (let i = 0; i < Math.min(count, 30); i++) {
    const severity = weightedPick(rng, SEVERITY_WEIGHTS);
    const multiSource = completedScanners.length > 1 && rng() < 0.35;
    const detectionSources = multiSource
      ? [...completedScanners].sort(() => rng() - 0.5).slice(0, 2 + Math.floor(rng() * (completedScanners.length - 1)))
      : [pick(rng, completedScanners)];
    findings.push({
      id: `${asset.id}-finding-${i}`,
      cve: rng() < 0.5 ? pick(rng, CVES) : null,
      title: pick(rng, FINDING_TITLES),
      severity,
      detectionSources,
      status: weightedPick(rng, [['open', 7], ['resolved', 4], ['suppressed', 1]] as const),
    });
  }
  return findings;
}

export interface CategoryOverviewStats {
  total: number;
  bySubType: { subType: string; count: number }[];
  bySeverity: Record<Severity, number>;
  staleOrFailedCount: number;
}

/** Fixed aggregate numbers, not derived by iterating every asset in the
 * category (which would defeat the point of never materializing the full
 * set) -- same convention as seed.ts's DEMO_TOTALS. */
export function generateCategoryOverviewStats(category: SourceCategory): CategoryOverviewStats {
  const config = SOURCE_CATEGORY_CONFIG[category];
  const rng = rngFor(500_000 + category.charCodeAt(0));
  const bySubType = config.subTypes.map(s => ({ subType: s.label, count: Math.round(config.total * (s.weight / 100)) }));
  const bySeverity: Record<Severity, number> = {
    critical: Math.round(config.total * 0.04 * (1 + rng() * 0.3)),
    high: Math.round(config.total * 0.18 * (1 + rng() * 0.3)),
    medium: Math.round(config.total * 0.55),
    low: Math.round(config.total * 0.9),
    informational: Math.round(config.total * 0.3),
  };
  return { total: config.total, bySubType, bySeverity, staleOrFailedCount: Math.round(config.total * 0.09) };
}
