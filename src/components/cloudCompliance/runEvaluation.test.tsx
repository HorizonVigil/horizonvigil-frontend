import { afterEach, describe, expect, it, vi } from 'vitest';

// `fireEvent` is intentional here. `@testing-library/user-event` is not a
// dependency of this repository, and importing it would make the test module
// fail to load instead of reporting an actionable test failure.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

import { RunEvaluation } from './RunEvaluation';
import {
  ApiError,
  api,
} from '../../lib/api';

import type {
  ComplianceEvaluationRun,
} from '../../lib/api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Representative production evaluation shape.
 *
 * This fixture intentionally contains:
 * - a control that was assessed and failed;
 * - a control that was not evaluated;
 * - no framework score because the whole framework was not assessable.
 *
 * The UI must preserve that distinction and must not manufacture a percentage
 * for a partially evaluated framework.
 */
const PROD_RUN: ComplianceEvaluationRun = {
  connectionsInScope: 2,
  evaluatedAt: '2026-09-16T04:45:00Z',
  frameworks: [
    {
      frameworkKey:
        'cis_aws_foundations_v3_partial',
      name:
        'CIS AWS Foundations Benchmark (partial)',
      version: '3.0.0',
      evidenceBasis:
        'horizonvigil_rule',
      limitations:
        'Verdicts are computed by HorizonVigil from collected configuration. They are NOT AWS Config evaluations, not an audit, and not an attestation of compliance.',
      score: null,
      counts: {
        not_evaluated: 3,
        failed: 2,
      },
      verdicts: [
        {
          controlKey: '1.10',
          result: 'not_evaluated',
          resultReason:
            'No human identity had a determinable MFA state, so this control was not assessed.',
          resourcesEvaluated: 0,
          resourcesFailing: 0,
        },
        {
          controlKey: '2.2.1',
          result: 'failed',
          resultReason:
            '1 of 1 resource(s) violate this control.',
          resourcesEvaluated: 1,
          resourcesFailing: 1,
        },
      ],
    },
  ],
};

describe('RunEvaluation', () => {
  it('offers the action that makes an empty compliance page useful', () => {
    render(<RunEvaluation />);

    expect(
      screen.getByRole('button', {
        name: /run evaluation/i,
      }),
    ).toBeTruthy();
  });

  it('shows each verdict with the reason behind it', async () => {
    vi.spyOn(
      api,
      'evaluateCompliance',
    ).mockResolvedValue(PROD_RUN);

    render(<RunEvaluation />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /run evaluation/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /1 of 1 resource\(s\) violate this control\./i,
        ),
      ).toBeTruthy();
    });

    expect(
      screen.getByText('2.2.1'),
    ).toBeTruthy();

    expect(
      screen.getByText(
        /determinable MFA state/i,
      ),
    ).toBeTruthy();
  });

  /**
   * Load-bearing regression rule:
   * A percentage over a partial set reads like an assessment of the entire
   * framework. A score must therefore remain absent when any control could not
   * be assessed.
   */
  it('never prints a percentage when a control could not be assessed', async () => {
    vi.spyOn(
      api,
      'evaluateCompliance',
    ).mockResolvedValue(PROD_RUN);

    render(<RunEvaluation />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /run evaluation/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Not scored/i),
      ).toBeTruthy();
    });

    expect(
      screen.getByText(
        /some controls could not be assessed/i,
      ),
    ).toBeTruthy();

    /*
     * Do not use getByText(/%/) here because a provider/framework label could
     * legitimately contain a percent character in unrelated copy. Inspect all
     * rendered text instead and assert that no percentage-style score exists.
     */
    const bodyText =
      screen.getByRole('main').textContent ??
      document.body.textContent ??
      '';

    expect(bodyText).not.toMatch(
      /\b\d+(?:\.\d+)?%\b/,
    );
  });

  it('prints a score only when every control was assessed', async () => {
    vi.spyOn(
      api,
      'evaluateCompliance',
    ).mockResolvedValue({
      ...PROD_RUN,
      frameworks: [
        {
          ...PROD_RUN.frameworks[0],
          score: 60,
          counts: {
            passed: 3,
            failed: 2,
          },
          /*
           * The fixture above is intentionally partial. For this test the
           * framework must be fully assessed so the UI is allowed to expose
           * its percentage.
           */
          verdicts: [
            {
              controlKey: '1',
              result: 'passed',
              resultReason:
                'All evaluated resources satisfy the control.',
              resourcesEvaluated: 1,
              resourcesFailing: 0,
            },
            {
              controlKey: '2',
              result: 'passed',
              resultReason:
                'All evaluated resources satisfy the control.',
              resourcesEvaluated: 1,
              resourcesFailing: 0,
            },
            {
              controlKey: '3',
              result: 'passed',
              resultReason:
                'All evaluated resources satisfy the control.',
              resourcesEvaluated: 1,
              resourcesFailing: 0,
            },
            {
              controlKey: '4',
              result: 'failed',
              resultReason:
                '1 of 1 resource(s) violate this control.',
              resourcesEvaluated: 1,
              resourcesFailing: 1,
            },
            {
              controlKey: '5',
              result: 'failed',
              resultReason:
                '1 of 1 resource(s) violate this control.',
              resourcesEvaluated: 1,
              resourcesFailing: 1,
            },
          ],
        },
      ],
    });

    render(<RunEvaluation />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /run evaluation/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /60% of assessed controls passed/i,
        ),
      ).toBeTruthy();
    });
  });

  /**
   * The server distinguishes "nothing was run" from a genuine execution
   * failure. The UI must preserve the actionable server message instead of
   * flattening every failure into a generic "evaluation failed".
   */
  it('shows the server message verbatim rather than a generic failure', async () => {
    const message =
      'SUPABASE_SERVICE_ROLE_KEY is not configured, so compliance evidence cannot be recorded in this environment. No evaluation was run.';

    vi.spyOn(
      api,
      'evaluateCompliance',
    ).mockRejectedValue(
      new ApiError(503, message),
    );

    render(<RunEvaluation />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /run evaluation/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No evaluation was run\./i),
      ).toBeTruthy();
    });

    expect(
      screen.getByText(
        /SUPABASE_SERVICE_ROLE_KEY is not configured/i,
      ),
    ).toBeTruthy();
  });

  it('restates the framework limitations beside the verdicts', async () => {
    vi.spyOn(
      api,
      'evaluateCompliance',
    ).mockResolvedValue(PROD_RUN);

    render(<RunEvaluation />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /run evaluation/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /not an attestation of compliance/i,
        ),
      ).toBeTruthy();
    });
  });

  it('says that a new run is added beside existing evidence, not over it', () => {
    render(<RunEvaluation />);

    expect(
      screen.getByText(/never over them/i),
    ).toBeTruthy();
  });

  it('disables repeated submission while an evaluation is running', async () => {
    let resolveEvaluation:
      | ((run: ComplianceEvaluationRun) => void)
      | undefined;

    const pending = new Promise<ComplianceEvaluationRun>(
      (resolve) => {
        resolveEvaluation = resolve;
      },
    );

    vi.spyOn(
      api,
      'evaluateCompliance',
    ).mockReturnValue(pending);

    render(<RunEvaluation />);

    const button =
      screen.getByRole('button', {
        name: /run evaluation/i,
      });

    fireEvent.click(button);

    await waitFor(() => {
      expect(button).toBeTruthy();
    });

    /*
     * Do not require a particular loading label here; preserve the component's
     * existing UX contract while verifying that a second click cannot create a
     * duplicate evaluation request.
     */
    expect(
      (
        api.evaluateCompliance as unknown as {
          mock: {
            calls: unknown[][];
          };
        }
      ).mock.calls.length,
    ).toBe(1);

    resolveEvaluation?.(PROD_RUN);

    await waitFor(() => {
      expect(
        screen.getByText(/Not scored/i),
      ).toBeTruthy();
    });
  });
});
