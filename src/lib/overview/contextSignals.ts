/**
 * Level-3 context awareness (issue §15): the live risk signals that let the
 * engine promote a widget to the top of the Overview and let
 * <SignalCenter> surface a banner — a critical incident, a spend anomaly, a
 * failed deploy, a fresh critical vulnerability.
 *
 * One capability-gated `Promise.allSettled` fan-out — a sub-call is only
 * fired if the user could act on what it returns, and any individual failure
 * degrades that signal to 0 rather than blanking the rest.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { daysAgoISO } from '../format';
import { dateRangeToDays, useFilters } from '../filterContext';
import { scopedConnectionId } from './scope';
import { EMPTY_SIGNALS, scopeQueryKey, type Capabilities, type ContextSignals, type EffectiveScope } from './types';

async function fetchSignals(scope: EffectiveScope, can: Capabilities, fromISO: string): Promise<ContextSignals> {
  const connectionId = scopedConnectionId(scope);
  const wantIncidents = can.has('incident.read');
  const wantSecurity = can.has('security.read');
  const wantCost = can.has('cost.read');
  const wantDevops = can.has('devops.read');
  const wantObs = can.has('observability.read');

  const [openInc, invInc, vulns, paths, anomalies, deploys, alerts] = await Promise.allSettled([
    wantIncidents ? api.getIncidents({ status: 'open', limit: 1 }) : Promise.resolve(null),
    wantIncidents ? api.getIncidents({ status: 'investigating', limit: 1 }) : Promise.resolve(null),
    wantSecurity ? api.getVulnerabilityDashboard() : Promise.resolve(null),
    wantSecurity ? api.getAttackPaths() : Promise.resolve(null),
    wantCost ? api.getCostAnomalies({ status: 'open', limit: 50, ...(connectionId ? { connectionId } : {}) }) : Promise.resolve(null),
    wantDevops ? api.getDeploymentEvents({ from: fromISO, limit: 50, ...(connectionId ? { connectionId } : {}) }) : Promise.resolve(null),
    wantObs ? api.getActiveAlerts({ severity: 'critical', limit: 1 }) : Promise.resolve(null),
  ]);

  const val = <T,>(r: PromiseSettledResult<T | null>): T | null => (r.status === 'fulfilled' ? r.value : null);

  const vulnDash = val(vulns);
  const anomalyRows = val(anomalies)?.items ?? [];
  const deployRows = val(deploys)?.items ?? [];
  const failedDeploys = deployRows.filter((d) => /fail|rollback|delete_failed|cancel/i.test(d.status)).length;

  return {
    criticalIncidents: val(openInc)?.pagination.total ?? 0,
    investigatingIncidents: val(invInc)?.pagination.total ?? 0,
    criticalVulns: vulnDash?.bySeverity?.critical ?? 0,
    openAttackPaths: val(paths)?.items.length ?? 0,
    costAnomalies: anomalyRows.length,
    anomalyDollarImpact: anomalyRows.reduce((s, a) => s + (Number(a.dollar_impact) || 0), 0),
    failedDeployments: failedDeploys,
    criticalAlerts: val(alerts)?.pagination.total ?? 0,
    generatedAt: new Date().toISOString(),
  };
}

export function useContextSignals(scope: EffectiveScope, can: Capabilities): { signals: ContextSignals; loading: boolean; error: boolean } {
  const { dateRange } = useFilters();
  const fromISO = daysAgoISO(dateRangeToDays(dateRange));

  const query = useQuery({
    queryKey: ['overview', 'context-signals', scopeQueryKey(scope), can.list().join(','), dateRange],
    queryFn: () => fetchSignals(scope, can, fromISO),
    staleTime: 60_000,
    enabled: Boolean(scope.orgId),
  });

  return {
    signals: query.data ?? EMPTY_SIGNALS,
    loading: query.isLoading,
    error: query.isError,
  };
}
