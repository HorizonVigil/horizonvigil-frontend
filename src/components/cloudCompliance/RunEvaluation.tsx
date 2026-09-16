import { useState } from 'react';
import { api, ApiError, type ComplianceEvaluationRun } from '../../lib/api';

/**
 * Runs a compliance evaluation and reports what it produced.
 *
 * Without this the Compliance page was permanently empty. Its empty state was
 * honest — "No control evaluations have been collected" — but a customer had
 * no way to make it collect any, so the honest message was also a dead end.
 *
 * The result summary is deliberately not a single number. `score` is null
 * whenever any control could not be assessed, and rendering that as "0%" or
 * hiding the nulls would turn "we could not check three of five controls" into
 * an assessment of the whole framework.
 */

const RESULT_TONE: Record<string, string> = {
  failed: 'text-rose-700 dark:text-rose-400',
  passed: 'text-emerald-700 dark:text-emerald-400',
  not_evaluated: 'text-amber-700 dark:text-amber-400',
  not_applicable: 'text-slate-500',
  error: 'text-rose-700 dark:text-rose-400',
  permission_denied: 'text-amber-700 dark:text-amber-400',
};

const label = (r: string) => r.replace(/_/g, ' ');

export function RunEvaluation({ onComplete }: { onComplete?: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ComplianceEvaluationRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await api.evaluateCompliance();
      setResult(r);
      onComplete?.();
    } catch (e) {
      // The server's message is shown as-is: it distinguishes "no service key
      // configured, nothing was run" from a genuine failure, and flattening
      // that to "evaluation failed" would lose the difference.
      setError(e instanceof ApiError ? e.message : 'The evaluation could not be run.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-slate-900 dark:text-slate-50">Run an evaluation</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Assesses the declared controls against configuration already collected, and records each
            verdict with the evidence behind it. Existing evaluations are kept — a new run is added
            beside them, never over them.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {running ? 'Evaluating…' : 'Run evaluation'}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      )}

      {result && result.frameworks.map((f) => (
        <div key={f.frameworkKey} className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{f.name} v{f.version}</span>
            {/*
              A score only when every control was assessed. Otherwise the
              counts stand on their own -- "4 of 5 passed, 1 not evaluated" is
              the honest shape; "80%" is not.
            */}
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {f.score === null
                ? 'Not scored — some controls could not be assessed'
                : `${f.score}% of assessed controls passed`}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {Object.entries(f.counts).map(([k, n]) => (
              <span key={k} className={RESULT_TONE[k] ?? 'text-slate-500'}>{n} {label(k)}</span>
            ))}
          </div>

          <ul className="mt-2 space-y-1">
            {f.verdicts.map((v) => (
              <li key={v.controlKey} className="text-xs">
                <span className="font-mono text-slate-700 dark:text-slate-300">{v.controlKey}</span>{' '}
                <span className={RESULT_TONE[v.result] ?? 'text-slate-500'}>{label(v.result)}</span>
                <span className="text-slate-500 dark:text-slate-400"> — {v.resultReason}</span>
              </li>
            ))}
          </ul>

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{f.limitations}</p>
        </div>
      ))}
    </div>
  );
}
