import { describe, it, expect, afterEach, vi } from 'vitest';
// fireEvent, not user-event: @testing-library/user-event is not a dependency
// of this repo, and importing it makes the whole file fail to load -- which
// vitest reports as 'no tests' rather than as an error.
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { RunEvaluation } from './RunEvaluation';
import { api, ApiError } from '../../lib/api';
import type { ComplianceEvaluationRun } from '../../lib/api';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Shaped from the real production evaluation on 2026-09-16. */
const PROD_RUN: ComplianceEvaluationRun = {
  connectionsInScope: 2,
  evaluatedAt: '2026-09-16T04:45:00Z',
  frameworks: [{
    frameworkKey: 'cis_aws_foundations_v3_partial',
    name: 'CIS AWS Foundations Benchmark (partial)',
    version: '3.0.0',
    evidenceBasis: 'horizonvigil_rule',
    limitations: 'Verdicts are computed by HorizonVigil from collected configuration. They are NOT AWS Config evaluations, not an audit, and not an attestation of compliance.',
    score: null,
    counts: { not_evaluated: 3, failed: 2 },
    verdicts: [
      { controlKey: '1.10', result: 'not_evaluated', resultReason: 'No human identity had a determinable MFA state, so this control was not assessed.', resourcesEvaluated: 0, resourcesFailing: 0 },
      { controlKey: '2.2.1', result: 'failed', resultReason: '1 of 1 resource(s) violate this control.', resourcesEvaluated: 1, resourcesFailing: 1 },
    ],
  }],
};

describe('RunEvaluation', () => {
  it('offers the action that makes an empty compliance page useful', () => {
    render(<RunEvaluation />);
    expect(screen.getByRole('button', { name: /run evaluation/i })).toBeTruthy();
  });

  it('shows each verdict with the reason behind it', async () => {
    vi.spyOn(api, 'evaluateCompliance').mockResolvedValue(PROD_RUN);
    render(<RunEvaluation />);
    fireEvent.click(screen.getByRole('button', { name: /run evaluation/i }));

    await waitFor(() => expect(screen.getByText(/1 of 1 resource\(s\) violate/)).toBeTruthy());
    expect(screen.getByText('2.2.1')).toBeTruthy();
    expect(screen.getByText(/determinable MFA state/)).toBeTruthy();
  });

  /**
   * The load-bearing rule. A percentage over a partial set reads as an
   * assessment of the whole framework, and a compliance score is something a
   * customer may put in front of an auditor.
   */
  it('never prints a percentage when a control could not be assessed', async () => {
    vi.spyOn(api, 'evaluateCompliance').mockResolvedValue(PROD_RUN);
    render(<RunEvaluation />);
    fireEvent.click(screen.getByRole('button', { name: /run evaluation/i }));

    await waitFor(() => expect(screen.getByText(/Not scored/)).toBeTruthy());
    expect(screen.getByText(/some controls could not be assessed/)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('prints a score only when every control was assessed', async () => {
    vi.spyOn(api, 'evaluateCompliance').mockResolvedValue({
      ...PROD_RUN,
      frameworks: [{ ...PROD_RUN.frameworks[0], score: 60, counts: { passed: 3, failed: 2 } }],
    });
    render(<RunEvaluation />);
    fireEvent.click(screen.getByRole('button', { name: /run evaluation/i }));
    await waitFor(() => expect(screen.getByText(/60% of assessed controls passed/)).toBeTruthy());
  });

  /**
   * The server distinguishes "no service key configured, nothing was run" from
   * a genuine failure. Flattening that to "evaluation failed" loses the
   * difference, and only one of them is actionable by the reader.
   */
  it('shows the server message verbatim rather than a generic failure', async () => {
    vi.spyOn(api, 'evaluateCompliance').mockRejectedValue(
      // ApiError is (status, message) -- the reverse order compiles, because
      // both params are assignable, and silently renders the status code as
      // the message.
      new ApiError(503, 'SUPABASE_SERVICE_ROLE_KEY is not configured, so compliance evidence cannot be recorded in this environment. No evaluation was run.'),
    );
    render(<RunEvaluation />);
    fireEvent.click(screen.getByRole('button', { name: /run evaluation/i }));
    await waitFor(() => expect(screen.getByText(/No evaluation was run/)).toBeTruthy());
  });

  it('restates the framework limitations beside the verdicts', async () => {
    vi.spyOn(api, 'evaluateCompliance').mockResolvedValue(PROD_RUN);
    render(<RunEvaluation />);
    fireEvent.click(screen.getByRole('button', { name: /run evaluation/i }));
    await waitFor(() => expect(screen.getByText(/not an attestation of compliance/)).toBeTruthy());
  });

  it('says that a new run is added beside existing evidence, not over it', () => {
    render(<RunEvaluation />);
    expect(screen.getByText(/never over them/)).toBeTruthy();
  });
});
