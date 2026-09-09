import { describe, it, expect, afterEach, vi } from 'vitest';
import { isVulnerabilityDataEnabled } from './featureFlags';
import { NAV_MODULES } from './navConfig';

/**
 * P0-A regression tests for the 2026-09-08 production-readiness audit's
 * first release gate: "Complete V2 isolation -- a V1 E2E/network test finds
 * no V2 label, record, count, route result, export, or request."
 *
 * Verified against production the same day: all 4,075 open rows in
 * vulnerability_findings come from trivy / scanner_trufflehog /
 * scanner_checkov / scanner_grype / scanner_trivy / scanner_semgrep, and
 * ZERO come from the V1 posture sources (aws_config, iam_access_analyzer,
 * gcp_scc, defender). So any V1 surface reading that table is showing 100%
 * V2 data -- which is how Overview showed "167 critical vulnerabilities
 * open", Cloud Security's Posture tab showed 3,615 findings, and the Issues
 * queue showed ~3,619 open items when the real V1 work queue was 4.
 *
 * Gating the V2 *routes* (App.tsx redirects) did not fix this, because each
 * of these surfaces called the V2 APIs directly. These tests assert the
 * call sites stay gated, using the same `?raw` source-import technique
 * navConfig.test.ts already uses to assert App.tsx invariants.
 */
const sources = import.meta.glob(
  [
    '../lib/overview/contextSignals.ts',
    '../components/overview/widgets/operationsWidgets.tsx',
    '../pages/Issues.tsx',
    '../pages/CloudSecurity.tsx',
    '../pages/CustomDashboards.tsx',
    '../components/cloudAccounts/OverviewPanel.tsx',
    '../components/cloudAccounts/overview/SecurityPanel.tsx',
    '../pages/CostOptimization.tsx',
    '../pages/CloudAccounts.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([path]) => path.endsWith(endsWith));
  expect(hit, `source not found for ${endsWith} -- did the file move?`).toBeTruthy();
  return hit![1];
}

/** Strips line/block comments so a doc comment mentioning an API name isn't mistaken for a call site. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isVulnerabilityDataEnabled', () => {
  it('is off in cloud-only mode, which is the real production V1 setting', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'true');
    expect(isVulnerabilityDataEnabled()).toBe(false);
  });

  it('is on when cloud-only mode is off, so a full-nav build still works', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'false');
    expect(isVulnerabilityDataEnabled()).toBe(true);
  });
});

describe('V1 surfaces do not read V2 vulnerability data ungated', () => {
  it('Overview context signals gate the vulnerability dashboard and attack paths (the "167 critical vulnerabilities open" banner)', () => {
    const src = code(source('overview/contextSignals.ts'));
    expect(src).toMatch(/isVulnerabilityDataEnabled\(\)/);
    // The two V2 calls must sit behind wantSecurity, which is now gated.
    expect(src).toMatch(/const wantSecurity = isVulnerabilityDataEnabled\(\) && can\.has\('security\.read'\)/);
    expect(src).toMatch(/wantSecurity \? api\.getVulnerabilityDashboard\(\)/);
    expect(src).toMatch(/wantSecurity \? api\.getAttackPaths\(\)/);
  });

  it('the Overview Open Issues KPI excludes V2 findings from its count', () => {
    const src = code(source('widgets/operationsWidgets.tsx'));
    const kpi = src.slice(src.indexOf('OpenIssuesKpi'));
    expect(kpi).toMatch(/isVulnerabilityDataEnabled\(\) && ctx\.can\.has\('security\.read'\)/);
  });

  it('the Issues queue gates its security source', () => {
    const src = code(source('pages/Issues.tsx'));
    expect(src).toMatch(/const wantSecurity = isVulnerabilityDataEnabled\(\)/);
    expect(src).toMatch(/wantSecurity\s*\n?\s*\? api\.getFindings/);
  });

  it('Cloud Security no longer renders the V2-driven posture dashboard or risk score', () => {
    const src = code(source('pages/CloudSecurity.tsx'));
    expect(src).not.toMatch(/getVulnerabilityDashboard/);
    expect(src).not.toMatch(/SecurityPostureSummary/);
    expect(src).not.toMatch(/Risk Score/);
  });

  it('Cloud Security keeps only V1 posture tabs -- no Posture tab, and the real provider-native ones remain', () => {
    const src = code(source('pages/CloudSecurity.tsx'));
    const tabs = src.match(/const TABS = \[([^\]]+)\]/);
    expect(tabs, 'TABS array not found').toBeTruthy();
    expect(tabs![1]).not.toMatch(/'Posture'/);
    for (const kept of ['Misconfigurations', 'Identity & Access Risk', 'Exposed Resources']) {
      expect(tabs![1]).toContain(kept);
    }
  });

  it('Cloud Security no longer hosts Compliance (Phase 10, §10.1)', () => {
    // Compliance is its own module now. Keeping it here is what made two
    // sidebar entries resolve to /cloud-security and both mark themselves
    // aria-current -- a query param cannot separate two business domains.
    const src = code(source('pages/CloudSecurity.tsx'));
    const tabs = src.match(/const TABS = \[([^\]]+)\]/);
    expect(tabs![1]).not.toContain("'Compliance'");
    // And it must not still be fetching the data that moved with it.
    expect(src).not.toMatch(/getComplianceBenchmarks/);
  });

  it('renames Multi-Cloud Coverage to Source Coverage', () => {
    // The audit's name, and the honest one: the tab answers which sources
    // have been evaluated, not how many clouds exist.
    const src = code(source('pages/CloudSecurity.tsx'));
    const tabs = src.match(/const TABS = \[([^\]]+)\]/);
    expect(tabs![1]).toContain('Source Coverage');
    expect(tabs![1]).not.toContain('Multi-Cloud Coverage');
  });

  it('the Overview Recommended Actions widget excludes V2 critical findings', () => {
    // module: null in registryMeta, so unlike the security widgets this one
    // is NOT removed by getEnabledModules() in cloud-only mode -- it needs
    // its own gate or it renders CVEs as "Critical finding" on V1 Overview.
    const src = code(source('widgets/operationsWidgets.tsx'));
    const widget = src.slice(src.indexOf('RecommendedActionsWidget'));
    expect(widget).toMatch(/isVulnerabilityDataEnabled\(\) && ctx\.can\.has\('security\.read'\)/);
  });

  it('Cloud Accounts Overview gates the V2 dashboard and omits Security & Risk when gated', () => {
    const src = code(source('cloudAccounts/OverviewPanel.tsx'));
    expect(src).toMatch(/isVulnerabilityDataEnabled\(\) && canSecurity \? api\.getVulnerabilityDashboard\(\)/);
    // The section itself must not render at all while gated -- rendering it
    // with null data produced a false "No open findings" claim.
    expect(src).toMatch(/isVulnerabilityDataEnabled\(\) && \(\s*<SectionBoundary name="security">/);
  });

  it('SecurityPanel never reports unavailable data as "no open findings" (false-clean)', () => {
    const src = code(source('overview/SecurityPanel.tsx'));
    // Null (not fetched / denied / failed) and a genuine zero must be
    // distinct branches, and the null branch must not claim nothing was found.
    expect(src).toMatch(/if \(!security\) \{/);
    expect(src).toMatch(/Not available/);
    expect(src).toMatch(/if \(openFindings === 0\) \{/);
    expect(src).not.toMatch(/!security \|\| openFindings === 0/);
    // and its links must not dead-end into the gated route
    expect(src).not.toMatch(/\/vulnerability-management/);
  });

  it('the custom-dashboard findings widget no longer renders a V2 count', () => {
    const src = code(source('pages/CustomDashboards.tsx'));
    expect(src).not.toMatch(/Open Security Findings/);
    expect(src).not.toMatch(/data\.openFindings\.toLocaleString/);
  });
});

describe('no direct provider mutation is reachable in V1', () => {
  // 2026-09-08 audits, P0: "No direct provider mutation ships in V1."
  // Executing a resize used the SAME stored credential as read-only
  // collection, with no separate execution identity, certified worker,
  // canary, emergency stop, or provider-verified outcome.
  const src = code(source('pages/CostOptimization.tsx'));

  it('offers no automated-resize request action', () => {
    expect(src).not.toMatch(/Request Automated Resize/);
    expect(src).not.toMatch(/requestRemediation\(/);
    expect(src).not.toMatch(/onRequestResize/);
  });

  it('runs no background poll or job against the gated remediation pathway', () => {
    // The audits' definition of gating explicitly includes "no background
    // fetch or job" -- an 8s interval silently polling a 403 would not pass.
    expect(src).not.toMatch(/finishResizeRemediation\(/);
    expect(src).not.toMatch(/listRemediation\(/);
  });

  it('still offers the V1-permitted alternatives (manual CLI guidance and a real IaC pull request)', () => {
    expect(src).toMatch(/aws ec2 modify-instance-attribute/);
    expect(src).toMatch(/openAutoPr\(/);
  });
});

describe('destructive actions are protected (Phase 0.6)', () => {
  // 2026-09-08 audits, P0: permanent purge removed a connection, its
  // resources and all history behind one generic Confirm; bulk delete could
  // do that to several accounts without ever naming them. Disposition:
  // "Disable by default". Purge is now denied server-side in all three
  // connectors; these assert the client can't offer it either.
  const src = code(source('pages/CloudAccounts.tsx'));

  it('offers no bulk permanent delete', () => {
    expect(src).not.toMatch(/handleBulkDeletePermanently/);
    expect(src).not.toMatch(/selected permanently/);
  });

  it('calls no permanent-delete API at all', () => {
    expect(src).not.toMatch(/deleteAccountPermanently|deleteGcpAccountPermanently|deleteAzureAccountPermanently/);
  });

  it('keeps Disconnect, which is reversible and preserves history', () => {
    expect(src).toMatch(/handleDisconnect/);
    expect(src).toMatch(/handleBulkDisconnect/);
  });
});

describe('navigation does not dead-end into gated V2 routes', () => {
  it('Cloud Compliance has its own canonical route (Phase 10, §10.2)', () => {
    const mod = NAV_MODULES.find(m => m.label === 'Cloud Compliance');
    expect(mod).toBeTruthy();
    // This link has moved twice. It was /vulnerability-management?tab=
    // Compliance, whose redirect dropped the tab and landed on Cloud
    // Security's Overview. It was then repointed at Cloud Security's
    // Compliance TAB, which fixed the dead end but left two nav entries
    // resolving to /cloud-security -- so both marked themselves active.
    // Only a distinct route separates two modules.
    expect(mod!.to).toBe('/cloud-compliance');
  });

  it('exactly one nav module resolves to /cloud-security', () => {
    // The regression guard for the aria-current bug, asserted on the data
    // rather than on the rendering.
    const onCloudSecurity = NAV_MODULES.filter(m => m.to?.startsWith('/cloud-security'));
    expect(onCloudSecurity.map(m => m.label)).toEqual(['Cloud Security']);
  });

  it('no cloud-only-visible module points at a gated /vulnerability-management route', () => {
    // Vulnerability Management itself still carries that `to` on purpose:
    // it is hiddenInCloudOnlyMode, and navConfig deliberately keeps it in
    // NAV_MODULES so ProtectedRoute's separate label lookup still resolves.
    // The invariant that matters is that no module a V1 user can actually
    // SEE routes them into the gated surface.
    const visibleInV1 = NAV_MODULES.filter(m => !m.hiddenInCloudOnlyMode);
    const offenders = visibleInV1.filter(m => m.to?.startsWith('/vulnerability-management'));
    expect(offenders.map(m => m.label)).toEqual([]);
  });
});
