import { describe, it, expect } from 'vitest';
import { describeAvailability, type Availability } from './api';

/**
 * Phase 2 truth contracts. Verified in production 2026-09-09:
 *  - cost_snapshots: 28 rows, ZERO non-zero, only 1 of 6 active connections
 *    has any row -- so five connections rendered "$0" from no data.
 *  - ZERO V1 posture findings exist (0 rows from aws_config /
 *    iam_access_analyzer / gcp_scc / defender / security_hub against 4,075
 *    V2 rows) while Cloud Security printed "No externally-shared resources
 *    found" and a green zero.
 */
const sources = import.meta.glob(
  ['../pages/CloudSecurity.tsx', '../components/finops/FinOpsOverviewTab.tsx'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([p]) => p.endsWith(endsWith));
  expect(hit, `source not found for ${endsWith}`).toBeTruthy();
  return hit![1];
}

function code(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('cost never renders a false zero', () => {
  const finops = code(source('/FinOpsOverviewTab.tsx'));

  it('does not coerce a null total to 0', () => {
    // `?? 0` on an unavailable total is the entire AWS-P0-06 bug.
    expect(finops).not.toMatch(/analytics\?\.totalCost \?\? 0/);
  });

  it('keeps the total null when the server could not vouch for it', () => {
    expect(finops).toMatch(/const totalCost = d\.analytics\?\.totalCost \?\? null/);
  });

  it('renders an em dash instead of a number when unavailable', () => {
    expect(finops).toMatch(/totalCost !== null[\s\S]{0,120}: '—'/);
  });

  it('explains why, rather than showing a bare dash', () => {
    expect(finops).toMatch(/describeAvailability\(costAvailability\)/);
  });

  it('suppresses the change delta when either period is untrustworthy', () => {
    // A percentage against an unavailable baseline is itself a false claim.
    expect(finops).toMatch(/totalCost !== null && prevTotal !== null \? percentChange/);
  });
});

describe('security never claims clean without evaluation', () => {
  const sec = code(source('/CloudSecurity.tsx'));

  it('does not assert that nothing is externally shared', () => {
    expect(sec).not.toMatch(/No externally-shared resources found\./);
  });

  it('says an empty list is not proof of no exposure', () => {
    expect(sec).toMatch(/not proof that nothing is shared/);
  });

  it('does not paint a zero green', () => {
    expect(sec).not.toMatch(/exposed\.length > 0 \? 'critical' : 'good'/);
    expect(sec).toMatch(/exposed\.length > 0 \? 'critical' : 'neutral'/);
  });

  it('links identities to a tab that actually exists', () => {
    // ?tab=Identities is not in CloudAccounts' TABS, so it silently landed
    // on Overview (audit AWS-P1-05).
    expect(sec).not.toMatch(/tab=Identities/);
    expect(sec).toMatch(/tab=Access/);
  });
});

describe('describeAvailability', () => {
  it('distinguishes "no billing collected" from a generic message', () => {
    const a: Availability = { state: 'not_configured', reasonCode: 'no_billing_data_collected' };
    expect(describeAvailability(a)).toMatch(/billing data has been collected/i);
  });

  it('states coverage for a partial answer', () => {
    const a: Availability = { state: 'partial', coverage: { expected: 6, covered: 1 } };
    expect(describeAvailability(a)).toMatch(/1 of 6/);
  });

  it('never leaks provider identifiers', () => {
    for (const s of ['permission_denied', 'throttled', 'failed', 'stale'] as const) {
      expect(describeAvailability({ state: s })).not.toMatch(/arn:|\d{12}/);
    }
  });
});
