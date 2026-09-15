import type { PostureCheckReport, PostureCheckResult } from '../../lib/api';

/**
 * AWS-16 posture that HorizonVigil derived from collected configuration.
 *
 * Rendered as its own block, never merged into the provider-native
 * misconfiguration list. Those findings are AWS's own assertion and can go to
 * an auditor; these are ours, computed from inventory. Blending them would
 * launder one provenance into the other.
 *
 * The outcome vocabulary is the point of this component. Three of the four
 * outcomes produce zero failures and only one of them means "nothing is
 * wrong":
 *
 *   PASS            evaluated against real resources, all compliant
 *   NOT_APPLICABLE  no resources of this type exist here
 *   NOT_COLLECTED   resources exist, but none carry the field the rule reads
 *
 * Collapsing those into a green zero is how a posture page comes to reassure
 * someone about an estate nobody examined.
 */

const OUTCOME: Record<PostureCheckResult['outcome'], { label: string; cls: string; dot: string }> = {
  FAIL:           { label: 'Failing',        cls: 'text-rose-700 dark:text-rose-400',       dot: 'bg-rose-500' },
  PASS:           { label: 'Passing',        cls: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  NOT_APPLICABLE: { label: 'Not applicable', cls: 'text-slate-500',                         dot: 'bg-slate-300' },
  NOT_COLLECTED:  { label: 'Not checked',    cls: 'text-amber-700 dark:text-amber-400',     dot: 'bg-amber-500' },
};

const SEVERITY: Record<PostureCheckResult['severity'], string> = {
  critical: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  high:     'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  medium:   'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  low:      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function CheckRow({ check }: { check: PostureCheckResult }) {
  const tone = OUTCOME[check.outcome];
  return (
    <li className="py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{check.title}</span>
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SEVERITY[check.severity]}`}>{check.severity}</span>
            <span className={`text-xs font-medium ${tone.cls}`}>
              {tone.label}
              {check.outcome === 'FAIL' && ` — ${check.failing} of ${check.evaluated}`}
              {check.outcome === 'PASS' && ` — ${check.evaluated} checked`}
            </span>
          </div>

          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{check.rationale}</p>

          {/* Why a rule could not run is more useful than its absence. */}
          {check.outcome === 'NOT_COLLECTED' && check.unavailableReason && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{check.unavailableReason}</p>
          )}

          {check.examples.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {check.examples.map((e) => (
                <li key={e.resourceId} className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                  {e.resourceId}
                  {e.region && <span className="text-slate-400"> · {e.region}</span>}
                  <span className="text-slate-400"> · {e.detail}</span>
                </li>
              ))}
              {/* The count above is authoritative; the sample is bounded. */}
              {check.failing > check.examples.length && (
                <li className="text-xs text-slate-500">and {check.failing - check.examples.length} more</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function DerivedPostureChecks({ report }: { report: PostureCheckReport | null }) {
  if (!report) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Configuration checks</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          These checks could not be loaded, so nothing here has been evaluated.
        </p>
      </div>
    );
  }

  const { summary } = report;
  // Worst first: failing, then unrunnable, then the quiet ones.
  const order: Record<PostureCheckResult['outcome'], number> = { FAIL: 0, NOT_COLLECTED: 1, PASS: 2, NOT_APPLICABLE: 3 };
  const checks = [...report.checks].sort((a, b) => order[a.outcome] - order[b.outcome]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Configuration checks</h3>
        {/*
          Provenance stated on the surface, not just in the payload. These are
          HorizonVigil's own checks over collected inventory — a different
          claim from AWS Config's, which is what the Misconfigurations tab
          serves.
        */}
        <span className="text-xs text-slate-500">
          Derived by HorizonVigil from collected configuration · {report.connectionsInScope} account{report.connectionsInScope === 1 ? '' : 's'}
        </span>
      </div>

      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
        {summary.failing > 0
          ? `${summary.failing} check${summary.failing === 1 ? '' : 's'} failing across ${summary.affectedResources} resource${summary.affectedResources === 1 ? '' : 's'}.`
          : summary.passing > 0
            ? `No failing checks. ${summary.passing} evaluated against real resources.`
            : 'Nothing has been evaluated yet.'}
        {summary.notCollected > 0 && ` ${summary.notCollected} could not run.`}
      </p>

      <ul className="mt-2">
        {checks.map((c) => <CheckRow key={c.key} check={c} />)}
      </ul>

      {report.gaps.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 p-3">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">Not covered by these checks</p>
          {/*
            Declared rather than omitted. A posture list that silently lacks the
            checks a customer expects reads as "nothing wrong here"; naming the
            gap is the difference between incomplete and misleading.
          */}
          <ul className="mt-1 space-y-1">
            {report.gaps.map((g) => (
              <li key={g.key} className="text-xs text-slate-600 dark:text-slate-400">
                <span className="text-slate-700 dark:text-slate-300">{g.title}</span> — {g.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
