import { afterEach, describe, expect, it, vi } from 'vitest';

import { isVulnerabilityDataEnabled } from './featureFlags';
import { NAV_MODULES } from './navConfig';
import { stripComments } from '../test/sourceCode';

/** Source-level guards must read code, never the prose documenting it. */
const code = stripComments;

/**
 * P0-A regression tests for the 2026-09-08 production-readiness audit:
 *
 * "Complete V2 isolation -- a V1 E2E/network test finds no V2 label, record,
 * count, route result, export, or request."
 *
 * Production observations recorded on 2026-09-08:
 * - 4,075 open vulnerability_findings rows came from V2 scanners/sources.
 * - Zero came from the audited V1 posture sources.
 * - V1 surfaces therefore previously exposed V2 counts such as the Overview
 *   critical-vulnerability KPI, Cloud Security Posture findings, and Issues
 *   queue entries.
 *
 * These are source-level regression tests. They complement API/integration
 * and end-to-end tests; they do not prove runtime/network isolation alone.
 */

const SOURCES = import.meta.glob(
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
    '../components/overview/widgets/securityWidgets.tsx',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(SOURCES).find(([path]) => path.endsWith(endsWith));

  expect(
    hit,
    `source not found for ${endsWith} -- did the file move?`,
  ).toBeTruthy();

  return hit![1];
}

function sectionAfter(sourceText: string, marker: string): string {
  const index = sourceText.indexOf(marker);

  expect(index, `section marker not found: ${marker}`).toBeGreaterThanOrEqual(0);

  return sourceText.slice(index);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isVulnerabilityDataEnabled', () => {
  it('is disabled in cloud-only V1 mode', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'true');

    expect(isVulnerabilityDataEnabled()).toBe(false);
  });

  it('remains enabled when cloud-only mode is explicitly disabled', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'false');

    expect(isVulnerabilityDataEnabled()).toBe(true);
  });

  it('does not treat arbitrary truthy strings as cloud-only mode', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'TRUE');

    expect(isVulnerabilityDataEnabled()).toBe(true);
  });
});

describe('V1 surfaces do not read V2 vulnerability data ungated', () => {
  it('gates Overview vulnerability dashboard and attack paths', () => {
    const src = code(source('overview/contextSignals.ts'));

    expect(src).toMatch(/isVulnerabilityDataEnabled\s*\(\s*\)/);
    expect(src).toMatch(
      /const\s+wantSecurity\s*=\s*isVulnerabilityDataEnabled\s*\(\s*\)\s*&&\s*can\.has\(\s*['"]security\.read['"]\s*\)/,
    );
    expect(src).toMatch(
      /wantSecurity\s*\?\s*api\.getVulnerabilityDashboard\s*\(\s*\)/,
    );
    expect(src).toMatch(/wantSecurity\s*\?\s*api\.getAttackPaths\s*\(\s*\)/);
  });

  it('gates the Overview Open Issues KPI from V2 findings', () => {
    const src = code(source('widgets/operationsWidgets.tsx'));
    const widget = sectionAfter(src, 'OpenIssuesKpi');

    expect(widget).toMatch(
      /isVulnerabilityDataEnabled\s*\(\s*\)\s*&&\s*ctx\.can\.has\(\s*['"]security\.read['"]\s*\)/,
    );
  });

  it('gates the Issues queue security source', () => {
    const src = code(source('pages/Issues.tsx'));

    expect(src).toMatch(
      /const\s+wantSecurity\s*=\s*isVulnerabilityDataEnabled\s*\(\s*\)/,
    );
    expect(src).toMatch(
      /wantSecurity\s*\?\s*api\.getFindings\s*\(/,
    );
  });

  it('removes the V2-driven posture dashboard and risk score from Cloud Security', () => {
    const src = code(source('pages/CloudSecurity.tsx'));

    expect(src).not.toMatch(/getVulnerabilityDashboard\s*\(/);
    expect(src).not.toMatch(/SecurityPostureSummary/);
    expect(src).not.toMatch(/Risk Score/);
  });

  it('keeps only V1 posture tabs in Cloud Security', () => {
    const src = code(source('pages/CloudSecurity.tsx'));
    const tabs = src.match(/const\s+TABS\s*=\s*\[([\s\S]*?)\]/);

    expect(tabs, 'Cloud Security TABS array not found').toBeTruthy();

    const tabSource = tabs![1];

    expect(tabSource).not.toMatch(/['"]Posture['"]/);

    for (const kept of [
      'Misconfigurations',
      'Identity & Access Risk',
      'Exposed Resources',
    ]) {
      expect(tabSource).toContain(kept);
    }
  });

  it('keeps Compliance out of Cloud Security', () => {
    const src = code(source('pages/CloudSecurity.tsx'));
    const tabs = src.match(/const\s+TABS\s*=\s*\[([\s\S]*?)\]/);

    expect(tabs, 'Cloud Security TABS array not found').toBeTruthy();
    expect(tabs![1]).not.toContain("'Compliance'");
    expect(src).not.toMatch(/getComplianceBenchmarks\s*\(/);
  });

  it('keeps V2 compliance endpoint calls out of V1 surfaces', () => {
    for (const file of [
      'pages/CloudSecurity.tsx',
      'components/overview/widgets/securityWidgets.tsx',
    ]) {
      const src = code(source(file));

      expect(
        src,
        `${file} still calls the V2 compliance endpoint`,
      ).not.toMatch(/getComplianceBenchmarks\s*\(/);
    }
  });

  it('requires the Overview compliance widget to communicate availability', () => {
    const src = code(source('components/overview/widgets/securityWidgets.tsx'));

    expect(src).toMatch(/getComplianceOverview\s*\(/);
    expect(src).toMatch(/availability\.message/);
  });

  it('uses Source Coverage rather than the misleading Multi-Cloud Coverage label', () => {
    const src = code(source('pages/CloudSecurity.tsx'));
    const tabs = src.match(/const\s+TABS\s*=\s*\[([\s\S]*?)\]/);

    expect(tabs, 'Cloud Security TABS array not found').toBeTruthy();
    expect(tabs![1]).toContain('Source Coverage');
    expect(tabs![1]).not.toContain('Multi-Cloud Coverage');
  });

  it('gates Overview Recommended Actions from V2 critical findings', () => {
    const src = code(source('widgets/operationsWidgets.tsx'));
    const widget = sectionAfter(src, 'RecommendedActionsWidget');

    expect(widget).toMatch(
      /isVulnerabilityDataEnabled\s*\(\s*\)\s*&&\s*ctx\.can\.has\(\s*['"]security\.read['"]\s*\)/,
    );
  });

  it('gates the Cloud Accounts Overview security dashboard and section', () => {
    const src = code(source('cloudAccounts/OverviewPanel.tsx'));

    // The flag is read once per render and that one value gates BOTH the
    // fetch and the render, so the two cannot disagree. Asserted as three
    // facts rather than one expression shape: hoisting the flag into a
    // variable is a legitimate refactor; dropping either gate is not.
    const flag = /(\w+)\s*=\s*isVulnerabilityDataEnabled\s*\(\s*\)/.exec(src);

    expect(flag, 'OverviewPanel no longer evaluates the V2 gate').toBeTruthy();

    const gate = flag![1];

    expect(src, 'the V2 dashboard fetch is no longer gated').toMatch(
      new RegExp(
        gate + String.raw`\s*&&\s*canSecurity\s*\?\s*api\.getVulnerabilityDashboard\s*\(`,
      ),
    );

    expect(src, 'the security section renders without the V2 gate').toMatch(
      new RegExp(
        gate + String.raw`\s*\?\s*\(\s*<SectionBoundary\s+name=["']security["']>`,
      ),
    );
  });

  it('does not convert unavailable SecurityPanel data into a clean result', () => {
    const src = code(source('overview/SecurityPanel.tsx'));

    expect(src).toMatch(/if\s*\(\s*!security\s*\)\s*\{/);
    expect(src).toMatch(/Not available/);
    expect(src).toMatch(/if\s*\(\s*openFindings\s*===\s*0\s*\)\s*\{/);
    expect(src).not.toMatch(/!security\s*\|\|\s*openFindings\s*===\s*0/);
    expect(src).not.toMatch(/\/vulnerability-management/);
  });

  it('does not render a V2 open-findings count in custom dashboards', () => {
    const src = code(source('pages/CustomDashboards.tsx'));

    expect(src).not.toMatch(/Open Security Findings/);
    expect(src).not.toMatch(/data\.openFindings\.toLocaleString\s*\(/);
  });
});

describe('no direct provider mutation is reachable in V1', () => {
  const src = code(source('pages/CostOptimization.tsx'));

  it('offers no automated-resize request action', () => {
    expect(src).not.toMatch(/Request Automated Resize/);
    expect(src).not.toMatch(/requestRemediation\s*\(/);
    expect(src).not.toMatch(/onRequestResize/);
  });

  it('does not poll or run jobs against the gated remediation pathway', () => {
    expect(src).not.toMatch(/finishResizeRemediation\s*\(/);
    expect(src).not.toMatch(/listRemediation\s*\(/);
  });

  it('retains V1-permitted manual/IaC alternatives', () => {
    expect(src).toMatch(/aws ec2 modify-instance-attribute/);
    expect(src).toMatch(/openAutoPr\s*\(/);
  });
});

describe('destructive actions are protected (Phase 0.6)', () => {
  const src = code(source('pages/CloudAccounts.tsx'));

  it('offers no bulk permanent delete', () => {
    expect(src).not.toMatch(/handleBulkDeletePermanently/);
    expect(src).not.toMatch(/selected permanently/);
  });

  it('calls no permanent-delete API', () => {
    expect(src).not.toMatch(
      /deleteAccountPermanently\s*\(|deleteGcpAccountPermanently\s*\(|deleteAzureAccountPermanently\s*\(/,
    );
  });

  it('keeps reversible Disconnect actions', () => {
    expect(src).toMatch(/handleDisconnect/);
    expect(src).toMatch(/handleBulkDisconnect/);
  });
});

describe('navigation does not dead-end into gated V2 routes', () => {
  it('gives Cloud Compliance its own canonical route', () => {
    const module = NAV_MODULES.find(item => item.label === 'Cloud Compliance');

    expect(module).toBeTruthy();
    expect(module!.to).toBe('/cloud-compliance');
  });

  it('has exactly one navigation module rooted at Cloud Security', () => {
    const onCloudSecurity = NAV_MODULES.filter(item =>
      item.to?.startsWith('/cloud-security'),
    );

    expect(onCloudSecurity.map(item => item.label)).toEqual([
      'Cloud Security',
    ]);
  });

  it('keeps visible V1 navigation away from the gated Vulnerability Management route', () => {
    const visibleInV1 = NAV_MODULES.filter(
      item => !item.hiddenInCloudOnlyMode,
    );

    const offenders = visibleInV1.filter(item =>
      item.to?.startsWith('/vulnerability-management'),
    );

    expect(offenders.map(item => item.label)).toEqual([]);
  });
});
