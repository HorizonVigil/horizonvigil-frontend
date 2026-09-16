import { useCallback, useMemo } from 'react';

import { Icon } from '../icons';
import type { PermissionCheckResult } from '../../lib/api';

const CANNOT_DO = [
  'Modify or delete cloud resources',
  'Change IAM / RBAC policies or role assignments',
  'Read secret values (Secrets Manager, Key Vault, Secret Manager contents)',
  'Make production changes',
  'Move data out of your cloud',
] as const;

type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'error';

interface AccessMatrixProps {
  checks: PermissionCheckResult[];
  lastCheckedAt: string | null;
  onRevalidate?: () => void;
  revalidating?: boolean;
}

interface NormalizedCheck {
  key: string;
  service: string;
  label: string;
  status: PermissionStatus;
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

function normalizeStatus(
  value: unknown,
): PermissionStatus {
  if (
    value === 'granted' ||
    value === 'denied' ||
    value === 'error'
  ) {
    return value;
  }

  /*
   * PermissionCheckResult is expected to be a closed domain type.
   * If malformed runtime data reaches this component, treating it as an
   * error is safer than presenting it as granted access.
   */
  return 'error';
}

function normalizeChecks(
  checks: PermissionCheckResult[] | null | undefined,
): NormalizedCheck[] {
  if (!Array.isArray(checks)) {
    return [];
  }

  return checks.map((check, index) => {
    const service = normalizeText(
      check?.service,
      'unknown-service',
    );

    const label = normalizeText(
      check?.label,
      service,
    );

    const status = normalizeStatus(
      check?.status,
    );

    /*
     * Service is normally unique, but don't rely on that for React keys.
     * Including the index keeps duplicate/malformed service identifiers from
     * producing duplicate React keys.
     */
    return {
      key: `${service}-${index}`,
      service,
      label,
      status,
    };
  });
}

function formatCheckedAt(
  value: string | null,
): string | null {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    return null;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toLocaleString();
}

/**
 * Cloud access transparency matrix.
 *
 * Shows:
 * 1. Permission checks that are currently granted.
 * 2. Permission checks that are denied or errored.
 * 3. The time of the last successful validation timestamp supplied by the
 *    parent.
 * 4. The product's documented non-permitted cloud actions.
 *
 * This component is presentation-only. It does not grant permissions,
 * authorize cloud operations, or determine whether a user is allowed to
 * perform remediation.
 */
export function AccessMatrix({
  checks,
  lastCheckedAt,
  onRevalidate,
  revalidating = false,
}: AccessMatrixProps) {
  const normalizedChecks = useMemo(
    () => normalizeChecks(checks),
    [checks],
  );

  const granted = useMemo(
    () =>
      normalizedChecks.filter(
        (check) => check.status === 'granted',
      ),
    [normalizedChecks],
  );

  const unavailable = useMemo(
    () =>
      normalizedChecks.filter(
        (check) =>
          check.status === 'denied' ||
          check.status === 'error',
      ),
    [normalizedChecks],
  );

  const checkedAtLabel = useMemo(
    () => formatCheckedAt(lastCheckedAt),
    [lastCheckedAt],
  );

  const handleRevalidate = useCallback(() => {
    if (revalidating || !onRevalidate) {
      return;
    }

    onRevalidate();
  }, [onRevalidate, revalidating]);

  const hasChecks = normalizedChecks.length > 0;
  const missingCount = unavailable.length;

  return (
    <div
      className="flex flex-col gap-4"
      aria-busy={revalidating}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          role="status"
          className="text-xs text-slate-400 dark:text-slate-500"
        >
          {!hasChecks ? (
            'Permission validation has not been run for this environment yet.'
          ) : checkedAtLabel ? (
            <>
              Based on the last validation{' '}
              <time dateTime={lastCheckedAt ?? undefined}>
                ({checkedAtLabel})
              </time>
              .
            </>
          ) : (
            'Permission validation results are available. The validation time is unavailable.'
          )}
        </p>

        {onRevalidate && (
          <button
            type="button"
            onClick={handleRevalidate}
            disabled={revalidating}
            aria-busy={revalidating}
            className="shrink-0 self-start text-xs font-medium text-brand-600 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:text-brand-400 dark:focus-visible:ring-offset-slate-950 sm:self-auto"
          >
            {revalidating
              ? 'Revalidating…'
              : 'Revalidate access'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* CAN ACCESS */}
        <section
          aria-labelledby="access-matrix-can-title"
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3
            id="access-matrix-can-title"
            className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <Icon
              name="check-circle"
              size={14}
              className="shrink-0 text-emerald-500"
              aria-hidden="true"
            />

            <span>HorizonVigil can access</span>
          </h3>

          {!hasChecks ? (
            <p
              role="status"
              className="text-xs text-slate-400 dark:text-slate-500"
            >
              Run validation to populate this.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {granted.map((check) => (
                <li
                  key={check.key}
                  className="flex items-start gap-2 text-sm"
                >
                  <Icon
                    name="check"
                    size={13}
                    className="mt-1 shrink-0 text-emerald-500"
                    aria-hidden="true"
                  />

                  <span className="min-w-0 text-slate-600 dark:text-slate-300">
                    {check.label}
                  </span>
                </li>
              ))}

              {unavailable.map((check) => (
                <li
                  key={check.key}
                  className="flex items-start gap-2 text-sm"
                >
                  <Icon
                    name="x"
                    size={13}
                    className="mt-1 shrink-0 text-amber-500"
                    aria-hidden="true"
                  />

                  <span className="min-w-0 text-slate-500 dark:text-slate-400">
                    <span>{check.label}</span>{' '}
                    <span className="text-amber-600 dark:text-amber-400">
                      — {check.status === 'error'
                        ? 'validation error'
                        : 'denied'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {missingCount > 0 && (
            <p
              role="status"
              className="mt-3 text-xs text-amber-700 dark:text-amber-400"
            >
              {missingCount} permission
              {missingCount === 1 ? '' : 's'} unavailable. Some discovery or
              analysis may be incomplete until the required access is granted.
            </p>
          )}
        </section>

        {/* CANNOT ACCESS / ACTION POSTURE */}
        <section
          aria-labelledby="access-matrix-cannot-title"
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <h3
            id="access-matrix-cannot-title"
            className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <Icon
              name="lock"
              size={14}
              className="shrink-0 text-slate-400"
              aria-hidden="true"
            />

            <span>HorizonVigil cannot</span>
          </h3>

          <ul className="flex flex-col gap-1.5">
            {CANNOT_DO.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm"
              >
                <Icon
                  name="x"
                  size={13}
                  className="mt-1 shrink-0 text-slate-400"
                  aria-hidden="true"
                />

                <span className="text-slate-600 dark:text-slate-300">
                  {item}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs leading-5 text-slate-400 dark:text-slate-500">
            Cloud access shown above is based on the permissions granted to
            the connected environment. Any remediation capability must be
            separately authorized and enforced by the backend; this panel does
            not grant or imply permission to modify cloud resources.
          </p>
        </section>
      </div>
    </div>
  );
}