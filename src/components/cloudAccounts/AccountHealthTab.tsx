import { useQuery } from '@tanstack/react-query';

import { Badge } from '../Badge';
import { CardSkeleton } from '../Skeleton';
import { Icon } from '../icons';

import {
  api,
  friendlyErrorMessage,
  type HealthSignalStatus,
} from '../../lib/api';

import {
  HEALTH_STATE_TONE,
  HEALTH_STATE_LABEL,
} from '../../lib/cloudAccounts/health';

type Provider = 'aws' | 'gcp' | 'azure';

interface AccountHealthTabProps {
  id: string;
  provider: Provider;
}

const DOT: Record<HealthSignalStatus, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  fail: 'bg-red-500',
  unknown: 'bg-slate-400',
};

const STATUS_LABEL: Record<HealthSignalStatus, string> = {
  ok: 'OK',
  warn: 'Warning',
  fail: 'Failed',
  unknown: 'Unknown',
};

const MIN_HEALTH_SCORE = 0;
const MAX_HEALTH_SCORE = 100;

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

function normalizeHealthScore(
  value: unknown,
): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return null;
  }

  return Math.min(
    MAX_HEALTH_SCORE,
    Math.max(MIN_HEALTH_SCORE, value),
  );
}

function normalizeSignalStatus(
  value: unknown,
): HealthSignalStatus {
  if (
    value === 'ok' ||
    value === 'warn' ||
    value === 'fail' ||
    value === 'unknown'
  ) {
    return value;
  }

  /*
   * Unknown/malformed runtime values must never be presented as healthy.
   */
  return 'unknown';
}

function normalizeWeight(
  value: unknown,
): string {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();

    if (normalized) {
      return normalized;
    }
  }

  return '—';
}

function getDotClass(
  status: HealthSignalStatus,
): string {
  return DOT[status];
}

function getStatusLabel(
  status: HealthSignalStatus,
): string {
  return STATUS_LABEL[status];
}

function isValidProvider(
  value: string,
): value is Provider {
  return (
    value === 'aws' ||
    value === 'gcp' ||
    value === 'azure'
  );
}

function getSafeHealthState(
  state: unknown,
): keyof typeof HEALTH_STATE_LABEL {
  if (
    typeof state === 'string' &&
    state in HEALTH_STATE_LABEL
  ) {
    return state as keyof typeof HEALTH_STATE_LABEL;
  }

  /*
   * Do not map malformed data to a healthy state.
   * `unknown` is the safe presentation state if it exists in the domain map.
   */
  if ('unknown' in HEALTH_STATE_LABEL) {
    return 'unknown' as keyof typeof HEALTH_STATE_LABEL;
  }

  /*
   * Object.keys() is string[], so its first element is a string rather than a
   * HealthState. Casting it hid that the fallback depended on key ORDER --
   * reordering the label map would silently change the default state. The
   * union is the authority, so it is read from there.
   */
  /*
   * 'unknown' directly, rather than Object.keys()[0].
   *
   * The key-order fallback was both untyped (Object.keys is string[]) and
   * arbitrary -- reordering the label map would have changed the default
   * health state. 'unknown' is the honest default for a state that could not
   * be determined, and the branch above already returns it when present.
   */
  return 'unknown';
}

/**
 * Per-account Health tab.
 *
 * Displays the explainable account health score and the signals returned by
 * the account-health API.
 *
 * The component is presentation-only:
 * - It does not calculate or override the health score.
 * - It does not grant permissions.
 * - It does not infer missing signals as healthy.
 * - Backend/API authorization remains authoritative.
 */
export function AccountHealthTab({
  id,
  provider,
}: AccountHealthTabProps) {
  const normalizedId =
    typeof id === 'string' ? id.trim() : '';

  const validProvider = isValidProvider(provider);

  const query = useQuery({
    queryKey: [
      'account-health',
      provider,
      normalizedId,
    ],

    queryFn: () =>
      api.getAccountHealth(
        normalizedId,
        provider,
      ),

    enabled:
      normalizedId.length > 0 &&
      validProvider,

    staleTime: 60_000,

    /*
     * Health reads should not automatically repeat indefinitely.
     * The caller can explicitly refetch/retry after an error.
     */
    retry: false,
  });

  /*
   * Invalid route/input state.
   *
   * Do not make an API call with an empty account ID or unsupported provider.
   */
  if (!normalizedId || !validProvider) {
    return (
      <div
        role="alert"
        className="max-w-2xl rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
      >
        Account health is unavailable because the account identifier or
        provider is invalid.
      </div>
    );
  }

  if (query.isPending) {
    return <CardSkeleton lines={5} />;
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
      >
        <p>
          Couldn&apos;t load account health:{' '}
          {friendlyErrorMessage(query.error)}
        </p>

        <button
          type="button"
          onClick={() => {
            void query.refetch();
          }}
          disabled={query.isFetching}
          className="mt-2 font-medium underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950"
        >
          {query.isFetching
            ? 'Retrying…'
            : 'Retry'}
        </button>
      </div>
    );
  }

  /*
   * `isSuccess` does not guarantee a useful runtime payload if the API layer
   * has weak runtime validation. Never use `query.data!`.
   */
  const health = query.data;

  if (!health) {
    return (
      <div
        role="alert"
        className="max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
      >
        Account health data was not returned for this account.
      </div>
    );
  }

  const healthState = getSafeHealthState(
    health.state,
  );

  const score = normalizeHealthScore(
    health.score,
  );

  const signals = Array.isArray(health.signals)
    ? health.signals
    : [];

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {/* SCORE SUMMARY */}
      <section
        aria-labelledby="account-health-summary-title"
        className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="account-health-summary-title"
          className="sr-only"
        >
          Account health summary
        </h2>

        <div className="flex items-center gap-4">
          <div
            aria-label={
              score === null
                ? 'Health score unavailable'
                : `Health score ${score} out of 100`
            }
            className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white"
          >
            {healthState === 'unknown' || score === null
              ? '—'
              : score}
          </div>

          <div className="min-w-0">
            <Badge
              tone={
                HEALTH_STATE_TONE[healthState]
              }
            >
              {HEALTH_STATE_LABEL[healthState]}
            </Badge>

            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Weighted roll-up of the five health signals.
            </p>
          </div>
        </div>
      </section>

      {/* SIGNALS */}
      <section
        aria-labelledby="account-health-signals-title"
        className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      >
        <h2
          id="account-health-signals-title"
          className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-200"
        >
          Health signals
        </h2>

        {signals.length === 0 ? (
          <div
            role="status"
            className="px-4 py-5 text-xs text-slate-500 dark:text-slate-400"
          >
            No health signals were returned for this account.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {signals.map((signal, index) => {
              const status =
                normalizeSignalStatus(
                  signal?.status,
                );

              const label = normalizeText(
                signal?.label,
                'Unnamed signal',
              );

              const detail = normalizeText(
                signal?.detail,
                'No additional details available.',
              );

              const key = normalizeText(
                signal?.key,
                `signal-${index}`,
              );

              const weight = normalizeWeight(
                signal?.weight,
              );

              return (
                <li
                  key={`${key}-${index}`}
                  className="flex items-start gap-3 px-4 py-3"
                >
                  {/* Status indicator */}
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${getDotClass(
                      status,
                    )}`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                        {label}
                      </span>

                      <span className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        weight {weight}
                      </span>

                      <span className="sr-only">
                        Status: {getStatusLabel(status)}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {detail}
                    </p>
                  </div>

                  {status === 'fail' && (
                    <Icon
                      name="alert-triangle"
                      size={13}
                      className="mt-1 shrink-0 text-red-500"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}