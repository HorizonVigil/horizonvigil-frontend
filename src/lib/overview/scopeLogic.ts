/**
 * Pure scope-resolution logic.
 *
 * Split out of scope.ts so this module stays safe to import from Vitest:
 * it only imports EffectiveScope as a type and has no runtime dependency on
 * the API/client layer. scope.ts re-exports these helpers for compatibility.
 *
 * This module resolves presentation/data-selection scope only. Backend
 * authorization remains authoritative and must enforce the actual tenant and
 * resource-grant boundary on every protected endpoint.
 */
import type { EffectiveScope } from './types';

export interface ResourceGrantScope {
  restricted: boolean;
  connectionIds: readonly string[];
}

export interface ResolvedConnectionScope {
  restricted: boolean;
  connectionIds: string[] | 'all';
}

function normalizeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const rawId of ids) {
    if (typeof rawId !== 'string') continue;

    const id = rawId.trim();
    if (!id || seen.has(id)) continue;

    seen.add(id);
    result.push(id);
  }

  return result;
}

/**
 * Resolves the intersection of the two independent scope axes:
 * - a folder/project ScopePicker selection
 * - an RBAC/resource-grant restriction
 *
 * When neither axis narrows the set, `connectionIds: 'all'` is returned.
 * When both axes narrow it, the intersection is authoritative.
 */
export function resolveConnectionScope(
  scopeNarrowedConnectionIds: readonly string[],
  scopeNarrowed: boolean,
  resourceGrants: ResourceGrantScope | null | undefined,
): ResolvedConnectionScope {
  const scopedIds = normalizeIds(scopeNarrowedConnectionIds);
  const grantsRestricted = resourceGrants?.restricted === true;
  const grantedIds = normalizeIds(resourceGrants?.connectionIds ?? []);

  if (!scopeNarrowed && !grantsRestricted) {
    return {
      restricted: false,
      connectionIds: 'all',
    };
  }

  if (grantsRestricted) {
    const scopedSet = new Set(scopedIds);

    // When the scope picker did not narrow, all currently grant-allowed
    // connections remain eligible. When it did narrow, intersect both sets.
    const connectionIds = scopeNarrowed
      ? grantedIds.filter((id) => scopedSet.has(id))
      : grantedIds;

    return {
      restricted: true,
      connectionIds,
    };
  }

  return {
    restricted: true,
    connectionIds: scopedIds,
  };
}

/**
 * Returns the connection id for endpoints that accept only a single
 * connection filter.
 *
 * Priority:
 * 1. Explicit Account/FilterBar selection.
 * 2. Exactly one connection in a restricted scope.
 * 3. Undefined when the endpoint must operate across the current scope.
 *
 * IMPORTANT:
 * `undefined` does not mean "authorized for the whole organization".
 * Callers must use a multi-id/scoped endpoint when the effective scope
 * contains multiple restricted connections.
 */
export function scopedConnectionId(
  scope: EffectiveScope,
): string | undefined {
  const activeConnectionId =
    typeof scope.activeConnectionId === 'string'
      ? scope.activeConnectionId.trim()
      : '';

  if (activeConnectionId) {
    return activeConnectionId;
  }

  if (
    scope.restricted &&
    Array.isArray(scope.connectionIds) &&
    scope.connectionIds.length === 1
  ) {
    const connectionId = scope.connectionIds[0];
    return typeof connectionId === 'string' && connectionId.trim()
      ? connectionId.trim()
      : undefined;
  }

  return undefined;
}

/**
 * Returns connection ids for endpoints that support a multi-connection
 * filter.
 *
 * `undefined` means the effective scope is unrestricted, so the endpoint can
 * use its normal unscoped query behavior. A restricted scope always returns a
 * concrete list, including an empty list.
 */
export function scopedConnectionIds(
  scope: EffectiveScope,
): string[] | undefined {
  const activeConnectionId =
    typeof scope.activeConnectionId === 'string'
      ? scope.activeConnectionId.trim()
      : '';

  if (activeConnectionId) {
    return [activeConnectionId];
  }

  if (scope.restricted && Array.isArray(scope.connectionIds)) {
    return normalizeIds(scope.connectionIds);
  }

  return undefined;
}

export interface MonitoringHealthLike {
  total: number;
  overallByState: Record<string, number>;
  overallByStatus: Record<string, number>;
  connections: Array<{
    connectionId: string;
    total: number;
    byState: Record<string, number>;
    byStatus: Record<string, number>;
  }>;
}

function addNumericValues(
  target: Record<string, number>,
  values: Record<string, number>,
): void {
  for (const [key, rawValue] of Object.entries(values)) {
    const value =
      typeof rawValue === 'number' && Number.isFinite(rawValue)
        ? rawValue
        : 0;

    if (value === 0 && !(key in target)) {
      target[key] = 0;
      continue;
    }

    target[key] = (target[key] ?? 0) + value;
  }
}

function normalizeHealthConnection(
  connection: MonitoringHealthLike['connections'][number],
): MonitoringHealthLike['connections'][number] | null {
  if (
    !connection ||
    typeof connection.connectionId !== 'string' ||
    connection.connectionId.trim().length === 0
  ) {
    return null;
  }

  const total =
    typeof connection.total === 'number' && Number.isFinite(connection.total)
      ? Math.max(0, connection.total)
      : 0;

  return {
    connectionId: connection.connectionId.trim(),
    total,
    byState: connection.byState ?? {},
    byStatus: connection.byStatus ?? {},
  };
}

/**
 * `getMonitoringHealth()` has no scope parameter but already exposes a
 * per-connection breakdown. For a restricted scope, recompute the aggregate
 * fields using only in-scope connection records.
 *
 * Unrestricted scope returns the original object so callers retain reference
 * identity and the original server payload.
 *
 * The input is never mutated.
 */
export function scopeMonitoringHealth<T extends MonitoringHealthLike>(
  data: T,
  scope: EffectiveScope,
): T {
  const scopedIds = scopedConnectionIds(scope);

  if (scopedIds === undefined) {
    return data;
  }

  const allowedIds = new Set(scopedIds);
  const inScope = data.connections
    .map(normalizeHealthConnection)
    .filter(
      (
        connection,
      ): connection is MonitoringHealthLike['connections'][number] =>
        connection !== null && allowedIds.has(connection.connectionId),
    );

  const overallByState: Record<string, number> = {};
  const overallByStatus: Record<string, number> = {};

  for (const connection of inScope) {
    addNumericValues(overallByState, connection.byState);
    addNumericValues(overallByStatus, connection.byStatus);
  }

  const total = inScope.reduce(
    (sum, connection) => sum + connection.total,
    0,
  );

  return {
    ...data,
    total,
    overallByState,
    overallByStatus,
    connections: inScope,
  };
}
