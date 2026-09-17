import { describe, expect, it } from 'vitest';
import { stripComments } from '../test/sourceCode';

/** Source-level guards must read code, never the prose documenting it. */
const code = stripComments;

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
      // The alternate branch must be `null`, not a retained message. Bounded
      // and non-greedy so the colon inside the message text ("Couldn't
      // load: ...") does not terminate the match early.
      /failed\.length\s*>\s*0[\s\S]{0,80}?\?[\s\S]{0,400}?:\s*null/,
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
     *
     * Derived from the destructuring rather than a hardcoded name list, so
     * renaming a dependency cannot quietly drop it from this guard, and
     * ADDING one is covered the moment it appears.
     */
    const destructured =
      /const\s*\[([^\]]+)\]\s*=\s*await\s+Promise\.allSettled/.exec(detail);

    expect(
      destructured,
      'AwsAccountDetail no longer loads its dependencies with Promise.allSettled',
    ).toBeTruthy();

    const names = destructured![1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);

    expect(names.length).toBeGreaterThanOrEqual(4);

    for (const name of names) {
      expect(
        detail,
        `${name} is used without checking its settled status`,
      ).toMatch(new RegExp(`\\b${name}\\.status\\b`));
    }
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
      // The row variable may be named anything; what matters is that the
      // read-only flag reaches the SERVER call rather than being applied
      // after the fact in the browser.
      /getAccountCloudTrailEvents\(\s*\w+(?:\.\w+|\?\.\w+)*\s*,\s*\{\s*includeReadOnly\s*\}\s*,?\s*\)/,
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
    expect(panel).toMatch(/CloudTrail events, including read/i);
  });

  it('explains why the empty state may not mean no activity occurred', () => {
    // An empty "Changes" list must say WHY it may be empty -- reads are
    // filtered out by default, so "no changes" is not "no activity".
    expect(panel).toMatch(/Read-only[\w\s]*calls are hidden/i);
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
