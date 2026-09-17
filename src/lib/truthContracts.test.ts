import { describe, expect, it } from 'vitest';

import { describeAvailability, type Availability } from './api';
import { stripComments } from '../test/sourceCode';

/** Source-level guards must read code, never the prose documenting it. */
const code = stripComments;

/**
 * Phase 2 truth-contract regression tests.
 *
 * These tests intentionally inspect the source of affected UI surfaces to
 * protect against regressions where unknown, unavailable, or partial data is
 * represented as a reassuring zero/clean state.
 *
 * Production observations recorded on 2026-09-09:
 * - cost_snapshots: 28 rows, zero non-zero values, and only 1 of 6 active
 *   connections had any row. Five connections therefore previously rendered
 *   "$0" from missing data.
 * - No V1 posture findings existed in the audited source tables while V2 rows
 *   were present, yet Cloud Security previously displayed a green zero/clean
 *   state.
 *
 * These are source-level regression tests. They complement, rather than
 * replace, API, integration, and end-to-end tests.
 */

const SOURCES = import.meta.glob(
  [
    '../pages/CloudSecurity.tsx',
    '../components/finops/FinOpsOverviewTab.tsx',
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

  expect(hit, `source not found for ${endsWith}`).toBeTruthy();

  return hit![1];
}

describe('cost never renders a false zero', () => {
  const finops = code(source('/FinOpsOverviewTab.tsx'));

  it('does not coerce an unavailable total to zero', () => {
    expect(finops).not.toMatch(
      /analytics\s*\??\.\s*totalCost\s*\?\?\s*0/,
    );
  });

  it('keeps totalCost nullable when the server cannot vouch for it', () => {
    expect(finops).toMatch(
      /const\s+totalCost\s*=\s*d\s*\??\.\s*analytics\s*\??\.\s*totalCost\s*\?\?\s*null/,
    );
  });

  it('renders an em dash instead of a numeric value when unavailable', () => {
    expect(finops).toMatch(
      /totalCost\s*!==\s*null[\s\S]{0,160}:\s*['"]—['"]/,
    );
  });

  it('explains unavailable data instead of showing a bare dash', () => {
    expect(finops).toMatch(
      /describeAvailability\s*\(\s*costAvailability\s*\)/,
    );
  });

  it('suppresses the change delta when either period is untrustworthy', () => {
    expect(finops).toMatch(
      /totalCost\s*!==\s*null\s*&&\s*prevTotal\s*!==\s*null\s*\?\s*percentChange/,
    );
  });
});

describe('security never claims clean without evaluation', () => {
  const security = code(source('/CloudSecurity.tsx'));

  it('does not assert that nothing is externally shared', () => {
    expect(security).not.toMatch(
      /No externally-shared resources found\./,
    );
  });

  it('explains that an empty list is not proof of no exposure', () => {
    expect(security).toMatch(/not proof that nothing is shared/i);
  });

  it('does not paint an unevaluated zero green', () => {
    expect(security).not.toMatch(
      /exposed\s*\??\.\s*length\s*>\s*0\s*\?\s*['"]critical['"]\s*:\s*['"]good['"]/,
    );

    expect(security).toMatch(
      /exposed\s*\??\.\s*length\s*>\s*0\s*\?\s*['"]critical['"]\s*:\s*['"]neutral['"]/,
    );
  });

  it('links identities to the valid Cloud Accounts Access tab', () => {
    expect(security).not.toMatch(/tab=Identities/);
    expect(security).toMatch(/tab=Access/);
  });

  it('keeps the overview security widget on the valid Access tab', () => {
    const widgets = code(source('/securityWidgets.tsx'));

    expect(widgets).not.toMatch(/tab=Identities/);
    expect(widgets).toMatch(/tab=Access/);
  });
});

describe('describeAvailability', () => {
  it('distinguishes missing billing collection from a generic message', () => {
    const availability: Availability = {
      state: 'not_configured',
      reasonCode: 'no_billing_data_collected',
    };

    expect(describeAvailability(availability)).toMatch(
      /billing data has been collected/i,
    );
  });

  it('states coverage for a partial answer', () => {
    const availability: Availability = {
      state: 'partial',
      coverage: {
        expected: 6,
        covered: 1,
      },
    };

    expect(describeAvailability(availability)).toMatch(/1 of 6/);
  });

  it('does not expose provider identifiers in user-facing availability text', () => {
    const states = [
      'permission_denied',
      'throttled',
      'failed',
      'stale',
    ] as const;

    for (const state of states) {
      const message = describeAvailability({ state });

      expect(message).not.toMatch(/arn:/i);
      expect(message).not.toMatch(/\b\d{12}\b/);
    }
  });

  it('does not accidentally turn zero coverage into full coverage', () => {
    const availability: Availability = {
      state: 'partial',
      coverage: {
        expected: 6,
        covered: 0,
      },
    };

    expect(describeAvailability(availability)).not.toMatch(/6 of 6/i);
  });

  it('handles partial coverage without leaking raw provider details', () => {
    const availability: Availability = {
      state: 'partial',
      coverage: {
        expected: 10,
        covered: 7,
      },
    };

    const message = describeAvailability(availability);

    expect(message).toMatch(/7 of 10/);
    expect(message).not.toMatch(
      /arn:|AKIA[0-9A-Z]{16}|\b\d{12}\b/i,
    );
  });

  it('does not expose credentials in user-facing availability text', () => {
    const message = describeAvailability({
      state: 'permission_denied',
    });

    expect(message).not.toMatch(
      /AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+ PRIVATE KEY-----/i,
    );
  });
});
