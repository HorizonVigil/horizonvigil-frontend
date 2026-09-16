import type { ScanHealth } from '../../lib/api';

/**
 * Communicates the coverage state behind a resource count.
 *
 * Why it exists:
 * A resource total is only as trustworthy as the collection coverage behind
 * it. When collection is incomplete, the UI must not present the returned
 * total as though it represents the whole estate.
 *
 * This component:
 * - leaves authoritative COMPLETE counts unobstructed;
 * - qualifies PARTIAL / FAILED / RUNNING / NEVER_RUN states;
 * - exposes failed scanners and their scopes;
 * - preserves the distinction between unavailable coverage and an empty estate;
 * - explains that degraded resources are retained rather than treated as
 *   deleted when collection cannot prove absence.
 *
 * The ScanHealth object remains the source of truth. This component does not
 * recalculate scan state or invent failure causes.
 */

type CoverageTone = {
  ring: string;
  dot: string;
  label: string;
};

const TONES: Record<ScanHealth['completeness'], CoverageTone> = {
  COMPLETE: {
    ring:
      'border-emerald-200 dark:border-emerald-900 ' +
      'bg-emerald-50 dark:bg-emerald-950/40',
    dot: 'bg-emerald-500',
    label: 'Complete',
  },
  PARTIAL: {
    ring:
      'border-amber-200 dark:border-amber-900 ' +
      'bg-amber-50 dark:bg-amber-950/40',
    dot: 'bg-amber-500',
    label: 'Incomplete',
  },
  FAILED: {
    ring:
      'border-rose-200 dark:border-rose-900 ' +
      'bg-rose-50 dark:bg-rose-950/40',
    dot: 'bg-rose-500',
    label: 'Failed',
  },
  RUNNING: {
    ring:
      'border-sky-200 dark:border-sky-900 ' +
      'bg-sky-50 dark:bg-sky-950/40',
    dot: 'bg-sky-500',
    label: 'Collecting',
  },
  NEVER_RUN: {
    ring:
      'border-slate-200 dark:border-slate-800 ' +
      'bg-slate-50 dark:bg-slate-900/60',
    dot: 'bg-slate-400',
    label: 'Not yet collected',
  },
};

const MAX_FAILURES_TO_DISPLAY = 5;
const MAX_DEGRADED_TYPES_TO_DISPLAY = 4;

function isFiniteNonNegativeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value)
  );
}

function normalizeCount(value: unknown): number {
  return isFiniteNonNegativeInteger(value)
    ? value
    : 0;
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

function normalizeScopes(
  scopes: unknown,
): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes
    .filter(
      (scope): scope is string =>
        typeof scope === 'string' &&
        scope.trim().length > 0,
    )
    .map((scope) => scope.trim());
}

function normalizeFailureCode(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function formatFailureCause(
  code: string | null,
): string {
  if (!code) {
    return '';
  }

  return code
    .replace(/_/g, ' ')
    .toLowerCase();
}

/**
 * Turns one failure group into the concise explanation a reader needs.
 *
 * The server-provided normalized code is preserved as the remediation signal.
 * We do not infer a cause from `detail`, scanner name, or scope.
 */
function describeFailure(
  failure: ScanHealth['failures'][number],
): string {
  const scanner = normalizeText(
    failure?.scanner,
    'Unknown scanner',
  );

  const scopes = normalizeScopes(
    failure?.scopes,
  );

  let where = 'unknown scope';

  if (scopes.length === 1) {
    where = scopes[0];
  } else if (scopes.length > 1) {
    where = `${scopes.length} regions`;
  }

  const code = formatFailureCause(
    normalizeFailureCode(
      failure?.normalizedCode,
    ),
  );

  return `${scanner} failed in ${where}${
    code ? ` (${code})` : ''
  }`;
}

function getTone(
  completeness: ScanHealth['completeness'],
): CoverageTone {
  return (
    TONES[completeness] ?? {
      ring:
        'border-slate-200 dark:border-slate-800 ' +
        'bg-slate-50 dark:bg-slate-900/60',
      dot: 'bg-slate-400',
      label: 'Coverage unavailable',
    }
  );
}

function getScopeSummary(
  failedSteps: number,
  totalSteps: number,
): string | null {
  if (totalSteps <= 0) {
    return null;
  }

  return `${Math.min(
    failedSteps,
    totalSteps,
  ).toLocaleString()} of ${totalSteps.toLocaleString()} collection steps failed`;
}

function getSuccessSummary(
  succeededSteps: number,
  totalSteps: number,
): string | null {
  if (totalSteps <= 0) {
    return null;
  }

  return `${Math.min(
    succeededSteps,
    totalSteps,
  ).toLocaleString()} of ${totalSteps.toLocaleString()} collection steps succeeded`;
}

function normalizeFailures(
  failures: ScanHealth['failures'],
): ScanHealth['failures'] {
  if (!Array.isArray(failures)) {
    return [];
  }

  return failures.filter(
    (failure) =>
      Boolean(
        failure &&
          typeof failure === 'object' &&
          typeof failure.scanner ===
            'string',
      ),
  );
}

function normalizeDegradedResourceTypes(
  resourceTypes: ScanHealth['degradedResourceTypes'],
): string[] {
  if (!Array.isArray(resourceTypes)) {
    return [];
  }

  return resourceTypes
    .filter(
      (resourceType): resourceType is string =>
        typeof resourceType === 'string' &&
        resourceType.trim().length > 0,
    )
    .map((resourceType) =>
      resourceType.trim(),
    );
}

interface ScanCoverageBannerProps {
  health: ScanHealth | null;
}

export function ScanCoverageBanner({
  health,
}: ScanCoverageBannerProps) {
  /*
   * Null means the coverage itself could not be read. Rendering nothing would
   * imply the count is trustworthy, which is exactly the false-clean state
   * this component is intended to prevent.
   */
  if (!health) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={[
          'mb-4 rounded-xl border px-4 py-3 text-sm',
          'border-slate-200 bg-slate-50 text-slate-600',
          'dark:border-slate-800 dark:bg-slate-900/60',
          'dark:text-slate-300',
        ].join(' ')}
      >
        <p className="font-medium">
          Scan coverage could not be read.
        </p>
        <p className="mt-0.5">
          The resource count below is
          unverified.
        </p>
      </div>
    );
  }

  /*
   * A complete scan is the ordinary case. Do not insert a warning banner
   * between the user and the inventory when the authoritative coverage says
   * the collection completed successfully.
   */
  if (
    health.completeness === 'COMPLETE'
  ) {
    return null;
  }

  const tone = getTone(
    health.completeness,
  );

  const totalSteps = normalizeCount(
    health.totalSteps,
  );
  const succeededSteps = Math.min(
    normalizeCount(health.succeededSteps),
    totalSteps || Number.MAX_SAFE_INTEGER,
  );
  const failedSteps = normalizeCount(
    health.failedSteps,
  );

  const failures = normalizeFailures(
    health.failures,
  );

  const degradedResourceTypes =
    normalizeDegradedResourceTypes(
      health.degradedResourceTypes,
    );

  const summary = normalizeText(
    health.summary,
    'Collection coverage is incomplete or unavailable.',
  );

  const successSummary =
    getSuccessSummary(
      succeededSteps,
      totalSteps,
    );

  const failureSummary =
    getScopeSummary(
      failedSteps,
      totalSteps,
    );

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'mb-4 rounded-xl border px-4 py-3',
        tone.ring,
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            tone.dot,
          ].join(' ')}
          aria-hidden="true"
        />

        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {tone.label}

            {successSummary ? (
              <span className="ml-2 font-normal text-slate-600 dark:text-slate-400">
                {successSummary}
              </span>
            ) : null}
          </p>

          {failureSummary &&
          health.completeness ===
            'FAILED' ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {failureSummary}
            </p>
          ) : null}

          <p className="mt-0.5 break-words text-sm text-slate-700 dark:text-slate-300">
            {summary}
          </p>

          {failures.length > 0 ? (
            <ul
              className={[
                'mt-2 space-y-0.5',
                'text-sm text-slate-600',
                'dark:text-slate-400',
              ].join(' ')}
              aria-label="Collection failures"
            >
              {failures
                .slice(
                  0,
                  MAX_FAILURES_TO_DISPLAY,
                )
                .map((failure, index) => (
                  <li
                    key={`${normalizeText(
                      failure.scanner,
                      'scanner',
                    )}-${index}`}
                    className="break-words"
                  >
                    • {describeFailure(failure)}
                  </li>
                ))}

              {failures.length >
              MAX_FAILURES_TO_DISPLAY ? (
                <li className="text-slate-500 dark:text-slate-500">
                  • and{' '}
                  {(
                    failures.length -
                    MAX_FAILURES_TO_DISPLAY
                  ).toLocaleString()}{' '}
                  more
                </li>
              ) : null}
            </ul>
          ) : null}

          {degradedResourceTypes.length >
          0 ? (
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
              <span className="font-medium">
                Existing{' '}
              </span>

              {degradedResourceTypes
                .slice(
                  0,
                  MAX_DEGRADED_TYPES_TO_DISPLAY,
                )
                .join(', ')}

              {degradedResourceTypes.length >
              MAX_DEGRADED_TYPES_TO_DISPLAY
                ? ` and ${
                    degradedResourceTypes.length -
                    MAX_DEGRADED_TYPES_TO_DISPLAY
                  } other types`
                : ''}

              {' '}were kept rather than
              marked deleted, because this
              run could not prove they are
              gone.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Qualifier for a headline resource count when collection coverage is not
 * authoritative.
 *
 * Examples:
 *   complete + authoritative -> null
 *   partial                  -> "at least — scan incomplete"
 *   failed                   -> "at least — scan incomplete"
 *   never run                -> "not yet collected"
 *   unavailable              -> null
 *
 * The null case means the caller has no coverage object and should not silently
 * present the associated count as verified.
 */
export function countQualifier(
  health: ScanHealth | null,
): string | null {
  if (!health) {
    return null;
  }

  if (health.countIsAuthoritative) {
    return null;
  }

  if (
    health.completeness === 'NEVER_RUN'
  ) {
    return 'not yet collected';
  }

  return 'at least — scan incomplete';
}
