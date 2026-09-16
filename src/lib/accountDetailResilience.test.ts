import { describe, expect, it } from 'vitest';

/**
 * AWS-P1-06 / AWS-P1-05 regression tests.
 *
 * These tests intentionally inspect the production source as raw text because
 * the audit requirement is architectural: the AWS account detail page must
 * isolate independent dependency failures with Promise.allSettled, while the
 * Changes panel must pass the read-only filter through to the server and
 * include that filter in its query identity.
 *
 * The account/connection dependency remains fatal because the page cannot
 * render meaningful account detail without the account itself.
 */

const sources = import.meta.glob(
  [
    '../pages/AwsAccountDetail.tsx',
    '../components/cloudAccounts/ChangesPanel.tsx',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function source(endsWith: string): string {
  const entry = Object.entries(sources).find(([path]) =>
    path.endsWith(endsWith),
  );

  expect(
    entry,
    `source not found for ${endsWith}`,
  ).toBeTruthy();

  return entry?.[1] ?? '';
}

/**
 * Remove comments before checking architectural source patterns.
 *
 * This avoids a commented-out Promise.all or explanatory prose satisfying a
 * regression assertion accidentally.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function code(text: string): string {
  return stripComments(text);
}

function detailSource(): string {
  return code(source('/AwsAccountDetail.tsx'));
}

function changesPanelSource(): string {
  return code(source('/ChangesPanel.tsx'));
}

describe('AWS account detail — dependency isolation', () => {
  const detail = detailSource();

  it('loads independent dependencies with Promise.allSettled rather than Promise.all', () => {
    expect(detail).toMatch(/Promise\.allSettled\(\s*\[/);
    expect(detail).not.toMatch(/Promise\.all\(\s*\[/);
  });

  it('keeps the account/connection dependency fatal', () => {
    /**
     * Inventory, cost, and credential-summary failures should degrade their
     * own sections. The connection itself cannot be optional because the page
     * has no meaningful account context without it.
     */
    expect(detail).toMatch(
      /connRes\.status\s*===\s*['"]rejected['"]/,
    );
  });

  it('records an explicit failure for resource inventory', () => {
    expect(detail).toMatch(
      /failed\.push\(\s*['"]resource inventory['"]\s*\)/,
    );
  });

  it('records an explicit failure for cost data', () => {
    expect(detail).toMatch(
      /failed\.push\(\s*['"]cost data['"]\s*\)/,
    );
  });

  it('records an explicit failure for credential summary', () => {
    expect(detail).toMatch(
      /failed\.push\(\s*['"]credential summary['"]\s*\)/,
    );
  });

  it('communicates that the remaining sections are real loaded data', () => {
    expect(detail).toMatch(
      /Everything else on this page is real, loaded data/,
    );
  });

  it('clears the aggregate error when no dependency failed', () => {
    /**
     * A stale banner from an earlier failed attempt must not survive a fully
     * successful retry.
     */
    expect(detail).toMatch(
      /failed\.length\s*>\s*0[\s\S]{0,250}\?\s*[^:;]+:\s*null/,
    );
  });

  it('does not use a bare generic failure label for all dependency failures', () => {
    /**
     * Subject-specific failure labels make an unavailable section
     * distinguishable from a legitimate empty state.
     */
    const genericFailurePatterns = [
      /failed\.push\(\s*['"]Couldn't load['"]\s*\)/i,
      /failed\.push\(\s*['"]load failed['"]\s*\)/i,
    ];

    for (const pattern of genericFailurePatterns) {
      expect(detail).not.toMatch(pattern);
    }
  });

  it('keeps dependency-result handling tied to settled statuses', () => {
    /**
     * Guard against accidentally reverting to unchecked `.value` access,
     * which would reintroduce the original all-or-nothing failure behavior.
     */
    expect(detail).toMatch(/connRes\.status/);
    expect(detail).toMatch(/invRes\.status/);
    expect(detail).toMatch(/costRes\.status/);
    expect(detail).toMatch(/credRes\.status/);
  });
});

describe('Cloud Accounts Changes panel — default visibility and server-side filtering', () => {
  const panel = changesPanelSource();

  it('defaults read-only events to hidden', () => {
    expect(panel).toMatch(/useState\(\s*false\s*\)/);
    expect(panel).toMatch(/includeReadOnly/);
  });

  it('passes includeReadOnly to the server query', () => {
    expect(panel).toMatch(
      /getAccountCloudTrailEvents\(\s*row\.id\s*,\s*\{\s*includeReadOnly\s*\}\s*\)/,
    );
  });

  it('does not rely on browser-side filtering to remove read-only events', () => {
    /**
     * The intended contract is server-side filtering. A client filter alone
     * would still transfer unnecessary rows and could diverge from backend
     * semantics.
     */
    expect(panel).not.toMatch(
      /\.filter\(\s*[^)]*read.?only[^)]*\)/i,
    );
  });

  it('includes includeReadOnly in the query key so the toggle refetches data', () => {
    expect(panel).toMatch(
      /queryKey\s*:\s*\[[\s\S]{0,500}?includeReadOnly[\s\S]{0,200}?\]/,
    );
  });

  it('describes the configuration-change view', () => {
    expect(panel).toMatch(/CloudTrail configuration changes/);
  });

  it('describes the expanded events view', () => {
    expect(panel).toMatch(/CloudTrail events, including reads/);
  });

  it('explains why the empty state may not mean no activity occurred', () => {
    expect(panel).toMatch(/Read-only calls are hidden/);
  });

  it('keeps the toggle state in the rendered source path', () => {
    /**
     * This catches a regression where includeReadOnly exists only in the
     * query layer but the UI no longer exposes a way to change it.
     */
    expect(panel).toMatch(/setIncludeReadOnly/);
    expect(panel).toMatch(/includeReadOnly\s*\?/);
  });
});
