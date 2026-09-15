import type { ScanHealth } from '../../lib/api';

/**
 * States the coverage behind a resource count.
 *
 * WHY IT EXISTS
 *
 * The Overview tab rendered `resource_summary.totalResources` as a bare
 * number. On 2026-09-15 an account showed **430 resources** with `errors: 0`
 * beside it, while EC2 had failed in all 17 regions — instances, volumes,
 * VPCs, subnets and security groups had returned nothing anywhere, and those
 * rows were stale. The failures lived on the collection run's step rows,
 * which no screen read.
 *
 * A count with no coverage is a claim the data does not support. This does not
 * hide the number — hiding it would be its own dishonesty — it qualifies it,
 * and names what is missing so the reader can judge.
 */

const TONE: Record<ScanHealth['completeness'], { ring: string; dot: string; label: string }> = {
  COMPLETE:  { ring: 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40', dot: 'bg-emerald-500', label: 'Complete' },
  PARTIAL:   { ring: 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40',         dot: 'bg-amber-500',   label: 'Incomplete' },
  FAILED:    { ring: 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40',             dot: 'bg-rose-500',    label: 'Failed' },
  RUNNING:   { ring: 'border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/40',                 dot: 'bg-sky-500',     label: 'Collecting' },
  NEVER_RUN: { ring: 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60',         dot: 'bg-slate-400',   label: 'Not yet collected' },
};

/** Turns a failure group into the sentence a reader actually needs. */
function describeFailure(f: ScanHealth['failures'][number]): string {
  const where = f.scopes.length === 1 ? f.scopes[0] : `${f.scopes.length} regions`;
  // The normalized code is the remedy signal: PERMISSION_DENIED is a policy
  // fix, UNSUPPORTED_CAPABILITY is a retired or un-enabled service, THROTTLED
  // resolves itself. Omitting it when causes differ is deliberate — naming one
  // of several would send someone to fix the wrong thing.
  const cause = f.normalizedCode ? ` (${f.normalizedCode.toLowerCase().replace(/_/g, ' ')})` : '';
  return `${f.scanner} failed in ${where}${cause}`;
}

export function ScanCoverageBanner({ health }: { health: ScanHealth | null }) {
  // Null means the coverage itself could not be read. Rendering nothing would
  // imply the count is fine, which is the assumption this component removes.
  if (!health) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-4 py-3 mb-4 text-sm text-slate-600 dark:text-slate-300">
        Scan coverage could not be read, so the resource count below is unverified.
      </div>
    );
  }

  // A complete scan is the ordinary case and does not deserve a banner
  // competing with the data. The count is simply allowed to stand.
  if (health.completeness === 'COMPLETE') return null;

  const tone = TONE[health.completeness];

  return (
    <div className={`rounded-xl border ${tone.ring} px-4 py-3 mb-4`} role="status">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {tone.label}
            {health.totalSteps > 0 && (
              <span className="ml-2 font-normal text-slate-600 dark:text-slate-400">
                {health.succeededSteps.toLocaleString()} of {health.totalSteps.toLocaleString()} collection steps succeeded
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{health.summary}</p>

          {health.failures.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm text-slate-600 dark:text-slate-400">
              {health.failures.slice(0, 5).map((f) => (
                <li key={f.scanner}>• {describeFailure(f)}</li>
              ))}
              {health.failures.length > 5 && (
                <li className="text-slate-500">• and {health.failures.length - 5} more</li>
              )}
            </ul>
          )}

          {health.degradedResourceTypes.length > 0 && (
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              {/* The reassuring half, and it is true: incomplete coverage
                  suppresses deletion rather than causing it. */}
              Existing {health.degradedResourceTypes.slice(0, 4).join(', ')}
              {health.degradedResourceTypes.length > 4 ? ` and ${health.degradedResourceTypes.length - 4} other types` : ''}
              {' '}were kept rather than marked deleted, because this run could not prove they are gone.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Suffix for a headline count whose scan did not complete.
 *
 * "430" and "at least 430" are different claims, and only the second is true
 * when a scanner failed. Kept deliberately short so it reads as a qualifier
 * rather than an error.
 */
export function countQualifier(health: ScanHealth | null): string | null {
  if (!health || health.countIsAuthoritative) return null;
  if (health.completeness === 'NEVER_RUN') return 'not yet collected';
  return 'at least — scan incomplete';
}
