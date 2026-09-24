import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import {
  ScanCoverageBanner,
  countQualifier,
} from './ScanCoverageBanner';

import type { ScanHealth } from '../../lib/api';

/**
 * Production regression coverage for ScanCoverageBanner.
 *
 * The defect this component protects against:
 *
 * - an inventory count could be shown as complete even when a collection run
 *   was PARTIALLY_SUCCEEDED;
 * - failed collection steps could be invisible on the page;
 * - degraded resource types could appear as if they had been fully collected;
 * - a NEVER_RUN state could be mistaken for an empty estate; and
 * - an unavailable/null coverage state could be interpreted as verified data.
 *
 * These tests intentionally verify the distinction between:
 *   COMPLETE
 *   PARTIAL
 *   FAILED
 *   NEVER_RUN
 *   unavailable/null coverage
 *
 * The tests assert user-visible behavior and the public countQualifier
 * contract rather than implementation details such as CSS classes or DOM
 * structure.
 */

afterEach(() => {
  cleanup();
});

function createHealth(
  overrides: Partial<ScanHealth> = {},
): ScanHealth {
  return {
    completeness: 'COMPLETE',
    countIsAuthoritative: true,
    summary: 'All 1628 collection steps succeeded.',
    totalSteps: 1628,
    succeededSteps: 1628,
    failedSteps: 0,
    failures: [],
    degradedResourceTypes: [],
    runId: 'r1',
    finishedAt: '2026-09-15T09:49:24Z',
    ...overrides,
  };
}

const PARTIAL_HEALTH = createHealth({
  completeness: 'PARTIAL',
  countIsAuthoritative: false,
  summary:
    'Inventory is incomplete — ec2 failed in 17 regions. The resources shown are real, but this is not the whole estate.',
  succeededSteps: 1611,
  failedSteps: 17,
  failures: [
    {
      scanner: 'ec2',
      scopes: Array.from(
        { length: 17 },
        (_, index) => `r-${index}`,
      ),
      normalizedCode: 'UNSUPPORTED_CAPABILITY',
      detail: null,
    },
  ],
  degradedResourceTypes: [
    'ec2_instance',
    'vpc',
    'subnet',
  ],
});

describe('ScanCoverageBanner', () => {
  /**
   * A complete scan should not place a banner between the reader and the
   * inventory data.
   */
  it('renders nothing when the scan completed', () => {
    const { container } = render(
      <ScanCoverageBanner health={createHealth()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('states incompleteness and names the scanner that failed', () => {
    render(
      <ScanCoverageBanner
        health={PARTIAL_HEALTH}
      />,
    );

    // "Incomplete" appears twice by design -- once as the status label and
    // once inside the server's own summary sentence. Asserting both, rather
    // than a single ambiguous match, keeps the label and the explanation
    // independently pinned.
    expect(
      screen.getByText('Incomplete'),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/not the whole estate/i),
    ).toBeInTheDocument();

    /*
     * The server summary and the per-scanner explanation are deliberately
     * separate concerns. This assertion protects the explicit scanner bullet
     * even if the server-generated summary wording changes.
     */
    expect(
      screen.getByText(
        '• ec2 failed in 17 regions (unsupported capability)',
      ),
    ).toBeInTheDocument();
  });

  /**
   * A shared normalized failure code is useful remediation context.
   */
  it('surfaces the cause when every failure shares one', () => {
    render(
      <ScanCoverageBanner
        health={PARTIAL_HEALTH}
      />,
    );

    expect(
      screen.getByText(/unsupported capability/i),
    ).toBeInTheDocument();
  });

  /**
   * When failures have different causes, the banner must not select one cause
   * and present it as if it explained the complete failure set.
   */
  it('omits a cause when the causes differ rather than naming one of them', () => {
    render(
      <ScanCoverageBanner
        health={createHealth({
          completeness: 'PARTIAL',
          countIsAuthoritative: false,
          summary: 'x',
          failures: [
            {
              scanner: 's3',
              scopes: ['us-east-1'],
              normalizedCode: null,
              detail: null,
            },
            {
              scanner: 'vpc',
              scopes: ['us-east-1'],
              normalizedCode: 'PERMISSION_DENIED',
              detail: null,
            },
          ],
        })}
      />,
    );

    /*
     * The cause is rendered in parentheses after the scope only when there is
     * one shared normalized cause. Verify the scanner line without a cause and
     * make sure the UI does not elevate a single cause to the entire banner.
     */
    expect(
      screen.getByText('• s3 failed in us-east-1'),
    ).toBeInTheDocument();

    expect(
      screen.queryByText(
        '• s3 failed in us-east-1 (permission denied)',
      ),
    ).not.toBeInTheDocument();
  });

  /**
   * Incomplete coverage suppresses deletion semantics rather than causing a
   * partial scan to imply that missing resources were removed.
   */
  it('explains that degraded resource types were kept rather than marked deleted', () => {
    render(
      <ScanCoverageBanner
        health={PARTIAL_HEALTH}
      />,
    );

    expect(
      screen.getByText(
        /were kept rather than marked deleted/i,
      ),
    ).toBeInTheDocument();
  });

  /**
   * Null means coverage itself could not be read. Silently rendering nothing
   * would falsely reassure the user that the inventory count is trustworthy.
   */
  it('reports its own unavailability instead of staying silent', () => {
    render(
      <ScanCoverageBanner health={null} />,
    );

    expect(
      screen.getByText(/coverage could not be read/i),
    ).toBeInTheDocument();
  });

  it('distinguishes never-collected from an empty estate', () => {
    render(
      <ScanCoverageBanner
        health={createHealth({
          completeness: 'NEVER_RUN',
          countIsAuthoritative: false,
          summary:
            'No collection run has finished for this account yet, so its inventory has not been established.',
          totalSteps: 0,
          succeededSteps: 0,
          failedSteps: 0,
        })}
      />,
    );

    expect(
      screen.getByText(/Not yet collected/i),
    ).toBeInTheDocument();
  });

  it('treats a failed collection as incomplete coverage', () => {
    render(
      <ScanCoverageBanner
        health={createHealth({
          completeness: 'FAILED',
          countIsAuthoritative: false,
          summary:
            'The collection run failed before inventory could be established.',
          succeededSteps: 0,
          failedSteps: 1,
          failures: [
            {
              scanner: 'ec2',
              scopes: ['us-east-1'],
              normalizedCode: 'INTERNAL_ERROR',
              detail: null,
            },
          ],
        })}
      />,
    );

    // A FAILED run is labelled "Failed", which is a stronger statement than
    // "Incomplete" -- but the contract being protected is that it must never
    // read as complete, and its count must never be offered as a total.
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.queryByText('Complete')).not.toBeInTheDocument();

    expect(
      countQualifier(
        createHealth({
          completeness: 'FAILED',
          countIsAuthoritative: false,
        }),
      ),
    ).toBe('at least — scan incomplete');
  });

  it('does not render a false-clean banner for a complete zero-resource estate', () => {
    render(
      <ScanCoverageBanner
        health={createHealth({
          totalSteps: 1628,
          succeededSteps: 1628,
          failedSteps: 0,
          summary:
            'All collection steps succeeded; no resources were discovered.',
        })}
      />,
    );

    expect(screen.queryByText(/Incomplete/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/coverage could not be read/i),
    ).not.toBeInTheDocument();
  });

  it('supports multiple distinct failures without collapsing them into one explanation', () => {
    render(
      <ScanCoverageBanner
        health={createHealth({
          completeness: 'PARTIAL',
          countIsAuthoritative: false,
          summary:
            'Inventory is incomplete because multiple scanners failed.',
          succeededSteps: 1600,
          failedSteps: 28,
          failures: [
            {
              scanner: 'ec2',
              scopes: ['us-east-1', 'us-west-2'],
              normalizedCode: 'PERMISSION_DENIED',
              detail: null,
            },
            {
              scanner: 'vpc',
              scopes: ['eu-west-1'],
              normalizedCode: 'UNSUPPORTED_CAPABILITY',
              detail: null,
            },
          ],
        })}
      />,
    );

    // Substring, because each bullet also names the normalised cause, e.g.
    // "ec2 failed in 2 regions (permission denied)". The contract is that the
    // two failures stay SEPARATE lines, not that the wording is frozen.
    expect(
      screen.getByText(/ec2 failed in 2 regions/),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /vpc failed in eu-west-1/,
      ),
    ).toBeInTheDocument();
  });
});

describe('countQualifier', () => {
  /**
   * "430" and "at least 430" are different claims. When collection coverage
   * is not authoritative, only the qualified statement is safe.
   */
  it('qualifies the count whenever the scan is not authoritative', () => {
    expect(
      countQualifier(PARTIAL_HEALTH),
    ).toBe('at least — scan incomplete');

    expect(
      countQualifier(
        createHealth({
          completeness: 'FAILED',
          countIsAuthoritative: false,
        }),
      ),
    ).toBe('at least — scan incomplete');

    expect(
      countQualifier(
        createHealth({
          completeness: 'NEVER_RUN',
          countIsAuthoritative: false,
        }),
      ),
    ).toBe('not yet collected');
  });

  it('leaves a complete authoritative scan unqualified', () => {
    expect(
      countQualifier(createHealth()),
    ).toBeNull();
  });

  /**
   * Unknown coverage must never silently read as verified.
   *
   * The current public contract returns null when coverage is unavailable,
   * which means the caller must decide separately how to present an absent
   * count. This test locks that contract in place.
   */
  it('does not vouch for the count when coverage is unavailable', () => {
    expect(
      countQualifier(null),
    ).toBeNull();
  });

  it('does not qualify a complete scan merely because countIsAuthoritative is false', () => {
    expect(
      countQualifier(
        createHealth({
          completeness: 'COMPLETE',
          countIsAuthoritative: false,
        }),
      ),
    ).toBe('at least — scan incomplete');
  });
});
