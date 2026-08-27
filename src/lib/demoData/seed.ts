import type { VulnerabilityFinding } from '../api';
import { rngFor, pick, weightedPick, daysAgoISO } from './random';

/**
 * Deterministic synthetic data for demonstrating the Vulnerability
 * Management UI at enterprise scale (2,000+ AWS accounts, millions of
 * findings) without a single row ever touching a real API call or the real
 * database -- see DemoDataBanner/context.tsx for how this is surfaced and
 * gated. Every function here is pure: same inputs always produce the same
 * output, so a page doesn't visibly change numbers on re-render or when you
 * navigate back to it.
 *
 * Deliberately does NOT materialize millions of row objects in memory --
 * that would be slow and pointless, since DataTable's server mode only ever
 * renders one page's worth of rows into the DOM regardless of `total`.
 * Instead, `total` is a large, fixed, filter-aware number, and
 * `generateFindingsPage` synthesizes exactly one page's rows on demand,
 * seeded by (page, index) so a given page always shows the same rows.
 */

// ─── Fixed, realistic totals ────────────────────────────────────────────
// Not randomly generated -- these are the headline "enterprise scale"
// numbers the demo exists to show, held constant so KPI cards read
// consistently everywhere they're referenced.
export const DEMO_TOTALS = {
  awsAccounts: 2184,
  gcpProjects: 317,
  azureSubscriptions: 428,
  ociTenancies: 96,
  githubRepos: 4231,
  gitlabRepos: 1876,
  bitbucketRepos: 942,
  totalAssets: 184_620,
  totalFindings: 2_481_932,
  bySeverity: { critical: 18_204, high: 96_713, medium: 612_884, low: 1_402_611, informational: 351_520 },
  exploitable: 4_812,
  internetExposed: 9_340,
  byStatus: { open: 1_204_886, in_progress: 84_211, resolved: 1_142_390, suppressed: 50_445 },
  riskAccepted: 12_073,
  riskScore: 72,
};

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'informational'] as const;

const SOURCE_WEIGHTS: readonly [string, number][] = [
  ['AWS', 38], ['Azure', 14], ['GCP', 11], ['OCI', 3], ['Kubernetes', 8], ['Containers', 9],
  ['GitHub', 7], ['GitLab', 3], ['Bitbucket', 1], ['Applications', 3], ['APIs', 1],
  ['Servers', 1], ['On-Premise', 0.5], ['Domains / URLs', 0.5],
];

export function demoSourceDistribution(): { source: string; count: number }[] {
  const totalWeight = SOURCE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  return SOURCE_WEIGHTS.map(([source, w]) => ({ source, count: Math.round((w / totalWeight) * DEMO_TOTALS.totalFindings) }));
}

const CVES = ['CVE-2025-4127', 'CVE-2025-3011', 'CVE-2024-9821', 'CVE-2025-1188', 'CVE-2024-7734', 'CVE-2025-2290'];
const CWES = ['CWE-79', 'CWE-89', 'CWE-200', 'CWE-284', 'CWE-352', 'CWE-502', 'CWE-611', 'CWE-732'];
const TECHNOLOGIES = ['OpenSSL', 'log4j', 'nginx', 'Node.js', 'Python', 'jQuery', 'Spring Boot', 'Envoy', 'Docker Engine', 'PostgreSQL'];
const CATEGORIES = ['Public exposure', 'Excess privilege', 'Vulnerable dependency', 'Misconfiguration', 'Exposed secret', 'Outdated runtime'];
const ASSET_TYPES = ['EC2 Instance', 'S3 Bucket', 'Lambda Function', 'EKS Pod', 'Container Image', 'GitHub Repository', 'RDS Instance', 'IAM Role', 'API Gateway', 'Azure VM'];
const ENVIRONMENTS = ['production', 'staging', 'dev', 'sandbox'];
const SCANNERS = ['Security Hub', 'GuardDuty', 'Inspector', 'Trivy', 'Semgrep', 'Prowler', 'Checkov', 'Gitleaks', 'Grype', 'Nuclei'];
const OWNERS = ['Platform Team', 'AppSec Team', 'Cloud Infra Team', 'Unassigned', 'DevSecOps'];
const REMEDIATION_STATUSES = ['not_started', 'in_progress', 'fixed', 'wont_fix'] as const;
const FINDING_SOURCE_VALUES: VulnerabilityFinding['finding_source'][] = [
  'security_hub', 'guardduty', 'inspector', 'iam_access_analyzer', 'aws_config', 'gcp_scc', 'trivy',
];

/** Everything the real VulnerabilityFinding type has, plus the enterprise
 * columns section 5 asks for that don't exist on real findings today (CVE/
 * CWE/EPSS/exploit/exposure/asset-type/environment/owner/SLA/remediation
 * status) -- extends the real type so Screen 02's column set can accept
 * either a real or demo row through the same render functions, with the
 * real code path simply never populating the extra fields. */
export interface DemoFinding extends VulnerabilityFinding {
  cve: string | null;
  cwe: string | null;
  epss: number | null;
  exploitAvailable: boolean;
  internetExposed: boolean;
  assetType: string;
  environment: string;
  scanner: string;
  owner: string;
  slaDueAt: string | null;
  remediationStatus: typeof REMEDIATION_STATUSES[number];
}

export interface FindingsPresetFilter {
  preset?: 'critical' | 'exploitable' | 'new' | 'aging' | 'suppressed' | 'resolved';
  severity?: string;
  search?: string;
}

/** Ratio of DEMO_TOTALS.totalFindings a given preset/severity filter would
 * plausibly match -- fixed, not derived from a real backing array, since
 * none is ever materialized. */
function filteredTotal(filters: FindingsPresetFilter): number {
  if (filters.severity) return DEMO_TOTALS.bySeverity[filters.severity as keyof typeof DEMO_TOTALS.bySeverity] ?? 0;
  switch (filters.preset) {
    case 'critical': return DEMO_TOTALS.bySeverity.critical;
    case 'exploitable': return DEMO_TOTALS.exploitable;
    case 'new': return Math.round(DEMO_TOTALS.totalFindings * 0.02);
    case 'aging': return Math.round(DEMO_TOTALS.totalFindings * 0.08);
    case 'suppressed': return DEMO_TOTALS.byStatus.suppressed;
    case 'resolved': return DEMO_TOTALS.byStatus.resolved;
    default: return DEMO_TOTALS.totalFindings;
  }
}

function generateFinding(globalIndex: number, filters: FindingsPresetFilter): DemoFinding {
  const rng = rngFor(globalIndex);
  const severity: VulnerabilityFinding['severity'] = (filters.severity as VulnerabilityFinding['severity']) ?? (filters.preset === 'critical'
    ? 'critical'
    : weightedPick(rng, [['critical', 1], ['high', 5], ['medium', 32], ['low', 74], ['informational', 18]] as const));
  const status = filters.preset === 'resolved' ? 'resolved' : filters.preset === 'suppressed' ? 'suppressed' : weightedPick(rng, [['open', 7], ['resolved', 5], ['suppressed', 1]] as const);
  const exploitAvailable = filters.preset === 'exploitable' ? true : rng() < 0.04;
  const discoveredDaysAgo = filters.preset === 'new' ? Math.floor(rng() * 3) : filters.preset === 'aging' ? 120 + Math.floor(rng() * 400) : Math.floor(rng() * 365);
  const category = pick(rng, CATEGORIES);
  const technology = pick(rng, TECHNOLOGIES);
  const hasCve = rng() < 0.55;

  return {
    id: `demo-${globalIndex}`,
    connection_id: `demo-conn-${Math.floor(rng() * DEMO_TOTALS.awsAccounts)}`,
    resource_id: `demo-resource-${globalIndex}`,
    finding_source: pick(rng, FINDING_SOURCE_VALUES),
    aws_finding_id: null,
    severity,
    cvss_score: Math.round((rng() * 10) * 10) / 10,
    title: `${technology} — ${category}`,
    description: `${category} detected affecting ${technology}. Simulated finding for UI demonstration.`,
    compliance_frameworks: rng() < 0.3 ? ['cis_aws_foundations'] : [],
    status,
    remediation_link: null,
    region: pick(rng, ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', null]),
    resource_arn: null,
    discovered_at: new Date(Date.now() - discoveredDaysAgo * 24 * 60 * 60 * 1000).toISOString(),
    last_seen_at: daysAgoISO(rng, Math.min(discoveredDaysAgo, 5)),
    resolved_at: status === 'resolved' ? daysAgoISO(rng, discoveredDaysAgo) : null,
    cve: hasCve ? pick(rng, CVES) : null,
    cwe: pick(rng, CWES),
    epss: hasCve ? Math.round(rng() * 100) / 100 : null,
    exploitAvailable,
    internetExposed: rng() < 0.06,
    assetType: pick(rng, ASSET_TYPES),
    environment: pick(rng, ENVIRONMENTS),
    scanner: pick(rng, SCANNERS),
    owner: pick(rng, OWNERS),
    slaDueAt: status === 'open' && severity !== 'informational' ? daysAgoISO(rng, -14) : null,
    remediationStatus: status === 'resolved' ? 'fixed' : weightedPick(rng, [['not_started', 5], ['in_progress', 3], ['wont_fix', 1]] as const),
  };
}

export function generateFindingsPage(page: number, pageSize: number, filters: FindingsPresetFilter = {}): { items: DemoFinding[]; total: number } {
  const total = filteredTotal(filters);
  const start = (page - 1) * pageSize;
  const items: DemoFinding[] = [];
  for (let i = 0; i < pageSize && start + i < total; i++) {
    items.push(generateFinding(start + i, filters));
  }
  return { items, total };
}

export function generateFinding_forId(id: string): DemoFinding | null {
  const match = /^demo-(\d+)$/.exec(id);
  if (!match) return null;
  return generateFinding(Number(match[1]), {});
}

/** Top-N lists for the Executive Dashboard's risk-intelligence section --
 * fixed-count, cheap to generate directly rather than deriving from a page. */
export function demoTopCriticalAssets(n = 8): { resource: string; label: string; findingCount: number }[] {
  const rng = rngFor(900_001);
  return Array.from({ length: n }, (_, i) => ({
    resource: `demo-asset-${i}`,
    label: `${pick(rng, ASSET_TYPES)} — ${pick(rng, ['prod-cluster-01', 'billing-api', 'auth-service', 'data-lake', 'edge-gateway'])}`,
    findingCount: 40 - i * 4 + Math.floor(rng() * 5),
  }));
}

export function demoTopCVEs(n = 8): { cve: string; findingCount: number; severity: string }[] {
  const rng = rngFor(900_002);
  return CVES.slice(0, Math.min(n, CVES.length)).map((cve, i) => ({
    cve, findingCount: 1200 - i * 140 + Math.floor(rng() * 50), severity: i < 2 ? 'critical' : 'high',
  }));
}

export function demoTopTechnologies(n = 8): { technology: string; findingCount: number }[] {
  const rng = rngFor(900_003);
  return TECHNOLOGIES.slice(0, Math.min(n, TECHNOLOGIES.length)).map((technology, i) => ({
    technology, findingCount: 8000 - i * 700 + Math.floor(rng() * 200),
  }));
}

/** 30-day trend series for the Executive Dashboard's charts -- deterministic day-by-day counts. */
export function demoVulnerabilityTrend(days = 30): { date: string; newCount: number; fixedCount: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const rng = rngFor(910_000 + i);
    const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { date, newCount: 800 + Math.floor(rng() * 400), fixedCount: 700 + Math.floor(rng() * 450) };
  });
}
