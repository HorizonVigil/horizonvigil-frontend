import {
  useCallback,
  useId,
  useState,
} from 'react';

import {
  api,
  ApiError,
  type ComplianceEvaluationRun,
} from '../../lib/api';

/**
 * Runs a compliance evaluation and reports the evidence produced.
 *
 * Design principles:
 * - A new evaluation is additive; existing evaluations are not replaced.
 * - The API response is displayed as evidence, not reinterpreted into a
 *   stronger compliance claim.
 * - A framework score is shown only when the server provides one. A null score
 *   must remain visibly unscored rather than becoming 0%.
 * - Individual verdicts retain their reasons so users can understand exactly
 *   why a control passed, failed, or was not assessed.
 * - Server-provided failure messages are preserved where possible because they
 *   can distinguish "nothing was run" from an actual evaluation failure.
 */

type ResultTone =
  | 'failed'
  | 'passed'
  | 'not_evaluated'
  | 'not_applicable'
  | 'error'
  | 'permission_denied';

const RESULT_TONE: Record<ResultTone, string> = {
  failed:
    'text-rose-700 dark:text-rose-400',
  passed:
    'text-emerald-700 dark:text-emerald-400',
  not_evaluated:
    'text-amber-700 dark:text-amber-400',
  not_applicable:
    'text-slate-500 dark:text-slate-400',
  error:
    'text-rose-700 dark:text-rose-400',
  permission_denied:
    'text-amber-700 dark:text-amber-400',
};

function formatResultLabel(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return 'Unknown';
  }

  const normalized = value.trim();

  if (!normalized) {
    return 'Unknown';
  }

  return normalized
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function normalizeText(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  return normalized || fallback;
}

function normalizeCount(
  value: unknown,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeScore(
  value: unknown,
): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.min(
    100,
    Math.max(0, value),
  );
}

function getResultTone(
  result: unknown,
): string {
  if (
    typeof result === 'string' &&
    result in RESULT_TONE
  ) {
    return RESULT_TONE[
      result as ResultTone
    ];
  }

  return 'text-slate-500 dark:text-slate-400';
}

function formatScore(
  score: number,
): string {
  const normalized = normalizeScore(score);

  if (normalized === null) {
    return 'Not scored';
  }

  return Number.isInteger(normalized)
    ? `${normalized}% of assessed controls passed`
    : `${normalized.toFixed(1)}% of assessed controls passed`;
}

function getApiErrorMessage(
  error: unknown,
): string {
  if (error instanceof ApiError) {
    const message = normalizeText(
      error.message,
      '',
    );

    if (message) {
      return message;
    }
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (
      error as { message?: unknown }
    ).message === 'string'
  ) {
    return normalizeText(
      (
        error as {
          message?: string;
        }
      ).message,
      'The evaluation could not be run.',
    );
  }

  return 'The evaluation could not be run.';
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

interface RunEvaluationProps {
  onComplete?: () => void;
}

export function RunEvaluation({
  onComplete,
}: RunEvaluationProps) {
  const [running, setRunning] =
    useState(false);

  const [result, setResult] =
    useState<ComplianceEvaluationRun | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(null);

  const liveRegionId = useId();

  const run = useCallback(async () => {
    /*
     * This guard is defensive in addition to the disabled button. It prevents
     * duplicate requests if the handler is triggered programmatically or if
     * an event is queued while React is updating the UI.
     */
    if (running) {
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const evaluation =
        await api.evaluateCompliance();

      /*
       * Replace the displayed result only after a successful response.
       * A failed subsequent run therefore does not erase the last successful
       * evaluation from the UI.
       */
      setResult(evaluation);

      onComplete?.();
    } catch (error) {
      /*
       * Preserve the most actionable server message available. Do not replace
       * a useful message such as "no evaluation was run" with a generic
       * "evaluation failed" string.
       */
      setError(
        getApiErrorMessage(error),
      );
    } finally {
      setRunning(false);
    }
  }, [onComplete, running]);

  return (
    <section
      aria-labelledby={`${liveRegionId}-title`}
      className={[
        'rounded-xl border p-4',
        'border-slate-200 bg-white',
        'dark:border-slate-800',
        'dark:bg-slate-900',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${liveRegionId}-title`}
            className="text-sm font-medium text-slate-900 dark:text-slate-50"
          >
            Run an evaluation
          </h2>

          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Assesses the declared controls against
            configuration already collected and records
            each verdict with the evidence behind it.
            Existing evaluations are kept — a new run is
            added beside them, never over them.
          </p>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={running}
          aria-busy={running}
          className={[
            'shrink-0 rounded-lg px-3 py-1.5',
            'text-sm font-medium text-white',
            'bg-brand-600 hover:bg-brand-700',
            'focus:outline-none',
            'focus-visible:ring-2',
            'focus-visible:ring-brand-500',
            'focus-visible:ring-offset-2',
            'dark:focus-visible:ring-offset-slate-900',
            'disabled:cursor-not-allowed',
            'disabled:opacity-60',
            'transition-colors',
          ].join(' ')}
        >
          {running
            ? 'Evaluating…'
            : 'Run evaluation'}
        </button>
      </div>

      {running ? (
        <p
          id={`${liveRegionId}-status`}
          role="status"
          aria-live="polite"
          className="mt-3 text-xs text-slate-500 dark:text-slate-400"
        >
          Evaluation is running. Existing evidence
          remains unchanged until the new run
          completes.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className={[
            'mt-3 rounded-lg p-3 text-sm',
            'bg-rose-50 text-rose-700',
            'dark:bg-rose-950/40',
            'dark:text-rose-300',
          ].join(' ')}
        >
          <p className="font-medium">
            Evaluation could not be completed.
          </p>

          <p className="mt-1 break-words">
            {error}
          </p>
        </div>
      ) : null}

      {result ? (
        <div
          className="mt-3 flex flex-col gap-3"
          aria-label="Evaluation results"
        >
          {Array.isArray(
            result.frameworks,
          ) &&
          result.frameworks.length > 0 ? (
            result.frameworks.map(
              (framework, frameworkIndex) => {
                const frameworkKey =
                  normalizeText(
                    framework.frameworkKey,
                    `framework-${frameworkIndex}`,
                  );

                const frameworkName =
                  normalizeText(
                    framework.name,
                    'Compliance framework',
                  );

                const version =
                  normalizeText(
                    framework.version,
                    '',
                  );

                const score =
                  normalizeScore(
                    framework.score,
                  );

                const counts = isRecord(
                  framework.counts,
                )
                  ? Object.entries(
                      framework.counts,
                    )
                  : [];

                const verdicts =
                  Array.isArray(
                    framework.verdicts,
                  )
                    ? framework.verdicts
                    : [];

                const limitations =
                  normalizeText(
                    framework.limitations,
                    '',
                  );

                return (
                  <article
                    key={`${frameworkKey}-${frameworkIndex}`}
                    className={[
                      'rounded-lg border p-3',
                      'border-slate-200',
                      'dark:border-slate-800',
                    ].join(' ')}
                    aria-labelledby={`${liveRegionId}-${frameworkIndex}-name`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3
                        id={`${liveRegionId}-${frameworkIndex}-name`}
                        className="text-sm font-medium text-slate-900 dark:text-slate-100"
                      >
                        {frameworkName}

                        {version ? (
                          <span className="font-normal text-slate-500 dark:text-slate-400">
                            {' '}
                            v{version}
                          </span>
                        ) : null}
                      </h3>

                      <span
                        className="text-xs text-slate-600 dark:text-slate-400"
                        aria-label={
                          score === null
                            ? 'Framework score not available'
                            : `Framework score ${formatScore(
                                score,
                              )}`
                        }
                      >
                        {score === null
                          ? 'Not scored — some controls could not be assessed'
                          : formatScore(score)}
                      </span>
                    </div>

                    {counts.length > 0 ? (
                      <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {counts.map(
                          ([key, rawCount]) => {
                            const count =
                              normalizeCount(
                                rawCount,
                              );

                            return (
                              <div
                                key={key}
                                className="flex items-center gap-1"
                              >
                                <dt
                                  className={getResultTone(
                                    key,
                                  )}
                                >
                                  {formatResultLabel(
                                    key,
                                  )}
                                </dt>
                                <dd className="tabular-nums text-slate-500 dark:text-slate-400">
                                  {count.toLocaleString()}
                                </dd>
                              </div>
                            );
                          },
                        )}
                      </dl>
                    ) : null}

                    <ul
                      aria-label={`${frameworkName} control verdicts`}
                      className="mt-2 flex flex-col gap-2"
                    >
                      {verdicts.length > 0 ? (
                        verdicts.map(
                          (
                            verdict,
                            verdictIndex,
                          ) => {
                            const controlKey =
                              normalizeText(
                                verdict?.controlKey,
                                `control-${verdictIndex}`,
                              );

                            const resultLabel =
                              formatResultLabel(
                                verdict?.result,
                              );

                            const reason =
                              normalizeText(
                                verdict?.resultReason,
                                'No result reason was provided.',
                              );

                            return (
                              <li
                                key={`${controlKey}-${verdictIndex}`}
                                className="text-xs"
                              >
                                <span className="font-mono text-slate-700 dark:text-slate-300">
                                  {controlKey}
                                </span>{' '}
                                <span
                                  className={getResultTone(
                                    verdict?.result,
                                  )}
                                >
                                  {resultLabel}
                                </span>

                                <span className="text-slate-500 dark:text-slate-400">
                                  {' '}
                                  — {reason}
                                </span>

                                {(typeof verdict?.resourcesEvaluated ===
                                  'number' ||
                                  typeof verdict?.resourcesFailing ===
                                    'number') ? (
                                  <span className="ml-1 text-slate-400 dark:text-slate-500">
                                    (
                                    {normalizeCount(
                                      verdict?.resourcesEvaluated,
                                    ).toLocaleString()}{' '}
                                    evaluated,{' '}
                                    {normalizeCount(
                                      verdict?.resourcesFailing,
                                    ).toLocaleString()}{' '}
                                    failing)
                                  </span>
                                ) : null}
                              </li>
                            );
                          },
                        )
                      ) : (
                        <li className="text-xs text-slate-400">
                          No control verdicts were
                          returned for this framework.
                        </li>
                      )}
                    </ul>

                    {limitations ? (
                      <p className="mt-3 border-t border-slate-100 pt-2 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-300">
                          Limitations:{' '}
                        </span>
                        {limitations}
                      </p>
                    ) : null}
                  </article>
                );
              },
            )
          ) : (
            <div
              role="status"
              className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400"
            >
              The evaluation completed, but no
              framework results were returned.
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
