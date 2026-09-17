import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '../Badge';
import { StatCard } from '../StatCard';
import { Icon } from '../icons';
import { TableSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import {
  api,
  friendlyErrorMessage,
  type HealthSignalStatus,
} from '../../lib/api';
// Health rows, not inventory rows. A refactor imported CloudAccountHealthRow
// here, which has no connectionId, state or score -- 30 of the build
// errors were that single wrong import.
import type { CloudAccountHealthRow, CloudAccountsHealthResponse } from '../../lib/api';
import {
  summarizeHealthRows,
  HEALTH_STATE_TONE,
  HEALTH_STATE_LABEL,
  healthTierClass,
} from '../../lib/cloudAccounts/health';
import { useFilters } from '../../lib/filterContext';
import { useOrg } from '../../lib/orgContext';

const SIGNAL_DOT: Record<
  HealthSignalStatus,
  string
> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  fail: 'bg-red-500',
  unknown: 'bg-slate-400',
};

const PROVIDERS = ['aws', 'azure', 'gcp'] as const;
type Provider = (typeof PROVIDERS)[number];

const HEALTH_STATES = [
  'healthy',
  'warning',
  'critical',
  'unknown',
] as const;

type HealthState = (typeof HEALTH_STATES)[number];

interface HealthPanelProps {
  refreshToken: number;
}

/**
 * The API's own response type, not a local approximation.
 *
 * A narrower `{ accounts?: unknown[] }` was declared here, so the type
 * predicate below claimed a settled result was
 * PromiseFulfilledResult<ProviderHealthResponse> when the promise actually
 * resolves CloudAccountsHealthResponse -- which carries `provider` and
 * `summary` too. Narrowing to a local shape does not make the runtime value
 * narrower; it just stops the compiler agreeing with itself.
 */
type ProviderHealthResponse = CloudAccountsHealthResponse;

function isProvider(
  value: unknown,
): value is Provider {
  return (
    value === 'aws' ||
    value === 'azure' ||
    value === 'gcp'
  );
}

function isHealthState(
  value: unknown,
): value is HealthState {
  return (
    value === 'healthy' ||
    value === 'warning' ||
    value === 'critical' ||
    value === 'unknown'
  );
}

function isHealthSignalStatus(
  value: unknown,
): value is HealthSignalStatus {
  return (
    value === 'ok' ||
    value === 'warn' ||
    value === 'fail' ||
    value === 'unknown'
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
    Math.max(0, Math.round(value)),
  );
}

function normalizeNonNegativeInteger(
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

function normalizeHealthRows(
  rows: unknown[],
): CloudAccountHealthRow[] {
  /*
   * The connector/API should already return the typed domain model.
   *
   * This defensive guard prevents malformed/null records from causing the
   * entire Health tab to crash if a connector response is partially corrupt.
   */
  return rows.filter(
    (row): row is CloudAccountHealthRow =>
      Boolean(
        row &&
          typeof row === 'object' &&
          typeof (row as CloudAccountHealthRow).connectionId ===
            'string' &&
          typeof (row as CloudAccountHealthRow).provider ===
            'string' &&
          isProvider(
            (row as CloudAccountHealthRow).provider,
          ) &&
          isHealthState(
            (row as CloudAccountHealthRow).state,
          ),
      ),
  );
}

function getStateTone(
  state: unknown,
) {
  if (isHealthState(state)) {
    return HEALTH_STATE_TONE[state];
  }

  return HEALTH_STATE_TONE.unknown;
}

function getStateLabel(
  state: unknown,
): string {
  if (isHealthState(state)) {
    return HEALTH_STATE_LABEL[state];
  }

  return HEALTH_STATE_LABEL.unknown;
}

function normalizeSignalStatus(
  status: unknown,
): HealthSignalStatus {
  return isHealthSignalStatus(status)
    ? status
    : 'unknown';
}

function normalizeSignalLabel(
  label: unknown,
): string {
  return normalizeText(
    label,
    'Health signal',
  );
}

function normalizeSignalDetail(
  detail: unknown,
): string {
  return normalizeText(
    detail,
    'No additional details are available.',
  );
}

function getRowIdentity(
  row: CloudAccountHealthRow,
  index: number,
): string {
  /*
   * connectionId is expected to uniquely identify the connected environment.
   * The index is only a defensive fallback for malformed duplicate data.
   */
  const id = normalizeText(
    row.connectionId,
    '',
  );

  return id || `health-row-${index}`;
}

export function HealthPanel({
  refreshToken,
}: HealthPanelProps) {
  const navigate = useNavigate();
  const { connections } = useFilters();
  const { scope } = useOrg();

  const tableId = useId();
  const filterDescriptionId = useId();

  const [expanded, setExpanded] =
    useState<string | null>(null);

  const [providerFilter, setProviderFilter] =
    useState<'' | Provider>('');

  const [stateFilter, setStateFilter] =
    useState<'' | HealthState>('');

  const query = useQuery({
    queryKey: [
      'cloud-accounts',
      'health-detailed',
      refreshToken,
    ],

    queryFn: async () => {
      const results =
        await Promise.allSettled([
          api.getAwsHealthDetailed(),
          api.getAzureHealthDetailed(),
          api.getGcpHealthDetailed(),
        ]);

      /*
       * Keep successful providers even when another provider fails.
       *
       * This is important for a multi-cloud product: an Azure connector
       * failure should not erase otherwise valid AWS/GCP health data.
       */
      const successfulResponses =
        results
          .filter(
            (
              result,
            ): result is PromiseFulfilledResult<ProviderHealthResponse> =>
              result.status === 'fulfilled',
          )
          .map((result) => result.value);

      const failedProviderCount =
        results.filter(
          (result) =>
            result.status === 'rejected',
        ).length;

      const rawRows =
        successfulResponses.flatMap(
          (response) =>
            Array.isArray(response?.accounts)
              ? response.accounts
              : [],
        );

      return {
        rows: normalizeHealthRows(rawRows),
        failedProviderCount,
      };
    },

    staleTime: 60_000,

    /*
     * Refreshing health is safe, but automatic retries are deliberately
     * limited. Provider authorization failures generally will not be fixed
     * by repeatedly retrying from the browser.
     */
    retry: 1,

    gcTime: 5 * 60_000,
  });

  /*
   * `connections` is already narrowed to the active organization/folder/
   * project scope by the filter context.
   *
   * Health rows are scoped by connectionId so this tab does not duplicate
   * folder/project scope logic.
   */
  const scopedRows = useMemo(() => {
    const rows = query.data?.rows ?? [];

    if (connections.length === 0) {
      return [];
    }

    const scopedIds = new Set(
      connections
        .map((connection) => connection.id)
        .filter(
          (id): id is string =>
            typeof id === 'string' &&
            id.trim().length > 0,
        ),
    );

    return rows.filter((row) =>
      scopedIds.has(row.connectionId),
    );
  }, [query.data?.rows, connections]);

  /*
   * If the currently expanded environment disappears because of a scope
   * change, provider refresh, or account removal, close its details panel.
   */
  useEffect(() => {
    if (!expanded) {
      return;
    }

    const stillExists = scopedRows.some(
      (row) =>
        row.connectionId === expanded,
    );

    if (!stillExists) {
      setExpanded(null);
    }
  }, [expanded, scopedRows]);

  const filtered = useMemo(() => {
    let result = scopedRows;

    if (providerFilter) {
      result = result.filter(
        (row) =>
          row.provider === providerFilter,
      );
    }

    if (stateFilter) {
      result = result.filter(
        (row) =>
          row.state === stateFilter,
      );
    }

    /*
     * Preserve the product's intended severity ordering:
     * critical → warning → unknown → healthy.
     *
     * Score is only used as a secondary ordering signal within a state.
     * Unknown rows are not sorted by an invented score.
     */
    const rank: Record<HealthState, number> = {
      critical: 0,
      warning: 1,
      unknown: 2,
      healthy: 3,
    };

    return [...result].sort(
      (a, b) => {
        const aState = isHealthState(a.state)
          ? a.state
          : 'unknown';

        const bState = isHealthState(b.state)
          ? b.state
          : 'unknown';

        const stateDifference =
          rank[aState] - rank[bState];

        if (stateDifference !== 0) {
          return stateDifference;
        }

        /*
         * Unknown means no reliable score. Do not let an invalid score
         * accidentally sort before/after real scores.
         */
        const aScore =
          aState === 'unknown'
            ? null
            : normalizeScore(a.score);

        const bScore =
          bState === 'unknown'
            ? null
            : normalizeScore(b.score);

        if (
          aScore !== null &&
          bScore !== null
        ) {
          return aScore - bScore;
        }

        if (
          aScore !== null &&
          bScore === null
        ) {
          return -1;
        }

        if (
          aScore === null &&
          bScore !== null
        ) {
          return 1;
        }

        return normalizeText(
          a.connectionName,
          '',
        ).localeCompare(
          normalizeText(
            b.connectionName,
            '',
          ),
        );
      },
    );
  }, [
    scopedRows,
    providerFilter,
    stateFilter,
  ]);

  const combined = useMemo(
    () => summarizeHealthRows(scopedRows),
    [scopedRows],
  );

  const handleToggleExpanded = useCallback(
    (id: string) => {
      if (!id) {
        return;
      }

      setExpanded((current) =>
        current === id ? null : id,
      );
    },
    [],
  );

  const handleNavigate = useCallback(
    (connectionId: string) => {
      const normalizedId =
        normalizeText(
          connectionId,
          '',
        );

      if (!normalizedId) {
        return;
      }

      navigate(
        `/cloud-accounts/${encodeURIComponent(
          normalizedId,
        )}`,
      );
    },
    [navigate],
  );

  const clearFilters = useCallback(() => {
    setProviderFilter('');
    setStateFilter('');
  }, []);

  /*
   * Initial loading only.
   *
   * If a refresh occurs while previous data exists, keep the existing table
   * visible instead of replacing it with a skeleton.
   */
  if (
    query.isLoading &&
    !query.data
  ) {
    return (
      <div
        aria-label="Loading account health"
        aria-busy="true"
      >
        <TableSkeleton
          rows={6}
          cols={5}
        />
      </div>
    );
  }

  /*
   * A completely failed query means none of the provider requests produced
   * usable data. Show an actual error rather than "no environments".
   */
  if (
    query.isError &&
    !query.data
  ) {
    return (
      <div
        role="alert"
        className={[
          'rounded-md border px-3 py-3',
          'border-red-200 bg-red-50',
          'text-sm text-red-700',
          'dark:border-red-900',
          'dark:bg-red-900/20',
          'dark:text-red-300',
        ].join(' ')}
      >
        <div className="flex items-start gap-2">
          <Icon
            name="alert-triangle"
            size={15}
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />

          <div className="min-w-0">
            <p className="font-medium">
              Couldn't load account health
            </p>

            <p className="mt-1">
              {friendlyErrorMessage(
                query.error,
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  /*
   * No scoped data.
   *
   * Distinguish "scope contains no environments" from the organization having
   * no connected environments at all.
   */
  if (combined.total === 0) {
    const hasAnyReturnedRows =
      (query.data?.rows.length ?? 0) > 0;

    if (
      scope &&
      scope.type !== 'org' &&
      hasAnyReturnedRows
    ) {
      return (
        <EmptyState
          icon="gauge"
          title={`No environments in ${scope.name}`}
          description="Pick a different folder/project scope, or switch back to the whole organization."
        />
      );
    }

    return (
      <EmptyState
        icon="gauge"
        title="No connected environments yet"
        description="Connect an AWS account, Azure subscription or GCP project to see its health here."
      />
    );
  }

  const hasActiveFilters =
    Boolean(
      providerFilter ||
        stateFilter,
    );

  const failedProviderCount =
    query.data?.failedProviderCount ?? 0;

  return (
    <section
      aria-labelledby={tableId}
      className="flex flex-col gap-4"
    >
      <h2
        id={tableId}
        className="sr-only"
      >
        Cloud environment health
      </h2>

      {/* KPI summary */}
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-5"
        aria-label="Health summary"
      >
        <StatCard
          label="Overall Health"
          value={
            combined.healthPercent === null
              ? '—'
              : `${combined.healthPercent}%`
          }
          caption={
            combined.healthPercent === null
              ? 'Nothing rated yet'
              : `${combined.healthy}/${Math.max(
                  combined.total -
                    combined.unknown,
                  0,
                )} healthy`
          }
          icon="gauge"
          iconTone={
            combined.healthPercent ===
            null
              ? 'neutral'
              : combined.healthPercent >=
                85
              ? 'good'
              : combined.healthPercent >=
                60
              ? 'warning'
              : 'critical'
          }
        />

        <StatCard
          label="Healthy"
          value={String(
            normalizeNonNegativeInteger(
              combined.healthy,
            ),
          )}
          icon="check-circle"
          iconTone="good"
        />

        <StatCard
          label="Warning"
          value={String(
            normalizeNonNegativeInteger(
              combined.warning,
            ),
          )}
          icon="alert-triangle"
          iconTone={
            combined.warning > 0
              ? 'warning'
              : 'neutral'
          }
        />

        <StatCard
          label="Critical"
          value={String(
            normalizeNonNegativeInteger(
              combined.critical,
            ),
          )}
          icon="shield-alert"
          iconTone={
            combined.critical > 0
              ? 'critical'
              : 'neutral'
          }
        />

        <StatCard
          label="Unknown"
          value={String(
            normalizeNonNegativeInteger(
              combined.unknown,
            ),
          )}
          icon="help"
          iconTone="neutral"
        />
      </div>

      {/* Provider/state filters */}
      <div
        className="flex flex-wrap items-center gap-3"
        aria-describedby={
          filterDescriptionId
        }
      >
        <span
          id={filterDescriptionId}
          className="sr-only"
        >
          Filter environments by provider or
          health state.
        </span>

        {combined.perProvider.map(
          (providerSummary) => {
            if (
              !isProvider(
                providerSummary.provider,
              )
            ) {
              return null;
            }

            const active =
              providerFilter ===
              providerSummary.provider;

            const healthPercent =
              normalizeScore(
                providerSummary.healthPercent,
              );

            return (
              <button
                key={
                  providerSummary.provider
                }
                type="button"
                aria-pressed={active}
                aria-label={`Filter by ${providerSummary.provider}. ${providerSummary.total} environment${providerSummary.total === 1 ? '' : 's'}`}
                onClick={() =>
                  setProviderFilter(
                    (current) =>
                      current ===
                      providerSummary.provider
                        ? ''
                        : providerSummary.provider,
                  )
                }
                className={[
                  'rounded-lg border px-3 py-2',
                  'text-left transition-colors',
                  'focus:outline-none',
                  'focus-visible:ring-2',
                  'focus-visible:ring-brand-500',
                  'focus-visible:ring-offset-1',
                  'dark:focus-visible:ring-offset-slate-950',
                  active
                    ? [
                        'border-brand-400',
                        'bg-brand-50',
                        'dark:border-brand-500',
                        'dark:bg-brand-900/30',
                      ].join(' ')
                    : [
                        'border-slate-200',
                        'hover:bg-slate-50',
                        'dark:border-slate-700',
                        'dark:hover:bg-slate-800',
                      ].join(' '),
                ].join(' ')}
              >
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  {providerSummary.provider}
                </div>

                <div
                  className={[
                    'text-lg font-semibold tabular-nums',
                    healthTierClass(
                      healthPercent,
                    ),
                  ].join(' ')}
                >
                  {healthPercent === null
                    ? '—'
                    : `${healthPercent}%`}
                </div>

                <div className="text-[11px] text-slate-400">
                  {normalizeNonNegativeInteger(
                    providerSummary.total,
                  )}{' '}
                  environment
                  {providerSummary.total ===
                  1
                    ? ''
                    : 's'}
                </div>
              </button>
            );
          },
        )}

        <div
          className={[
            'flex flex-wrap items-center gap-1.5',
            'sm:ml-auto',
          ].join(' ')}
          aria-label="Health state filters"
        >
          {HEALTH_STATES.map(
            (state) => {
              const active =
                stateFilter === state;

              return (
                <button
                  key={state}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setStateFilter(
                      (current) =>
                        current === state
                          ? ''
                          : state,
                    )
                  }
                  className={[
                    'rounded-full border px-2.5 py-1',
                    'text-xs capitalize',
                    'transition-colors',
                    'focus:outline-none',
                    'focus-visible:ring-2',
                    'focus-visible:ring-brand-500',
                    'focus-visible:ring-offset-1',
                    'dark:focus-visible:ring-offset-slate-950',
                    active
                      ? [
                          'border-brand-600',
                          'bg-brand-600',
                          'text-white',
                        ].join(' ')
                      : [
                          'border-slate-200',
                          'text-slate-600',
                          'hover:bg-slate-50',
                          'dark:border-slate-700',
                          'dark:text-slate-300',
                          'dark:hover:bg-slate-800',
                        ].join(' '),
                  ].join(' ')}
                >
                  {state}
                </button>
              );
            },
          )}

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className={[
                'ml-1 rounded-md px-2 py-1',
                'text-xs text-slate-500',
                'underline-offset-2 hover:underline',
                'dark:text-slate-400',
                'focus:outline-none',
                'focus-visible:ring-2',
                'focus-visible:ring-brand-500',
              ].join(' ')}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Partial provider failure */}
      {failedProviderCount > 0 ? (
        <div
          role="status"
          className={[
            'rounded-md border px-3 py-2',
            'border-amber-200 bg-amber-50',
            'text-xs text-amber-700',
            'dark:border-amber-900/50',
            'dark:bg-amber-950/30',
            'dark:text-amber-300',
          ].join(' ')}
        >
          Health data from{' '}
          {failedProviderCount}{' '}
          provider
          {failedProviderCount === 1
            ? ''
            : 's'} could not be loaded. The
          displayed results contain only
          successfully retrieved provider data.
        </div>
      ) : null}

      {/* Background refresh indicator */}
      {query.isFetching &&
      !query.isLoading ? (
        <div
          role="status"
          className="text-xs text-slate-400"
          aria-live="polite"
        >
          Refreshing health data…
        </div>
      ) : null}

      {/* Health table */}
      <div
        className={[
          'overflow-hidden rounded-xl border',
          'border-slate-200 bg-white',
          'dark:border-slate-800',
          'dark:bg-slate-900',
        ].join(' ')}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <caption className="sr-only">
              Cloud environment health and
              explainable health signals
            </caption>

            <thead>
              <tr
                className={[
                  'border-b',
                  'border-slate-200',
                  'text-left text-slate-500',
                  'dark:border-slate-800',
                  'dark:text-slate-400',
                ].join(' ')}
              >
                <th
                  scope="col"
                  className="px-3 py-2"
                >
                  Environment
                </th>

                <th
                  scope="col"
                  className="px-3 py-2"
                >
                  Provider
                </th>

                <th
                  scope="col"
                  className="px-3 py-2"
                >
                  Score
                </th>

                <th
                  scope="col"
                  className="px-3 py-2"
                >
                  State
                </th>

                <th
                  scope="col"
                  className="px-3 py-2 text-right"
                >
                  <span className="sr-only">
                    Details
                  </span>
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map(
                (row, index) => {
                  const rowId =
                    getRowIdentity(
                      row,
                      index,
                    );

                  const open =
                    expanded ===
                    row.connectionId;

                  const score =
                    normalizeScore(
                      row.score,
                    );

                  const state =
                    isHealthState(
                      row.state,
                    )
                      ? row.state
                      : 'unknown';

                  const connectionName =
                    normalizeText(
                      row.connectionName,
                      'Unnamed environment',
                    );

                  const environment =
                    normalizeText(
                      row.environment,
                      '',
                    );

                  const providerName =
                    isProvider(
                      row.provider,
                    )
                      ? row.provider
                      : 'unknown';

                  const detailPanelId = `${tableId}-${rowId}-details`;

                  const signals =
                    Array.isArray(
                      row.signals,
                    )
                      ? row.signals
                      : [];

                  return (
                    <Fragment
                      key={rowId}
                    >
                      <tr
                        className={[
                          'border-b',
                          'border-slate-100',
                          'dark:border-slate-800/60',
                          open
                            ? 'bg-slate-50 dark:bg-slate-800/40'
                            : '',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleNavigate(
                                  row.connectionId,
                                )
                              }
                              className={[
                                'min-w-0 truncate',
                                'font-medium',
                                'text-slate-700',
                                'hover:underline',
                                'dark:text-slate-200',
                                'focus:outline-none',
                                'focus-visible:ring-2',
                                'focus-visible:ring-brand-500',
                                'focus-visible:ring-offset-1',
                                'dark:focus-visible:ring-offset-slate-900',
                              ].join(' ')}
                              title={
                                connectionName
                              }
                              aria-label={`Open ${connectionName}`}
                            >
                              {
                                connectionName
                              }
                            </button>

                            {environment ? (
                              <span
                                className={[
                                  'shrink-0 text-xs',
                                  'text-slate-400',
                                ].join(
                                  ' ',
                                )}
                                title={
                                  environment
                                }
                              >
                                {
                                  environment
                                }
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          <Badge tone="neutral">
                            {providerName.toUpperCase()}
                          </Badge>
                        </td>

                        <td className="px-3 py-2 tabular-nums">
                          {state ===
                          'unknown' ||
                          score === null
                            ? '—'
                            : score}
                        </td>

                        <td className="px-3 py-2">
                          <Badge
                            tone={getStateTone(
                              state,
                            )}
                          >
                            {
                              getStateLabel(
                                state,
                              )
                            }
                          </Badge>
                        </td>

                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            aria-expanded={
                              open
                            }
                            aria-controls={
                              detailPanelId
                            }
                            aria-label={
                              open
                                ? `Hide health details for ${connectionName}`
                                : `Show health details for ${connectionName}`
                            }
                            onClick={() =>
                              handleToggleExpanded(
                                row.connectionId,
                              )
                            }
                            className={[
                              'inline-flex items-center',
                              'justify-center rounded-md',
                              'p-1.5 text-slate-400',
                              'hover:bg-slate-100',
                              'hover:text-slate-600',
                              'dark:hover:bg-slate-800',
                              'dark:hover:text-slate-300',
                              'focus:outline-none',
                              'focus-visible:ring-2',
                              'focus-visible:ring-brand-500',
                            ].join(
                              ' ',
                            )}
                          >
                            <Icon
                              name={
                                open
                                  ? 'chevron-up'
                                  : 'chevron-down'
                              }
                              size={14}
                              aria-hidden="true"
                            />
                          </button>
                        </td>
                      </tr>

                      {open ? (
                        <tr
                          id={
                            detailPanelId
                          }
                          className={[
                            'border-b',
                            'border-slate-100',
                            'bg-slate-50/60',
                            'dark:border-slate-800/60',
                            'dark:bg-slate-800/30',
                          ].join(
                            ' ',
                          )}
                        >
                          <td
                            colSpan={5}
                            className="px-3 py-3"
                          >
                            <div
                              aria-label={`Health signals for ${connectionName}`}
                            >
                              {signals.length ===
                              0 ? (
                                <p className="text-xs text-slate-400">
                                  No health signal
                                  details are
                                  available for
                                  this environment.
                                </p>
                              ) : (
                                <ul className="flex flex-col gap-2">
                                  {signals.map(
                                    (
                                      signal,
                                      signalIndex,
                                    ) => {
                                      const status =
                                        normalizeSignalStatus(
                                          signal?.status,
                                        );

                                      const label =
                                        normalizeSignalLabel(
                                          signal?.label,
                                        );

                                      const detail =
                                        normalizeSignalDetail(
                                          signal?.detail,
                                        );

                                      const signalKey =
                                        normalizeText(
                                          signal?.key,
                                          `${rowId}-signal-${signalIndex}`,
                                        );

                                      return (
                                        <li
                                          key={`${signalKey}-${signalIndex}`}
                                          className={[
                                            'flex items-start',
                                            'gap-2 text-xs',
                                          ].join(
                                            ' ',
                                          )}
                                        >
                                          <span
                                            className={[
                                              'mt-1.5 h-1.5',
                                              'w-1.5 shrink-0',
                                              'rounded-full',
                                              SIGNAL_DOT[
                                                status
                                              ],
                                            ].join(
                                              ' '
                                            )}
                                            aria-hidden="true"
                                          />

                                          <span
                                            className={[
                                              'w-32 shrink-0',
                                              'font-medium',
                                              'text-slate-600',
                                              'dark:text-slate-300',
                                            ].join(
                                              ' '
                                            )}
                                          >
                                            {
                                              label
                                            }
                                          </span>

                                          <span
                                            className={[
                                              'min-w-0',
                                              'break-words',
                                              'text-slate-500',
                                              'dark:text-slate-400',
                                            ].join(
                                              ' '
                                            )}
                                          >
                                            {
                                              detail
                                            }

                                            <span className="sr-only">
                                              {' '}
                                              Status:{' '}
                                              {
                                                status
                                              }
                                            </span>
                                          </span>
                                        </li>
                                      );
                                    },
                                  )}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                },
              )}

              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className={[
                      'px-3 py-10',
                      'text-center text-sm',
                      'text-slate-400',
                    ].join(' ')}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Icon
                        name="search"
                        size={18}
                        aria-hidden="true"
                      />

                      <span>
                        No environments match
                        these filters.
                      </span>

                      {hasActiveFilters ? (
                        <button
                          type="button"
                          onClick={
                            clearFilters
                          }
                          className={[
                            'text-xs',
                            'text-brand-600',
                            'hover:underline',
                            'dark:text-brand-400',
                            'focus:outline-none',
                            'focus-visible:ring-2',
                            'focus-visible:ring-brand-500',
                          ].join(
                            ' '
                          )}
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}