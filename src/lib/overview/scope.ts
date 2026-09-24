/**
 * Resolves the user's {@link EffectiveScope} for the current org session —
 * the "what data can this user see" axis of the Overview pipeline
 * (issue §1, §13).
 *
 * Composes:
 *   - org / folders / projects / resource grants → useOrg()
 *   - the org/folder/project <ScopePicker> selection → useOrg().scope
 *   - the app-wide Account + Region filter → useFilters()
 *   - personalization defaults (project / environment) → passed by the page
 *
 * Widgets receive this object and forward the relevant scope identifiers on
 * every query. The frontend is not an authorization boundary: every backend
 * endpoint must enforce the caller's actual data scope.
 *
 * The pure resolution logic lives in scopeLogic.ts. Re-exporting it here
 * keeps existing imports from `lib/overview/scope` compatible.
 */
import { useMemo } from 'react';
import { useOrg } from '../orgContext';
import { useFilters } from '../filterContext';
import type { EffectiveScope } from './types';
import { resolveConnectionScope } from './scopeLogic';

export {
  resolveConnectionScope,
  scopedConnectionId,
  scopedConnectionIds,
  scopeMonitoringHealth,
} from './scopeLogic';

export interface OverviewScopeDefaults {
  projectId?: string;
  environment?: string;
}

function normalizedOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Resolve the effective scope used by Overview widgets.
 *
 * The hook intentionally reuses the connection list already narrowed by
 * filterContext rather than re-deriving folder/project membership here.
 * This keeps ScopePicker semantics centralized and avoids divergent scope
 * calculations between filters and Overview.
 */
export function useEffectiveScope(
  defaults?: OverviewScopeDefaults,
): EffectiveScope {
  const {
    currentOrg,
    folders,
    projects,
    resourceGrants,
    scope,
  } = useOrg();

  const {
    connections,
    account,
    region,
  } = useFilters();

  const projectId = normalizedOptionalString(defaults?.projectId);
  const environment = normalizedOptionalString(defaults?.environment);

  return useMemo(() => {
    /**
     * `scope.type === 'org'` means the picker is at organization scope.
     * Any other resolved picker scope is considered narrowed.
     */
    const scopeNarrowed = scope?.type != null && scope.type !== 'org';

    /**
     * filterContext is the source of truth for which connections are in the
     * current picker/filter slice. `resolveConnectionScope` then applies
     * resource grants without widening that already-filtered set.
     */
    const connectionIds = connections
      .map((connection) => connection?.id)
      .filter(
        (id): id is string =>
          typeof id === 'string' && id.trim().length > 0,
      );

    const resolved = resolveConnectionScope(
      connectionIds,
      Boolean(scopeNarrowed),
      resourceGrants,
    );

    const orgId =
      typeof currentOrg?.id === 'string'
        ? currentOrg.id.trim()
        : '';

    const orgName =
      typeof currentOrg?.name === 'string'
        ? currentOrg.name
        : '';

    const activeConnectionId =
      account !== 'all' &&
      typeof account === 'string' &&
      account.trim().length > 0
        ? account.trim()
        : undefined;

    return {
      orgId,
      orgName,
      folders,
      projects,
      restricted: Boolean(resolved.restricted),
      connectionIds: resolved.connectionIds,
      activeConnectionId,
      activeProjectId: projectId,
      activeEnvironment: environment,
      region,
    };
  }, [
    currentOrg?.id,
    currentOrg?.name,
    folders,
    projects,
    resourceGrants,
    scope?.type,
    connections,
    account,
    region,
    projectId,
    environment,
  ]);
}
