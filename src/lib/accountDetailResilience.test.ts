import { describe, it, expect } from 'vitest';

/**
 * AWS-P1-06: "The AWS detail page uses one `Promise.all` across account,
 * inventory, cost, and credential-summary services. One dependency failure
 * can fail the whole page rather than rendering available sections with
 * individual error states."
 *
 * The identical defect was already fixed in CloudSecurity.tsx by switching
 * to allSettled. This asserts the fix landed in the place the audit named
 * too — and that the account itself stays fatal, since without it there is
 * no page to render.
 *
 * AWS-P1-05 (client half): the Changes panel is asserted here as well.
 */
const sources = import.meta.glob(
  ['../pages/AwsAccountDetail.tsx', '../components/cloudAccounts/ChangesPanel.tsx'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([path]) => path.endsWith(endsWith));
  expect(hit, `source not found for ${endsWith}`).toBeTruthy();
  return hit![1];
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('one failing service no longer blanks the AWS account page', () => {
  const detail = code(source('/AwsAccountDetail.tsx'));

  it('loads its four dependencies with allSettled, not all', () => {
    expect(detail).toMatch(/Promise\.allSettled\(\[/);
    expect(detail).not.toMatch(/Promise\.all\(\[/);
  });

  it('still treats the account itself as fatal', () => {
    // Inventory, cost and credentials degrade to their own section.
    // The connection does not: without it there is nothing to render.
    expect(detail).toMatch(/connRes\.status === 'rejected'/);
  });

  it('names which sections failed', () => {
    // "Couldn't load" with no subject leaves the reader unable to tell an
    // empty inventory from a failed one.
    expect(detail).toMatch(/failed\.push\('resource inventory'\)/);
    expect(detail).toMatch(/failed\.push\('cost data'\)/);
    expect(detail).toMatch(/failed\.push\('credential summary'\)/);
    expect(detail).toMatch(/Everything else on this page is real, loaded data/);
  });

  it('clears the error when everything loads', () => {
    // A stale banner from a previous attempt is its own false signal.
    expect(detail).toMatch(/failed\.length > 0[\s\S]{0,200}: null/);
  });
});

describe('the Changes panel shows changes by default', () => {
  const panel = code(source('/ChangesPanel.tsx'));

  it('defaults read-only events off', () => {
    expect(panel).toMatch(/useState\(false\)/);
    expect(panel).toMatch(/includeReadOnly/);
  });

  it('passes the flag to the server rather than filtering in the browser', () => {
    expect(panel).toMatch(/getAccountCloudTrailEvents\(row\.id, \{ includeReadOnly \}\)/);
  });

  it('re-fetches when the toggle changes', () => {
    // Without this in the key, ticking the box would show cached rows.
    expect(panel).toMatch(/queryKey: \[[^\]]*includeReadOnly\]/);
  });

  it('says which view it is showing', () => {
    expect(panel).toMatch(/CloudTrail configuration changes/);
    expect(panel).toMatch(/CloudTrail events, including reads/);
  });

  it('explains the hidden reads in the empty state', () => {
    // Otherwise "No recent changes" reads as "nothing happened".
    expect(panel).toMatch(/Read-only calls are hidden/);
  });
});
