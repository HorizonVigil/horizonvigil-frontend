import { describe, it, expect } from 'vitest';

/**
 * Phase 1 containment invariants (2026-09-08 AWS connector audit).
 *
 * AWS-P0-01: the browser started real provider discovery on its own -- a
 * sweep 3 seconds after login plus a 24-hour interval, iterating every stale
 * connection and running a 1,628-step scan from the tab, with only an
 * in-memory per-tab Set as a guard. Two tabs or two users could start
 * overlapping scans of the same account with no lock, no checkpoint, and no
 * way to resume when the tab closed.
 *
 * AWS-P0-02/03: the wizard defaulted to an un-wired connection method and
 * turned a duplicate-create conflict into a silent credential rotation.
 *
 * Source-level assertions, the same technique navConfig.test.ts uses for
 * App.tsx invariants: the alternative is standing up the whole auth/org/API
 * stack to observe that a timer does NOT fire.
 */
const sources = import.meta.glob(['./syncContext.tsx', '../components/ConnectAwsAccountWizard.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([path]) => path.endsWith(endsWith));
  expect(hit, `source not found for ${endsWith}`).toBeTruthy();
  return hit![1];
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the browser never starts provider scans on its own', () => {
  const sync = code(source('/syncContext.tsx'));

  it('has no 24-hour auto-sync interval', () => {
    expect(sync).not.toMatch(/24 \* 60 \* 60 \* 1000/);
    expect(sync).not.toMatch(/setInterval/);
  });

  it('has no post-login delayed sweep', () => {
    expect(sync).not.toMatch(/runAutoSync/);
    expect(sync).not.toMatch(/staleAccounts/);
  });

  it('no longer enumerates every connection to decide what to scan', () => {
    // The sweep fetched all AWS/GCP/Azure accounts just to pick stale ones.
    expect(sync).not.toMatch(/getGcpAccounts|getAzureAccounts|fetchAllPages/);
  });

  it('no longer orchestrates steps from the browser at all (Phase 3)', () => {
    // Phase 1 removed the AUTOMATIC scans; Phase 3 removed the manual step
    // loop too. The client's whole role is now: ask for a job, watch it.
    expect(sync).not.toMatch(/getDiscoverySteps|runDiscoveryStep|finalizeDiscovery/);
    expect(sync).not.toMatch(/stepErrors/);
    expect(sync).toMatch(/startCollectionRun/);
    expect(sync).toMatch(/getCollectionRun/);
  });

  it('treats PARTIALLY_SUCCEEDED as not-done', () => {
    // Presenting an incomplete collection as success is the defect
    // AWS-P0-05 describes.
    expect(sync).toMatch(/run\.status === 'SUCCEEDED' \? 'done' : 'error'/);
  });
});

describe('the connect wizard cannot onboard into an un-wired method', () => {
  const wizard = source('/ConnectAwsAccountWizard.tsx');
  const wizardCode = code(wizard);

  it('defaults to the certified method', () => {
    expect(wizardCode).toMatch(/useState<'access_key' \| 'cross_account_role'>\('access_key'\)/);
  });

  it('disables the cross-account role option', () => {
    expect(wizardCode).toMatch(/disabled\s*\n?\s*aria-disabled="true"/);
  });

  it('no longer badges it Recommended', () => {
    expect(wizardCode).not.toMatch(/Recommended/);
  });

  it('carries no internal PRD section references in customer-facing copy', () => {
    // The prompt forbids these explicitly; §7.1/§7.2 were rendered on screen.
    expect(wizardCode).not.toMatch(/§\d/);
  });
});

describe('a duplicate account is reported, not silently rotated', () => {
  const wizardCode = code(source('/ConnectAwsAccountWizard.tsx'));

  it('does not call credential or role update from the create flow', () => {
    expect(wizardCode).not.toMatch(/updateAccountCredentials|updateAccountRole/);
  });

  it('does not parse the database constraint name to infer intent', () => {
    expect(wizardCode).not.toMatch(/cloud_connections_org_id_aws_account_id_key/);
  });

  it('handles the server 409 and surfaces the existing connection', () => {
    expect(wizardCode).toMatch(/status === 409/);
    expect(wizardCode).toMatch(/connection_already_exists/);
    expect(wizardCode).toMatch(/setDuplicate\(conflict\)/);
  });
});
