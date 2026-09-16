import { useCallback, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge } from '../Badge';
import { EmptyState } from '../EmptyState';
import { Icon } from '../icons';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';
import {
  deriveConnections,
  connectionState,
} from '../../lib/cloudAccounts/connections';
import {
  ProviderChips,
  type ProviderValue,
} from './ProviderChips';

/**
 * Cloud Accounts — Connections tab (spec §13–16).
 *
 * A "connection" represents how HorizonVigil establishes trust with a cloud
 * provider. HorizonVigil does not currently expose a first-class Connection
 * entity, so these cards are derived from the connected environment/account
 * rows by `deriveConnections()`.
 *
 * Important:
 * - This component does not invent connection state.
 * - `deriveConnections()` remains the source of truth for grouping.
 * - `connectionState()` remains the source of truth for connection state.
 * - Provider filtering is applied before deriving connections.
 * - Authorization remains server-side; this UI only navigates to existing
 *   environment routes.
 */

interface ConnectionsPanelProps {
  rows: UnifiedAccountRow[];
  onAddConnection: () => void;
}

const STATE_TONE = {
  connected: 'good',
  warning: 'warning',
  error: 'critical',
  pending: 'neutral',
} as const;

type ConnectionState = keyof typeof STATE_TONE;

const MAX_VISIBLE_ENVIRONMENTS = 12;

const PROVIDER_LABELS: Record<ProviderValue, string> = {
  aws: 'AWS',
  azure: 'Azure',
  gcp: 'GCP',
};

function isProviderValue(value: unknown): value is ProviderValue {
  return value === 'aws' || value === 'azure' || value === 'gcp';
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

function normalizeNullableText(
  value: unknown,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
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

function isValidDate(value: string | null): boolean {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp);
}

function formatDateTime(
  value: string | null,
): string | null {
  if (!value || !isValidDate(value)) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function normalizeConnectionState(
  value: unknown,
): ConnectionState {
  if (
    value === 'connected' ||
    value === 'warning' ||
    value === 'error' ||
    value === 'pending'
  ) {
    return value;
  }

  /*
   * Never silently map an unknown state to "connected".
   * Treat an unsupported state as pending/unknown-ish rather than presenting
   * a false healthy state to the user.
   */
  return 'pending';
}

function providerLabel(
  provider: unknown,
): string {
  if (isProviderValue(provider)) {
    return PROVIDER_LABELS[provider];
  }

  return 'Cloud';
}

function environmentLabel(
  row: UnifiedAccountRow | undefined,
  fallbackId: string,
): string {
  if (!row) {
    return normalizeText(
      fallbackId,
      'Environment',
    );
  }

  return normalizeText(
    row.name,
    normalizeText(fallbackId, 'Environment'),
  );
}

function encodeEnvironmentId(
  id: string,
): string {
  return encodeURIComponent(id);
}

function formatConnectionType(
  value: unknown,
): string {
  const normalized = normalizeNullableText(value);

  if (!normalized) {
    return 'Connection method unavailable';
  }

  return normalized;
}

function formatEnvironmentCount(
  count: unknown,
): string {
  const normalized = normalizeNonNegativeInteger(count);

  return `${normalized} environment${normalized === 1 ? '' : 's'}`;
}

function normalizeStatusCounts(
  value: unknown,
): Array<[string, number]> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return [];
  }

  const entries: Array<[string, number]> = [];

  for (const [status, count] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const normalizedStatus = normalizeNullableText(
      status,
    );

    if (!normalizedStatus) {
      continue;
    }

    const normalizedCount =
      normalizeNonNegativeInteger(count);

    /*
     * Do not render zero-count status buckets. The connection derivation layer
     * may expose them for aggregation purposes, but showing "0 pending" etc.
     * adds noise to the compact card.
     */
    if (normalizedCount === 0) {
      continue;
    }

    entries.push([
      normalizedStatus,
      normalizedCount,
    ]);
  }

  return entries;
}

function formatStatusLabel(
  status: string,
): string {
  return status
    .replace(/[_-]+/g, ' ')
    .trim();
}

export function ConnectionsPanel({
  rows,
  onAddConnection,
}: ConnectionsPanelProps) {
  const navigate = useNavigate();

  const descriptionId = useId();

  const [provider, setProvider] =
    useState<ProviderValue | null>(null);

  const counts = useMemo(() => {
    const result: Partial<
      Record<ProviderValue, number>
    > = {};

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
   * Build an O(1) lookup for environment names.
   *
   * The original implementation called rows.find() for every environment
   * chip, producing unnecessary O(n²) behavior for large environments.
   */
  const rowsById = useMemo(() => {
    const map = new Map<
      string,
      UnifiedAccountRow
    >();

    for (const row of visibleRows) {
      if (!row?.id) {
        continue;
      }

      map.set(row.id, row);
    }

    return map;
  }, [visibleRows]);

  const connections = useMemo(
    () => deriveConnections(visibleRows),
    [visibleRows],
  );

  const handleAddConnection = useCallback(() => {
    onAddConnection();
  }, [onAddConnection]);

  const handleEnvironmentNavigate = useCallback(
    (environmentId: string) => {
      const normalizedId =
        normalizeNullableText(environmentId);

      if (!normalizedId) {
        return;
      }

      navigate(
        `/cloud-accounts/${encodeEnvironmentId(
          normalizedId,
        )}`,
      );
    },
    [navigate],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="cloud"
        title="No cloud connections yet"
        description="A connection is how HorizonVigil establishes trust with AWS, Azure or GCP — one connection can bring in many environments."
        action={{
          label: '+ Connect Cloud',
          onClick: handleAddConnection,
        }}
      />
    );
  }

  const hasVisibleConnections =
    connections.length > 0;

  const providerName = provider
    ? providerLabel(provider)
    : 'cloud';

  return (
    <section
      aria-describedby={descriptionId}
      className="flex flex-col gap-3"
    >
      <ProviderChips
        value={provider}
        onChange={setProvider}
        counts={counts}
      />

      <p
        id={descriptionId}
        className="text-xs leading-5 text-slate-400"
      >
        Grouped by how trust was established. An
        &nbsp;"Organization"&nbsp; connection is a set of AWS
        cross-account roles sharing one external ID — what
        bulk onboarding from an AWS Organization produces.
      </p>

      {!hasVisibleConnections ? (
        <EmptyState
          icon="cloud"
          title={`No ${providerName} connections`}
          description="Nothing connected for this provider yet."
          action={{
            label: '+ Connect Cloud',
            onClick: handleAddConnection,
          }}
        />
      ) : (
        <div
          className="flex flex-col gap-3"
          aria-label="Cloud connections"
        >
          {connections.map((connection) => {
            const state = normalizeConnectionState(
              connectionState(connection),
            );

            const accountCount =
              normalizeNonNegativeInteger(
                connection.accountCount,
              );

            const accountIds = Array.isArray(
              connection.accountIds,
            )
              ? connection.accountIds.filter(
                  (id): id is string =>
                    typeof id === 'string' &&
                    id.trim().length > 0,
                )
              : [];

            const environments = Array.isArray(
              connection.environments,
            )
              ? connection.environments
                  .map((environment) =>
                    normalizeNullableText(
                      environment,
                    ),
                  )
                  .filter(
                    (
                      environment,
                    ): environment is string =>
                      Boolean(environment),
                  )
              : [];

            const statusCounts =
              normalizeStatusCounts(
                connection.statusCounts,
              );

            const lastSync =
              normalizeNullableText(
                connection.lastSync,
              );

            const formattedLastSync =
              formatDateTime(lastSync);

            const connectionLabel =
              normalizeText(
                connection.label,
                'Unnamed connection',
              );

            const connectionType =
              formatConnectionType(
                connection.connectionType,
              );

            const visibleAccountIds =
              accountIds.slice(
                0,
                MAX_VISIBLE_ENVIRONMENTS,
              );

            const remainingCount = Math.max(
              accountIds.length -
                MAX_VISIBLE_ENVIRONMENTS,
              0,
            );

            /*
             * Connection IDs should be stable and unique from the derivation
             * layer. The fallback prevents a React key warning if malformed
             * upstream data reaches the UI.
             */
            const connectionId =
              normalizeText(
                connection.id,
                `${connection.provider}-${connectionType}-${connectionLabel}`,
              );

            return (
              <article
                key={connectionId}
                className={[
                  'rounded-xl border p-4',
                  'border-slate-200 bg-white',
                  'dark:border-slate-800',
                  'dark:bg-slate-900',
                ].join(' ')}
                aria-labelledby={`connection-${connectionId}`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          id={`connection-${connectionId}`}
                          className={[
                            'min-w-0 truncate',
                            'text-sm font-medium',
                            'text-slate-800',
                            'dark:text-slate-100',
                          ].join(' ')}
                          title={connectionLabel}
                        >
                          {connectionLabel}
                        </h3>

                        <Badge tone="neutral">
                          {providerLabel(
                            connection.provider,
                          )}
                        </Badge>

                        <Badge
                          tone={
                            STATE_TONE[state]
                          }
                        >
                          {state}
                        </Badge>
                      </div>

                      <div
                        className={[
                          'mt-1 text-xs leading-5',
                          'text-slate-400',
                          'break-words',
                        ].join(' ')}
                      >
                        <span>
                          {connectionType}
                        </span>

                        <span
                          aria-hidden="true"
                        >
                          {' · '}
                        </span>

                        <span>
                          {formatEnvironmentCount(
                            accountCount,
                          )}
                        </span>

                        {environments.length >
                        0 ? (
                          <>
                            <span
                              aria-hidden="true"
                            >
                              {' · '}
                            </span>

                            <span
                              title={environments.join(
                                ', ',
                              )}
                            >
                              {environments.join(
                                ', ',
                              )}
                            </span>
                          </>
                        ) : null}

                        {formattedLastSync ? (
                          <>
                            <span
                              aria-hidden="true"
                            >
                              {' · '}
                            </span>

                            <span>
                              last sync{' '}
                              <time
                                dateTime={
                                  lastSync ??
                                  undefined
                                }
                              >
                                {
                                  formattedLastSync
                                }
                              </time>
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {statusCounts.length >
                    0 ? (
                      <div
                        className={[
                          'flex shrink-0 flex-wrap',
                          'items-center gap-x-3 gap-y-1',
                          'text-xs text-slate-500',
                          'dark:text-slate-400',
                        ].join(' ')}
                        aria-label="Environment status counts"
                      >
                        {statusCounts.map(
                          ([status, count]) => (
                            <span
                              key={status}
                              className="tabular-nums"
                            >
                              {count}{' '}
                              {formatStatusLabel(
                                status,
                              )}
                            </span>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>

                  {visibleAccountIds.length >
                  0 ? (
                    <nav
                      aria-label={`${connectionLabel} environments`}
                      className="flex flex-wrap gap-1.5"
                    >
                      {visibleAccountIds.map(
                        (environmentId) => {
                          const row =
                            rowsById.get(
                              environmentId,
                            );

                          const label =
                            environmentLabel(
                              row,
                              environmentId,
                            );

                          return (
                            <button
                              key={environmentId}
                              type="button"
                              onClick={() =>
                                handleEnvironmentNavigate(
                                  environmentId,
                                )
                              }
                              title={label}
                              aria-label={`Open environment ${label}`}
                              className={[
                                'max-w-full truncate',
                                'rounded-md border px-2 py-1',
                                'text-xs',
                                'border-slate-200',
                                'text-slate-600',
                                'hover:bg-slate-50',
                                'dark:border-slate-700',
                                'dark:text-slate-300',
                                'dark:hover:bg-slate-800',
                                'focus:outline-none',
                                'focus-visible:ring-2',
                                'focus-visible:ring-brand-500',
                                'focus-visible:ring-offset-1',
                                'dark:focus-visible:ring-offset-slate-900',
                                'transition-colors',
                              ].join(' ')}
                            >
                              {label}
                            </button>
                          );
                        },
                      )}

                      {remainingCount > 0 ? (
                        <span
                          className={[
                            'flex items-center gap-1',
                            'self-center text-xs',
                            'text-slate-400',
                          ].join(' ')}
                          aria-label={`${remainingCount} more environments`}
                        >
                          <Icon
                            name="more"
                            size={12}
                            aria-hidden="true"
                          />
                          +{remainingCount} more
                        </span>
                      ) : null}
                    </nav>
                  ) : (
                    <p className="text-xs text-slate-400">
                      No environment details are
                      currently available for this
                      connection.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}