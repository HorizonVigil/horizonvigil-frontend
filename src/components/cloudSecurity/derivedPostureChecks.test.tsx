import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DerivedPostureChecks } from './DerivedPostureChecks';
import type { PostureCheckReport, PostureCheckResult } from '../../lib/api';

afterEach(cleanup);

const check = (over: Partial<PostureCheckResult>): PostureCheckResult => ({
  key: 'k', title: 'A check', severity: 'high', rationale: 'Because it matters to the people who own this account.',
  requires: ['ebs_volume'], outcome: 'PASS', evaluated: 1, failing: 0, examples: [], ...over,
});

const report = (over: Partial<PostureCheckReport> = {}): PostureCheckReport => ({
  checks: [], gaps: [], provenance: 'derived_by_horizonvigil', connectionsInScope: 2,
  summary: { failing: 0, passing: 0, notApplicable: 0, notCollected: 0, affectedResources: 0 },
  ...over,
});

describe('DerivedPostureChecks', () => {
  /** The real production case: an unencrypted volume nobody was shown. */
  it('names the failing resource and its evidence', () => {
    render(<DerivedPostureChecks report={report({
      checks: [check({ key: 'ebs', title: 'EBS volume is not encrypted at rest', outcome: 'FAIL', failing: 1, evaluated: 1,
        examples: [{ resourceId: 'vol-1', region: 'us-east-1', detail: 'encrypted: false' }] })],
      summary: { failing: 1, passing: 0, notApplicable: 0, notCollected: 0, affectedResources: 1 },
    })} />);
    expect(screen.getByText(/EBS volume is not encrypted at rest/)).toBeTruthy();
    expect(screen.getByText(/vol-1/)).toBeTruthy();
    expect(screen.getByText(/1 check failing across 1 resource/)).toBeTruthy();
  });

  /**
   * The load-bearing distinction. Three outcomes produce zero failures and
   * only PASS means nothing is wrong.
   */
  it('distinguishes passing from not-applicable from not-checked', () => {
    render(<DerivedPostureChecks report={report({
      checks: [
        check({ key: 'a', title: 'Passing check', outcome: 'PASS', evaluated: 3 }),
        check({ key: 'b', title: 'Absent type', outcome: 'NOT_APPLICABLE' }),
        check({ key: 'c', title: 'Blind check', outcome: 'NOT_COLLECTED', unavailableReason: '61 security_group collected, but none carry the field this rule reads.' }),
      ],
      summary: { failing: 0, passing: 1, notApplicable: 1, notCollected: 1, affectedResources: 0 },
    })} />);
    expect(screen.getByText(/Passing — 3 checked/)).toBeTruthy();
    expect(screen.getByText('Not applicable')).toBeTruthy();
    expect(screen.getByText('Not checked')).toBeTruthy();
    // Why it could not run is more useful than its absence.
    expect(screen.getByText(/none carry the field this rule reads/)).toBeTruthy();
  });

  it('says how many checks could not run, so a clean headline is qualified', () => {
    render(<DerivedPostureChecks report={report({
      checks: [check({ outcome: 'NOT_COLLECTED' })],
      summary: { failing: 0, passing: 2, notApplicable: 0, notCollected: 1, affectedResources: 0 },
    })} />);
    expect(screen.getByText(/1 could not run/)).toBeTruthy();
  });

  /**
   * Provenance on the surface, not only in the payload. These are not AWS
   * Config's assertions and must not be mistaken for them.
   */
  it('states that these checks are derived, not provider-native', () => {
    render(<DerivedPostureChecks report={report()} />);
    expect(screen.getByText(/Derived by HorizonVigil from collected configuration/)).toBeTruthy();
  });

  /** Naming the gap is the difference between incomplete and misleading. */
  it('lists checks it deliberately does not run, with reasons', () => {
    render(<DerivedPostureChecks report={report({
      gaps: [{ key: 'sg', title: 'Security group allows ingress from 0.0.0.0/0', reason: 'The EC2 scanner stores inboundRuleCount, not the rules themselves.' }],
    })} />);
    expect(screen.getByText(/Not covered by these checks/)).toBeTruthy();
    expect(screen.getByText(/inboundRuleCount/)).toBeTruthy();
  });

  /** A null report must not render as a clean posture. */
  it('reports its own unavailability rather than implying clean', () => {
    render(<DerivedPostureChecks report={null} />);
    expect(screen.getByText(/could not be loaded, so nothing here has been evaluated/)).toBeTruthy();
  });

  it('orders failing checks above quiet ones', () => {
    const { container } = render(<DerivedPostureChecks report={report({
      checks: [
        check({ key: 'ok', title: 'Zzz passing', outcome: 'PASS' }),
        check({ key: 'bad', title: 'Aaa failing', outcome: 'FAIL', failing: 1, evaluated: 1 }),
      ],
      summary: { failing: 1, passing: 1, notApplicable: 0, notCollected: 0, affectedResources: 1 },
    })} />);
    const text = container.textContent ?? '';
    expect(text.indexOf('Aaa failing')).toBeLessThan(text.indexOf('Zzz passing'));
  });

  it('keeps the count authoritative when the sample is truncated', () => {
    render(<DerivedPostureChecks report={report({
      checks: [check({ outcome: 'FAIL', failing: 12, evaluated: 12,
        examples: Array.from({ length: 5 }, (_, i) => ({ resourceId: `vol-${i}`, region: 'us-east-1', detail: 'encrypted: false' })) })],
      summary: { failing: 1, passing: 0, notApplicable: 0, notCollected: 0, affectedResources: 12 },
    })} />);
    expect(screen.getByText(/and 7 more/)).toBeTruthy();
  });
});
