/**
 * Resolves the user's {@link EffectiveScope} for the current org session —
 * the "what data can this user see" axis of the Overview pipeline
 * (issue §1, §13).
 *
 * Composes:
 *   - org / folders / projects / resource grants  → useOrg()
 *   - the org/folder/project <ScopePicker> pick    → useOrg().scope
 *   - the app-wide Account + Region filter         → useFilters()
 *   - personalization defaults (project / env)     → passed in by the page
 *
 * Widgets receive this object and forward `connectionId` / `connection_ids` /
 * `region` on every query. The frontend never fetches an org-wide set and
 * hides rows; endpoints that lack a scope parameter today are called out in
 * the individual widget files as a backend follow-up.
 *
 * The pure resolution logic (testable from vitest) lives in scopeLogic.ts;
 * re-exported here so existing `from '.../lib/overview/scope'` imports keep
 * working unchanged.
 */
import { useMemo } from 'react';
import { useOrg } from '../orgContext';
import { useFilters } from '../filterContext';
import type { EffectiveScope } from './types';
import { resolveConnectionScope } from './scopeLogic';

export { resolveConnectionScope, scopedConnectionId, scopedConnectionIds, scopeMonitoringHealth } from './scopeLogic';

export function useEffectiveScope(defaults?: { projectId?: string; environment?: string }): EffectiveScope {
  const { currentOrg, folders, projects, resourceGrants, scope } = useOrg();
  // `connections` is already narrowed to `scope` by filterContext.tsx (see
  // lib/scope.ts) — reusing it here means a folder/project pick narrows
  // `connectionIds` the same way it narrows everything else, without this
  // hook re-deriving folder membership itself.
  const { connections, account, region } = useFilters();

  return useMemo(() => {
    const scopeNarrowed = Boolean(scope && scope.type !== 'org');
    const { restricted, connectionIds } = resolveConnectionScope(connections.map((c) => c.id), scopeNarrowed, resourceGrants);

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
  }, [currentOrg, folders, projects, resourceGrants, scope, connections, account, region, defaults?.projectId, defaults?.environment]);
}
