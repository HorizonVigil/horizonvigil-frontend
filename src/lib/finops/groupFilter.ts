/**
 * FinOps Cloud + Environment "group filter".
 *
 * Shared by the FinOps Overview, Cost Management, and Cost Optimization
 * sections. `FinOps.tsx` owns the selected filter and passes it downward.
 *
 * The resolved `connectionIds` list is sent to horizonvigil-cost endpoints so
 * filtering is enforced by the server/query layer rather than by filtering
 * already-returned rows in the browser.
 *
 * Important semantics:
 * - `undefined` means no filter is active: do not narrow the query.
 * - `[]` means a filter is active but no connected environment matches it.
 * - Connection ordering is preserved.
 * - This module is pure and does not mutate its inputs.
 */

import type { Provider } from './overview';

export type { Provider };

export interface GroupFilter {
  provider: Provider | null;

  /**
   * `'all'` means all environments. Otherwise this is matched against the
   * connection's environment value exactly after trimming whitespace.
   */
  environment: string;
}

export interface GroupFilterConnection {
  id: string;
  provider: Provider;
  environment: string;
}

export interface ResolvedGroupFilter
  extends GroupFilter {
  /**
   * Matching connection IDs.
   *
   * `undefined` means neither Cloud nor Environment is filtering the query.
   * An empty array means an active filter matched no connections.
   */
  connectionIds?: string[];
}

function normalizeEnvironment(
  environment: string,
): string {
  return typeof environment === 'string'
    ? environment.trim()
    : '';
}

function normalizeConnectionId(
  id: string,
): string | null {
  if (typeof id !== 'string') {
    return null;
  }

  const normalized = id.trim();

  return normalized || null;
}

function isProvider(
  value: unknown,
): value is Provider {
  return (
    value === 'aws' ||
    value === 'azure' ||
    value === 'gcp'
  );
}

/**
 * Resolves the active Cloud/Environment filter to connection IDs.
 *
 * Examples:
 *   { provider: null, environment: 'all' }
 *      -> undefined
 *
 *   { provider: 'aws', environment: 'all' }
 *      -> all AWS connection IDs
 *
 *   { provider: null, environment: 'production' }
 *      -> all production connection IDs
 *
 *   { provider: 'gcp', environment: 'production' }
 *      -> matching GCP production connection IDs
 *
 *   active filter with no matches
 *      -> []
 */
export function groupConnectionIds(
  filter: GroupFilter,
  connections: readonly GroupFilterConnection[],
): string[] | undefined {
  const provider =
    filter?.provider ?? null;

  const environment =
    normalizeEnvironment(
      filter?.environment ?? 'all',
    );

  /*
   * No Cloud/Environment narrowing is active.
   *
   * Keep the distinction from `[]`: callers must not send an empty connection
   * list when the intended query is "all connections".
   */
  if (
    provider === null &&
    environment === 'all'
  ) {
    return undefined;
  }

  const environmentFilterActive =
    environment !== 'all';

  const result: string[] = [];

  for (const connection of connections) {
    if (!connection) {
      continue;
    }

    const connectionId =
      normalizeConnectionId(
        connection.id,
      );

    /*
     * Never send an empty/invalid connection ID to a scoped backend query.
     */
    if (!connectionId) {
      continue;
    }

    /*
     * Provider is a domain-owned union. A malformed runtime value should not
     * accidentally pass through a production authorization/cost query.
     */
    if (
      !isProvider(
        connection.provider,
      )
    ) {
      continue;
    }

    const providerMatches =
      provider === null ||
      connection.provider === provider;

    if (!providerMatches) {
      continue;
    }

    const connectionEnvironment =
      normalizeEnvironment(
        connection.environment,
      );

    const environmentMatches =
      !environmentFilterActive ||
      connectionEnvironment ===
        environment;

    if (!environmentMatches) {
      continue;
    }

    result.push(connectionId);
  }

  return result;
}

/**
 * Resolves the filter without mutating the caller's filter object.
 *
 * This is useful when a caller wants a single object to pass through its
 * FinOps query layer.
 */
export function resolveGroupFilter(
  filter: GroupFilter,
  connections: readonly GroupFilterConnection[],
): ResolvedGroupFilter {
  return {
    provider:
      filter?.provider ?? null,
    environment:
      normalizeEnvironment(
        filter?.environment ?? 'all',
      ) || 'all',
    connectionIds:
      groupConnectionIds(
        filter,
        connections,
      ),
  };
}
