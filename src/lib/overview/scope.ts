/**
 * Resolves the user's {@link EffectiveScope} for the current org session —
 * the "what data can this user see" axis of the Overview pipeline
 * (issue §1, §13).
 *
 * Composes:
 *   - org / folders / projects / resource grants  → useOrg()
 *   - the app-wide Account + Region filter         → useFilters()
 *   - personalization defaults (project / env)     → passed in by the page
 *
 * Widgets receive this object and forward `connectionId` / `connection_ids` /
 * `region` on every query. The frontend never fetches an org-wide set and
 * hides rows; endpoints that lack a scope parameter today are called out in
 * the individual widget files as a backend follow-up.
 */
import { useMemo } from 'react';
import { useOrg } from '../orgContext';
import { useFilters } from '../filterContext';
import type { EffectiveScope } from './types';

export function useEffectiveScope(defaults?: { projectId?: string; environment?: string }): EffectiveScope {
  const { currentOrg, folders, projects, resourceGrants } = useOrg();
  const { connections, account, region } = useFilters();

  return useMemo(() => {
    const knownConnectionIds = new Set(connections.map((c) => c.id));
    const restricted = resourceGrants?.restricted ?? false;
    const connectionIds: string[] | 'all' = restricted
      ? (resourceGrants?.connectionIds ?? []).filter((id) => knownConnectionIds.size === 0 || knownConnectionIds.has(id))
      : 'all';

    return {
      orgId: currentOrg?.id ?? '',
      orgName: currentOrg?.name ?? '',
      folders,
      projects,
      restricted,
      connectionIds,
      activeConnectionId: account !== 'all' ? account : undefined,
      activeProjectId: defaults?.projectId,
      activeEnvironment: defaults?.environment,
      region,
    };
  }, [currentOrg, folders, projects, resourceGrants, connections, account, region, defaults?.projectId, defaults?.environment]);
}

/**
 * The `connectionId` a scoped single-account query should use, or undefined
 * for "all in scope". Priority: an explicit FilterBar account selection wins;
 * otherwise a restricted user with exactly one granted connection is pinned
 * to it; otherwise undefined (the widget queries across the whole scope).
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
