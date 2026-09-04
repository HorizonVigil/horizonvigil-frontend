/**
 * Pure scope-resolution logic, split out of scope.ts so it stays importable
 * from vitest — like types.ts, this file only ever takes `import type` from
 * lib/api.ts's chain (which throws at module load with no
 * VITE_SUPABASE_URL). scope.ts (the `useEffectiveScope` hook + its
 * context wiring) re-exports everything here for existing callers.
 */
import type { EffectiveScope } from './types';

/**
 * The `restricted` / `connectionIds` pair, from the two axes that can each
 * independently narrow "which connections is this user looking at": a
 * folder/project scope pick, and an RBAC resource-grant restriction.
 */
export function resolveConnectionScope(
  scopeNarrowedConnectionIds: string[],
  scopeNarrowed: boolean,
  resourceGrants: { restricted: boolean; connectionIds: string[] } | null,
): { restricted: boolean; connectionIds: string[] | 'all' } {
  const grantsRestricted = resourceGrants?.restricted ?? false;
  const restricted = scopeNarrowed || grantsRestricted;
  if (!restricted) return { restricted: false, connectionIds: 'all' };
  // Both axes can apply at once -- when they do, the visible set is whichever
  // connections satisfy both, so intersect rather than let one win outright.
  const connectionIds = grantsRestricted
    ? resourceGrants!.connectionIds.filter((id) => scopeNarrowedConnectionIds.includes(id))
    : scopeNarrowedConnectionIds;
  return { restricted, connectionIds };
}

/**
 * The `connectionId` a scoped single-account query should use, or undefined
 * for "all in scope". Priority: an explicit FilterBar account selection wins;
 * otherwise a restricted user with exactly one connection in scope is pinned
 * to it; otherwise undefined (the widget queries across the whole scope --
 * meaning, for an endpoint with no multi-id filter param, it silently falls
 * back to org-wide when more than one connection is in scope).
 */
export function scopedConnectionId(scope: EffectiveScope): string | undefined {
  if (scope.activeConnectionId) return scope.activeConnectionId;
  if (scope.restricted && Array.isArray(scope.connectionIds) && scope.connectionIds.length === 1) {
    return scope.connectionIds[0];
  }
  return undefined;
}

/** `connection_ids` CSV for endpoints that accept a multi-account filter, or undefined for unrestricted. */
export function scopedConnectionIds(scope: EffectiveScope): string[] | undefined {
  if (scope.activeConnectionId) return [scope.activeConnectionId];
  if (scope.restricted && Array.isArray(scope.connectionIds)) return scope.connectionIds;
  return undefined;
}

export interface MonitoringHealthLike {
  total: number;
  overallByState: Record<string, number>;
  overallByStatus: Record<string, number>;
  connections: { connectionId: string; total: number; byState: Record<string, number>; byStatus: Record<string, number> }[];
}

/**
 * `getMonitoringHealth()` takes no scope param, but it already returns a
 * per-connection breakdown -- re-derive the overall totals from just the
 * connections in scope instead of leaving the pre-aggregated (org-wide)
 * fields as-is. Unrestricted scope returns `data` unchanged.
 */
export function scopeMonitoringHealth<T extends MonitoringHealthLike>(data: T, scope: EffectiveScope): T {
  const ids = scopedConnectionIds(scope);
  if (!ids) return data;
  const idSet = new Set(ids);
  const inScope = data.connections.filter((c) => idSet.has(c.connectionId));
  const sumBy = (key: 'byState' | 'byStatus') => {
    const out: Record<string, number> = {};
    for (const c of inScope) for (const [k, v] of Object.entries(c[key])) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  return {
    ...data,
    total: inScope.reduce((n, c) => n + c.total, 0),
    overallByState: sumBy('byState'),
    overallByStatus: sumBy('byStatus'),
    connections: inScope,
  };
}
