import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ScanCoverageBanner, countQualifier } from './ScanCoverageBanner';
import type { ScanHealth } from '../../lib/api';

/**
 * The defect this component removes, measured in production 2026-09-15:
 *
 *   kamal-k8s — Overview showed "430 resources", `errors: 0`, while the last
 *   run was PARTIALLY_SUCCEEDED and EC2 had failed in all 17 regions.
 *
 * Instances, volumes, VPCs, subnets and security groups had returned nothing
 * anywhere and those rows were stale. Nothing on the page said so, because the
 * failures live on the collection run's step rows and no screen read them.
 */
// Without this, renders accumulate in the same document and every getByText
// matches several nodes -- which looks like a component bug and is not one.
afterEach(cleanup);

const health = (over: Partial<ScanHealth> = {}): ScanHealth => ({
  completeness: 'COMPLETE',
  countIsAuthoritative: true,
  summary: 'All 1628 collection steps succeeded.',
  totalSteps: 1628, succeededSteps: 1628, failedSteps: 0,
  failures: [], degradedResourceTypes: [], runId: 'r1', finishedAt: '2026-09-15T09:49:24Z',
  ...over,
});

const PARTIAL = health({
  completeness: 'PARTIAL',
  countIsAuthoritative: false,
  summary: 'Inventory is incomplete — ec2 failed in 17 regions. The resources shown are real, but this is not the whole estate.',
  succeededSteps: 1611, failedSteps: 17,
  failures: [{ scanner: 'ec2', scopes: Array.from({ length: 17 }, (_, i) => `r-${i}`), normalizedCode: 'UNSUPPORTED_CAPABILITY', detail: null }],
  degradedResourceTypes: ['ec2_instance', 'vpc', 'subnet'],
});

describe('ScanCoverageBanner', () => {
  /** A complete scan should not put a banner between the reader and the data. */
  it('renders nothing when the scan completed', () => {
    const { container } = render(<ScanCoverageBanner health={health()} />);
    expect(container.innerHTML).toBe('');
  });

  it('states incompleteness and names the scanner that failed', () => {
    render(<ScanCoverageBanner health={PARTIAL} />);
    expect(screen.getByText(/Incomplete/)).toBeTruthy();
    expect(screen.getByText(/not the whole estate/)).toBeTruthy();
    // The headline summary and the per-scanner bullet both name it; the bullet
    // is the one that must exist independently of the server's sentence.
    expect(screen.getByText('• ec2 failed in 17 regions (unsupported capability)')).toBeTruthy();
  });

  /**
   * The normalized code is the remedy signal: permission denied is a policy
   * fix, unsupported capability is a retired or un-enabled service. Losing it
   * would leave the reader knowing something broke but not what to do.
   */
  it('surfaces the cause when every failure shares one', () => {
    render(<ScanCoverageBanner health={PARTIAL} />);
    expect(screen.getByText(/\(unsupported capability\)/)).toBeTruthy();
  });

  it('omits a cause when the causes differ, rather than naming one of them', () => {
    render(<ScanCoverageBanner health={health({
      completeness: 'PARTIAL', countIsAuthoritative: false, summary: 'x',
      failures: [{ scanner: 's3', scopes: ['us-east-1'], normalizedCode: null, detail: null }],
    })} />);
    // The cause is rendered in parentheses after the scope, so its absence is
            // asserted precisely rather than by looking for any '(' on the page.
    expect(screen.getByText('• s3 failed in us-east-1')).toBeTruthy();
  });

  /** Incomplete coverage suppresses deletion rather than causing it — and saying so is reassuring and true. */
  it('explains that degraded types were kept rather than deleted', () => {
    render(<ScanCoverageBanner health={PARTIAL} />);
    expect(screen.getByText(/were kept rather than marked deleted/)).toBeTruthy();
  });

  /**
   * Null means the coverage could not be read. Rendering nothing would imply
   * the count is fine — the exact assumption this component exists to remove.
   */
  it('reports its own unavailability instead of staying silent', () => {
    render(<ScanCoverageBanner health={null} />);
    expect(screen.getByText(/coverage could not be read/)).toBeTruthy();
  });

  it('distinguishes never-collected from an empty estate', () => {
    render(<ScanCoverageBanner health={health({
      completeness: 'NEVER_RUN', countIsAuthoritative: false,
      summary: 'No collection run has finished for this account yet, so its inventory has not been established.',
      totalSteps: 0, succeededSteps: 0,
    })} />);
    expect(screen.getByText(/Not yet collected/)).toBeTruthy();
  });
});

describe('countQualifier', () => {
  /** "430" and "at least 430" are different claims; only the second is true when a scanner failed. */
  it('qualifies the count whenever the scan is not authoritative', () => {
    expect(countQualifier(PARTIAL)).toBe('at least — scan incomplete');
    expect(countQualifier(health({ completeness: 'FAILED', countIsAuthoritative: false }))).toBe('at least — scan incomplete');
    expect(countQualifier(health({ completeness: 'NEVER_RUN', countIsAuthoritative: false }))).toBe('not yet collected');
  });

  it('leaves a complete scan unqualified', () => {
    expect(countQualifier(health())).toBeNull();
  });

  /** Unknown coverage must not silently read as verified. */
  it('does not vouch for the count when coverage is unavailable', () => {
    expect(countQualifier(null)).toBeNull();
  });
});
