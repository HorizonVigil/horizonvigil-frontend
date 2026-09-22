/**
 * Cloud Accounts — Changes tab (spec §38).
 *
 * Displays a normalized cloud-configuration change timeline for a selected
 * environment:
 *
 * - AWS: CloudTrail management events
 * - Azure: Activity Log / control-plane events
 * - GCP: Admin Activity audit logs
 *
 * Important:
 * - The backend/API remains the source of truth for event filtering.
 * - The UI must never fabricate an event or reinterpret an unavailable
 *   provider response as "no changes".
 * - AWS read-only events are opt-in because the default "Changes" view is
 *   intended to focus on configuration mutations.
 * - Server-side authorization must remain enforced by the API.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { CardSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { Icon } from '../icons';
import { api, friendlyErrorMessage, type ChangeProvenance } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';
import { ProviderChips, type ProviderValue } from './ProviderChips';

interface Change {
  id: string;
  when: string | null;
  who: string;
  operation: string;
  status: string | null;
  resource: string | null;
  extra: string | null;
  /**
   * How the change was made, classified server-side. Absent for providers
   * whose feed does not carry the signals (GCP/Azure today) -- which is why
   * this is optional rather than defaulted to 'unknown': "we did not classify
   * this provider" and "we classified it and could not tell" are different
   * statements, and only the second deserves a badge.
   */
  provenance?: ChangeProvenance;
}

/**
 * How a change was made, at a glance.
 *
 * The point of the colour is triage, not decoration: a security group changed
 * by Terraform at 14:00 and the same change made by hand in the console at
 * 02:00 demand completely different responses, and until now the feed showed
 * an IAM role name for both.
 *
 * `unknown` is deliberately NOT styled as a warning. It is not a problem with
 * the change -- it is the absence of a signal, and colouring it red would
 * train people to chase CloudTrail's gaps instead of their own estate. It
 * carries the reason as a tooltip so the gap is explicable, not just visible.
 */
function ActorBadge({ provenance }: { provenance: ChangeProvenance }) {
  const tone =
    provenance.actorClass === 'human'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : provenance.actorClass === 'automation'
        ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
        : provenance.actorClass === 'aws_service'
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          : 'bg-slate-50 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500';

  const label =
    provenance.actorLabel
    ?? (provenance.actorClass === 'unknown' ? 'Unattributed' : 'Unknown');

  return (
    <span
      className={['inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium', tone].join(' ')}
      title={provenance.summary}
    >
      {label}
    </span>
  );
}

interface ChangesPanelProps {
  rows: UnifiedAccountRow[];
}

const DEFAULT_PROVIDER_LABEL = 'CLOUD';
const UNKNOWN_VALUE = 'Unknown';

const PROVIDER_LABELS: Record<ProviderValue, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};

const CHANGE_WINDOW_LABEL = 'last 30 days';

function isProviderValue(value: unknown): value is ProviderValue {
  return value === 'aws' || value === 'azure' || value === 'gcp';
}

function normalizeText(
  value: unknown,
  fallback = UNKNOWN_VALUE,
): string {
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim();

  return normalized || fallback;
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();

  return normalized || null;
}

function normalizeChangeId(value: unknown, fallback: string): string {
  const normalized = normalizeNullableText(value);

  return normalized ?? fallback;
}

function isValidDate(value: string | null): boolean {
  if (!value) return false;

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp);
}

function formatEventDate(value: string | null): string {
  if (!value || !isValidDate(value)) {
    return 'Date unavailable';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return 'Date unavailable';
  }
}

function normalizeStatus(value: unknown): string | null {
  const status = normalizeNullableText(value);

  if (!status) return null;

  return status.toLowerCase();
}

function isErrorStatus(status: string | null): boolean {
  return (
    status === 'error' ||
    status === 'failed' ||
    status === 'failure' ||
    status === 'denied'
  );
}

function providerDisplayName(provider: ProviderValue | undefined): string {
  if (!provider) return DEFAULT_PROVIDER_LABEL;

  return PROVIDER_LABELS[provider] ?? DEFAULT_PROVIDER_LABEL;
}

function getChangeWindowDescription(
  provider: ProviderValue | undefined,
  includeReadOnly: boolean,
): string {
  if (provider === 'aws') {
    return includeReadOnly
      ? `CloudTrail events, including read-only events · ${CHANGE_WINDOW_LABEL}`
      : `CloudTrail configuration changes · ${CHANGE_WINDOW_LABEL}`;
  }

  if (provider === 'azure') {
    return `Activity Log (control plane) · ${CHANGE_WINDOW_LABEL}`;
  }

  if (provider === 'gcp') {
    return `Admin Activity audit logs · ${CHANGE_WINDOW_LABEL}`;
  }

  return `Cloud configuration activity · ${CHANGE_WINDOW_LABEL}`;
}

function normalizeAwsChanges(
  events: Awaited<
    ReturnType<typeof api.getAccountCloudTrailEvents>
  >['events'],
): Change[] {
  if (!Array.isArray(events)) {
    return [];
  }

  return events
    .map((event, index): Change | null => {
      if (!event || typeof event !== 'object') {
        return null;
      }

      const eventId = normalizeNullableText(event.eventId);

      /*
       * A stable backend event identifier is required for reliable React
       * reconciliation. Do not use array position as the primary identity.
       *
       * The fallback is only defensive for malformed upstream payloads.
       */
      const id = normalizeChangeId(
        eventId,
        `aws-change-${index}`,
      );

      const resource =
        Array.isArray(event.resources)
          ? event.resources
              .map((resourceEntry) => {
                if (
                  !resourceEntry ||
                  typeof resourceEntry !== 'object'
                ) {
                  return null;
                }

                return normalizeNullableText(
                  resourceEntry.resourceName,
                );
              })
              .find(Boolean) ?? null
          : null;

      const source = normalizeNullableText(event.eventSource);
      const region = normalizeNullableText(event.awsRegion);
      const errorCode = normalizeNullableText(event.errorCode);

      const extraParts = [source, region, errorCode].filter(
        (part): part is string => Boolean(part),
      );

      return {
        id,
        when: normalizeNullableText(event.eventTime),
        who: normalizeText(
          event.username ?? event.userIdentityType,
        ),
        provenance: event.provenance,
        operation: normalizeText(event.eventName),
        status: errorCode ? 'error' : 'ok',
        resource,
        extra: extraParts.length > 0
          ? extraParts.join(' · ')
          : null,
      };
    })
    .filter((event): event is Change => event !== null);
}

function normalizeProviderChanges(
  events: Awaited<
    ReturnType<typeof api.getProviderChanges>
  >['events'],
): Change[] {
  if (!Array.isArray(events)) {
    return [];
  }

  return events
    .map((event, index): Change | null => {
      if (!event || typeof event !== 'object') {
        return null;
      }

      const id = normalizeChangeId(
        event.id,
        `provider-change-${index}`,
      );

      const resourceType = normalizeNullableText(
        event.resourceType,
      );

      const level = normalizeNullableText(event.level);

      const extraParts = [resourceType, level].filter(
        (part): part is string => Boolean(part),
      );

      return {
        id,
        when: normalizeNullableText(event.when),
        who: normalizeText(event.who),
        // No provenance: the GCP/Azure change feeds do not carry the signals
        // CloudTrail does, and inventing an 'unknown' badge for them would
        // claim we classified something we never looked at.
        operation: normalizeText(event.operation),
        status: normalizeStatus(event.status),
        resource: normalizeNullableText(event.resource),
        extra: extraParts.length > 0
          ? extraParts.join(' · ')
          : null,
      };
    })
    .filter((event): event is Change => event !== null);
}

function sortChangesByTime(events: Change[]): Change[] {
  return [...events].sort((a, b) => {
    const aTime = a.when ? Date.parse(a.when) : Number.NEGATIVE_INFINITY;
    const bTime = b.when ? Date.parse(b.when) : Number.NEGATIVE_INFINITY;

    /*
     * Newest events first.
     *
     * If either timestamp is invalid, retain deterministic ordering rather
     * than allowing NaN to produce unstable sort behavior.
     */
    const safeATime = Number.isFinite(aTime)
      ? aTime
      : Number.NEGATIVE_INFINITY;

    const safeBTime = Number.isFinite(bTime)
      ? bTime
      : Number.NEGATIVE_INFINITY;

    if (safeBTime !== safeATime) {
      return safeBTime - safeATime;
    }

    return a.id.localeCompare(b.id);
  });
}

function getEmptyStateCopy(
  provider: ProviderValue | undefined,
  includeReadOnly: boolean,
): {
  title: string;
  description: string;
} {
  if (includeReadOnly) {
    if (provider === 'aws') {
      return {
        title: 'No recent activity',
        description:
          'No CloudTrail events were returned for this environment in the selected window.',
      };
    }

    return {
      title: 'No recent activity',
      description:
        'No cloud activity was returned for this environment in the selected window.',
    };
  }

  if (provider === 'aws') {
    return {
      title: 'No recent changes',
      description:
        'No configuration changes were returned in the selected window. Read-only CloudTrail calls are hidden by default.',
    };
  }

  return {
    title: 'No recent changes',
    description:
      'No configuration changes were returned for this environment in the selected window.',
  };
}

export function ChangesPanel({
  rows,
}: ChangesPanelProps) {
  const environmentLabelId = useId();
  const readOnlyLabelId = useId();
  const timelineLabelId = useId();

  const [provider, setProvider] =
    useState<ProviderValue | null>(null);

  const [selected, setSelected] = useState<string>('');

  /*
   * AWS-P1-05:
   *
   * The Changes view intentionally defaults to configuration mutations.
   * Read-only events remain available because they can be useful for audit
   * investigations, but they should not dominate a page whose primary purpose
   * is answering "who changed what?"
   */
  const [includeReadOnly, setIncludeReadOnly] =
    useState(false);

  const counts = useMemo(() => {
    const result: Partial<Record<ProviderValue, number>> = {};

    for (const row of rows) {
      if (!isProviderValue(row.provider)) {
        continue;
      }

      result[row.provider] =
        (result[row.provider] ?? 0) + 1;
    }

    return result;
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (!provider) {
      return rows;
    }

    return rows.filter(
      (row) => row.provider === provider,
    );
  }, [rows, provider]);

  /*
   * Keep the current environment selection valid when:
   *
   * - provider filter changes
   * - an environment disconnects
   * - the parent refreshes the account list
   */
  useEffect(() => {
    if (visibleRows.length === 0) {
      if (selected !== '') {
        setSelected('');
      }

      return;
    }

    const selectedStillExists = visibleRows.some(
      (row) => row.id === selected,
    );

    if (!selectedStillExists) {
      setSelected(visibleRows[0].id);
    }
  }, [visibleRows, selected]);

  const selectedRow = useMemo(
    () =>
      visibleRows.find(
        (row) => row.id === selected,
      ),
    [visibleRows, selected],
  );

  const selectedProvider = selectedRow?.provider;

  /*
   * A provider other than AWS has no read-only toggle in the current API
   * contract. Reset it when switching away from AWS so the query key and
   * displayed semantics cannot accidentally remain in an AWS-only state.
   */
  useEffect(() => {
    if (selectedProvider !== 'aws' && includeReadOnly) {
      setIncludeReadOnly(false);
    }
  }, [selectedProvider, includeReadOnly]);

  const fetchChanges = useCallback(
    async (): Promise<Change[]> => {
      if (!selectedRow?.id || !selectedProvider) {
        return [];
      }

      if (selectedProvider === 'aws') {
        const response =
          await api.getAccountCloudTrailEvents(
            selectedRow.id,
            { includeReadOnly },
          );

        return sortChangesByTime(
          normalizeAwsChanges(response.events),
        );
      }

      const response =
        await api.getProviderChanges(
          selectedRow.id,
          selectedProvider,
        );

      return sortChangesByTime(
        normalizeProviderChanges(response.events),
      );
    },
    [
      selectedRow?.id,
      selectedProvider,
      includeReadOnly,
    ],
  );

  const query = useQuery({
    queryKey: [
      'cloud-accounts',
      'changes',
      selectedRow?.id ?? null,
      selectedProvider ?? null,
      selectedProvider === 'aws'
        ? includeReadOnly
        : false,
    ],

    queryFn: fetchChanges,

    enabled: Boolean(
      selectedRow?.id && selectedProvider,
    ),

    /*
     * Changes are historical audit data. Refreshing every minute is enough
     * for this page while avoiding excessive audit-log API traffic.
     */
    staleTime: 60_000,

    /*
     * Keep previous data visible while switching environments so the UI does
     * not unnecessarily flash an empty state between two successful queries.
     *
     * This option is intentionally omitted here if the project is on a
     * TanStack Query version where placeholderData is not available.
     */
    placeholderData: (previousData) => previousData,

    /*
     * Audit-log authorization errors are normally deterministic and should
     * not be retried automatically.
     */
    retry: false,

    /*
     * Avoid retaining a large historical event list indefinitely.
     */
    gcTime: 5 * 60_000,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="No connected environments"
        description="Connect an account to see its configuration changes."
      />
    );
  }

  const emptyState = getEmptyStateCopy(
    selectedProvider,
    selectedProvider === 'aws'
      ? includeReadOnly
      : false,
  );

  const errorMessage = query.isError
    ? friendlyErrorMessage(query.error)
    : null;

  return (
    <section
      aria-labelledby={timelineLabelId}
      className="flex flex-col gap-3"
    >
      <h2
        id={timelineLabelId}
        className="sr-only"
      >
        Cloud configuration changes
      </h2>

      <ProviderChips
        value={provider}
        onChange={setProvider}
        counts={counts}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={environmentLabelId}
          className="text-xs text-slate-500 dark:text-slate-400"
        >
          Environment
        </label>

        <select
          id={environmentLabelId}
          value={selected}
          onChange={(event) =>
            setSelected(event.target.value)
          }
          disabled={visibleRows.length === 0}
          aria-label="Select environment"
          className={[
            'min-w-0 max-w-full rounded-md border',
            'border-slate-200 bg-white px-2 py-1.5',
            'text-sm text-slate-700',
            'dark:border-slate-700 dark:bg-slate-900',
            'dark:text-slate-200',
            'focus:outline-none focus:ring-2',
            'focus:ring-brand-500 focus:ring-offset-1',
            'dark:focus:ring-offset-slate-950',
            'disabled:cursor-not-allowed',
            'disabled:opacity-60',
          ].join(' ')}
        >
          {visibleRows.length === 0 ? (
            <option value="">
              No environments
            </option>
          ) : (
            visibleRows.map((row) => {
              const providerLabel =
                isProviderValue(row.provider)
                  ? providerDisplayName(row.provider)
                  : DEFAULT_PROVIDER_LABEL;

              const name = normalizeText(
                row.name,
                'Unnamed environment',
              );

              return (
                <option
                  key={row.id}
                  value={row.id}
                >
                  {providerLabel} — {name}
                </option>
              );
            })
          )}
        </select>

        {selectedProvider === 'aws' && (
          <label
            htmlFor={readOnlyLabelId}
            className={[
              'flex cursor-pointer items-center gap-1.5',
              'text-xs text-slate-500',
              'dark:text-slate-400',
            ].join(' ')}
          >
            <input
              id={readOnlyLabelId}
              type="checkbox"
              checked={includeReadOnly}
              onChange={(event) =>
                setIncludeReadOnly(
                  event.target.checked,
                )
              }
              aria-describedby={`${readOnlyLabelId}-description`}
              className={[
                'rounded border-slate-300',
                'dark:border-slate-600',
                'focus:ring-2 focus:ring-brand-500',
              ].join(' ')}
            />

            <span>
              Include read-only events
            </span>

            <span
              id={`${readOnlyLabelId}-description`}
              className="sr-only"
            >
              Include AWS CloudTrail read-only events such
              as Describe, List, and Get operations.
            </span>
          </label>
        )}

        <span
          className={[
            'ml-auto text-xs',
            'text-slate-400',
            'max-w-full',
          ].join(' ')}
          aria-live="polite"
        >
          {getChangeWindowDescription(
            selectedProvider,
            selectedProvider === 'aws'
              ? includeReadOnly
              : false,
          )}
        </span>
      </div>

      {query.isLoading && !query.data ? (
        <div
          aria-label="Loading cloud changes"
          aria-busy="true"
        >
          <CardSkeleton lines={6} />
        </div>
      ) : query.isError && !query.data ? (
        <div
          role="alert"
          className={[
            'rounded-md border px-3 py-3',
            'border-amber-200 bg-amber-50',
            'text-xs text-amber-800',
            'dark:border-amber-900/50',
            'dark:bg-amber-950/30',
            'dark:text-amber-300',
          ].join(' ')}
        >
          <div className="flex items-start gap-2">
            <Icon
              name="alert-triangle"
              size={14}
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            />

            <div className="min-w-0">
              <p className="font-medium">
                Couldn't load changes
              </p>

              <p className="mt-1">
                {errorMessage ??
                  'The audit log could not be retrieved for this environment.'}
              </p>

              <p className="mt-1 text-amber-700/80 dark:text-amber-300/80">
                Audit-log read access may not be granted
                for this environment.
              </p>
            </div>
          </div>
        </div>
      ) : query.data &&
        query.data.length === 0 ? (
        <EmptyState
          icon="activity"
          title={emptyState.title}
          description={emptyState.description}
        />
      ) : (
        <div
          className="relative"
          aria-busy={query.isFetching}
        >
          {query.isError && query.data ? (
            /*
             * Preserve already-loaded audit data if a background refresh
             * fails. The user can still inspect the last successful result.
             */
            <div
              role="status"
              className={[
                'mb-2 rounded-md border px-3 py-2',
                'border-amber-200 bg-amber-50',
                'text-xs text-amber-700',
                'dark:border-amber-900/50',
                'dark:bg-amber-950/30',
                'dark:text-amber-300',
              ].join(' ')}
            >
              Changes could not be refreshed. Showing
              the last successfully loaded results.
            </div>
          ) : null}

          <ul
            aria-label={`${providerDisplayName(
              selectedProvider,
            )} cloud configuration changes`}
            className={[
              'flex flex-col divide-y',
              'divide-slate-100 rounded-xl border',
              'border-slate-200 bg-white',
              'dark:divide-slate-800',
              'dark:border-slate-800',
              'dark:bg-slate-900',
            ].join(' ')}
          >
            {(query.data ?? []).map((event) => {
              const status = normalizeStatus(
                event.status,
              );

              const hasError =
                isErrorStatus(status);

              const operation = normalizeText(
                event.operation,
                'Unknown operation',
              );

              const who = normalizeText(
                event.who,
                'Unknown actor',
              );

              const resource =
                normalizeNullableText(
                  event.resource,
                );

              const extra =
                normalizeNullableText(
                  event.extra,
                );

              const eventTime =
                formatEventDate(event.when);

              return (
                <li
                  key={event.id}
                  className={[
                    'px-3 py-3',
                    'sm:px-4 sm:py-3',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {hasError ? (
                          <Icon
                            name="alert-triangle"
                            size={12}
                            className="shrink-0 text-red-500"
                            aria-hidden="true"
                          />
                        ) : null}

                        <span
                          className={[
                            'truncate font-medium',
                            'text-slate-700',
                            'dark:text-slate-200',
                          ].join(' ')}
                          title={operation}
                        >
                          {operation}
                        </span>

                        {hasError ? (
                          <span className="sr-only">
                            Event status: error
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <time
                      dateTime={
                        event.when &&
                        isValidDate(event.when)
                          ? new Date(
                              event.when,
                            ).toISOString()
                          : undefined
                      }
                      className={[
                        'shrink-0 text-right text-xs',
                        'text-slate-400',
                      ].join(' ')}
                      title={
                        event.when &&
                        isValidDate(event.when)
                          ? new Date(
                              event.when,
                            ).toISOString()
                          : undefined
                      }
                    >
                      {eventTime}
                    </time>
                  </div>

                  <div
                    className={[
                      'mt-1 text-xs leading-5',
                      'text-slate-400',
                      'break-words',
                    ].join(' ')}
                  >
                    {event.provenance ? (
                      <>
                        <ActorBadge provenance={event.provenance} />
                        <span aria-hidden="true">{' '}</span>
                      </>
                    ) : null}

                    <span>{who}</span>

                    {resource ? (
                      <>
                        <span aria-hidden="true">
                          {' · '}
                        </span>
                        <span title={resource}>
                          {resource}
                        </span>
                      </>
                    ) : null}

                    {extra ? (
                      <>
                        <span aria-hidden="true">
                          {' · '}
                        </span>
                        <span title={extra}>
                          {extra}
                        </span>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}