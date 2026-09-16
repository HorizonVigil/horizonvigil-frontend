import { describe, expect, it } from 'vitest';

/**
 * Phase 1 containment invariants (2026-09-08 AWS connector audit).
 *
 * These are source-level regression tests for browser/server responsibility
 * boundaries. They deliberately inspect the relevant source files instead of
 * mounting the complete auth/org/API stack just to prove that a browser timer
 * or orchestration loop does not exist.
 *
 * Protected invariants:
 * - AWS provider collection is never started automatically by the browser.
 * - The AWS connect wizard cannot default to an uncertified connection method.
 * - Duplicate connections are surfaced as conflicts, never silently rotated.
 * - CUR ingestion is server-owned and represented by a durable job.
 *
 * Keep these tests focused on observable architectural contracts. A future
 * implementation may rename internal functions, but it must preserve the
 * boundary asserted by the tests.
 */

const sources = import.meta.glob(
  [
    './syncContext.tsx',
    '../components/ConnectAwsAccountWizard.tsx',
    '../pages/AwsAccountDetail.tsx',
    './api.ts',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([filePath]) =>
    filePath.endsWith(endsWith),
  );

  expect(
    hit,
    `source not found for ${endsWith}; verify the glob path and repository layout`,
  ).toBeTruthy();

  return hit![1];
}

/**
 * Remove comments before source assertions.
 *
 * This prevents a comment containing an old function name, timer, or PRD
 * reference from satisfying/failing a production invariant accidentally.
 *
 * The scanner intentionally handles:
 * - line comments
 * - block comments
 * - template literals conservatively (template contents are retained because
 *   customer-facing source text is itself part of some assertions)
 */
function code(text: string): string {
  return text
    .replace(
      /\/\*[\s\S]*?\*\//g,
      ' ',
    )
    .replace(
      /(^|[^:\\])\/\/.*$/gm,
      '$1 ',
    );
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function hasLiteral(text: string, value: string): boolean {
  return text.includes(value);
}

describe('browser collection ownership', () => {
  const sync = code(source('/syncContext.tsx'));
  const compactSync = compact(sync);

  it('has no automatic 24-hour synchronization interval', () => {
    expect(compactSync).not.toMatch(
      /setInterval\s*\([^)]*(?:24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|86_400_000)/,
    );
    expect(compactSync).not.toMatch(/(?:24h|24-hour|daily)\s*auto[-_ ]?sync/i);
  });

  it('has no post-login delayed discovery sweep', () => {
    expect(sync).not.toMatch(/\brunAutoSync\b/);
    expect(sync).not.toMatch(/\bstaleAccounts\b/);
    expect(sync).not.toMatch(/\bsetTimeout\s*\(/);
  });

  it('does not enumerate all cloud connections merely to choose stale scans', () => {
    expect(sync).not.toMatch(/\bgetGcpAccounts\s*\(/);
    expect(sync).not.toMatch(/\bgetAzureAccounts\s*\(/);
    expect(sync).not.toMatch(/\bfetchAllPages\s*\(/);
  });

  it('does not orchestrate individual collection steps in the browser', () => {
    expect(sync).not.toMatch(/\bgetDiscoverySteps\s*\(/);
    expect(sync).not.toMatch(/\brunDiscoveryStep\s*\(/);
    expect(sync).not.toMatch(/\bfinalizeDiscovery\s*\(/);
    expect(sync).not.toMatch(/\bstepErrors\b/);

    expect(sync).toMatch(/\bstartCollectionRun\s*\(/);
    expect(sync).toMatch(/\bgetCollectionRun\s*\(/);
  });

  it('does not use a second in-memory scan set as the source of truth', () => {
    expect(sync).not.toMatch(
      /\b(?:Set|Map)\s*<[^>]*(?:scan|sync|connection)[^>]*>\s*\(\)/i,
    );
    expect(sync).not.toMatch(
      /\b(?:scanning|syncing|activeScans|activeSyncs)\s*=\s*new\s+(?:Set|Map)\b/i,
    );
  });

  it('treats only SUCCEEDED as completed', () => {
    expect(compactSync).toMatch(
      /run\.status\s*===\s*['"]SUCCEEDED['"]\s*\?\s*['"]done['"]\s*:\s*['"]error['"]/,
    );
    expect(compactSync).not.toMatch(
      /run\.status\s*!==\s*['"]FAILED['"].*['"]done['"]/,
    );
  });

  it('does not fabricate completion from partial progress', () => {
    expect(compactSync).not.toMatch(
      /(?:PARTIALLY_SUCCEEDED|PARTIAL).*['"]done['"]/,
    );
  });
});

describe('AWS connection wizard safety', () => {
  const wizard = code(
    source('/ConnectAwsAccountWizard.tsx'),
  );
  const compactWizard = compact(wizard);

  it('defaults to the certified access-key method', () => {
    expect(compactWizard).toMatch(
      /useState<['"]access_key['"]\s*\|\s*['"]cross_account_role['"]>\(\s*['"]access_key['"]\s*\)/,
    );
  });

  it('keeps the uncertified cross-account-role option disabled', () => {
    expect(compactWizard).toMatch(
      /disabled\s*(?:=\s*\{?\s*true\s*\}?|aria-disabled\s*=\s*['"]true['"])/,
    );
  });

  it('does not present the disabled cross-account method as Recommended', () => {
    expect(wizard).not.toMatch(/Recommended/i);
  });

  it('does not expose internal PRD section references in customer-facing copy', () => {
    expect(wizard).not.toMatch(/§\s*\d+(?:\.\d+)*/);
  });

  it('does not include implementation-only audit wording in visible wizard copy', () => {
    expect(wizard).not.toMatch(
      /\b(?:P0|P1|AWS-P0|Phase\s+\d+|internal\s+PRD|audit\s+invariant)\b/i,
    );
  });
});

describe('duplicate AWS connection handling', () => {
  const wizard = code(
    source('/ConnectAwsAccountWizard.tsx'),
  );
  const compactWizard = compact(wizard);

  it('does not mutate credentials or roles from the create flow', () => {
    expect(wizard).not.toMatch(/\bupdateAccountCredentials\s*\(/);
    expect(wizard).not.toMatch(/\bupdateAccountRole\s*\(/);
  });

  it('does not infer duplicate intent from a database constraint name', () => {
    expect(wizard).not.toMatch(
      /cloud_connections_org_id_aws_account_id_key/,
    );
  });

  it('handles the server conflict response explicitly', () => {
    expect(compactWizard).toMatch(
      /status\s*===\s*409/,
    );
    expect(wizard).toMatch(/connection_already_exists/);
    expect(compactWizard).toMatch(
      /setDuplicate\s*\(\s*conflict\s*\)/,
    );
  });

  it('does not automatically retry a duplicate create as an update', () => {
    expect(compactWizard).not.toMatch(
      /409[\s\S]{0,1200}(?:updateAccountCredentials|updateAccountRole)/,
    );
  });
});

describe('CUR ingestion ownership', () => {
  const detail = code(source('/AwsAccountDetail.tsx'));
  const apiSource = code(source('/api.ts'));

  const compactDetail = compact(detail);
  const compactApi = compact(apiSource);

  it('does not loop report files or row chunks in the browser', () => {
    expect(detail).not.toMatch(/\bingestCurStep\b/);
    expect(detail).not.toMatch(/\bskipRows\b/);
    expect(detail).not.toMatch(/\bgetCurManifest\b/);
  });

  it('does not expose the removed browser CUR orchestration helpers', () => {
    for (const method of [
      'getCurManifest',
      'ingestCurStep',
      'finalizeCur',
    ]) {
      expect(
        hasLiteral(apiSource, `${method}(`),
        `${method} still present in api.ts`,
      ).toBe(false);
    }
  });

  it('allows one-shot server-side CUR discovery', () => {
    expect(apiSource).toMatch(/\bdiscoverCur\b/);

    expect(detail).not.toMatch(
      /\bfor\s*\([^)]*\bmanifest\b/i,
    );
    expect(detail).not.toMatch(
      /\bwhile\s*\([^)]*(?:chunk|offset|skipRows)/i,
    );
  });

  it('starts CUR ingestion as a durable server job', () => {
    expect(compactApi).toMatch(
      /startCurRun\s*\(/,
    );
    expect(compactDetail).toMatch(
      /api\.startCurRun\s*\(\s*id\s*\)/,
    );
  });

  it('polls the durable collection run instead of driving ingestion steps', () => {
    expect(compactDetail).toMatch(
      /api\.getCollectionRun\s*\(\s*run\.id\s*\)/,
    );
  });

  it('does not carry a browser-managed row offset through render state', () => {
    expect(detail).not.toMatch(
      /\b(?:rowOffset|row_offset|nextOffset|skipRows)\b/,
    );
  });

  it('treats partial ingestion as incomplete', () => {
    expect(detail).toMatch(/\bPARTIALLY_SUCCEEDED\b/);
    expect(compactDetail).not.toMatch(
      /PARTIALLY_SUCCEEDED[^;]{0,200}(?:success|done|complete)/i,
    );
  });
});
