/**
 * Level-3 context awareness: live risk signals used to prioritize Overview
 * widgets and populate <SignalCenter>.
 *
 * This is a presentation/query orchestration layer, not an authorization
 * boundary. Every backend endpoint must enforce authorization independently.
 *
 * Design goals:
 * - fan out only to endpoints the current UI can legitimately consume;
 * - isolate failures with Promise.allSettled;
 * - keep successful signals when another endpoint fails;
 * - preserve zero as a valid result;
 * - avoid using stale/V2 data when the feature is disabled;
 * - scope tenant-sensitive requests consistently.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { daysAgoISO } from '../format';
import { dateRangeToDays, useFilters } from '../filterContext';
import { scopedConnectionId } from './scope';
import {
  isCloudOnlyMode,
  isVulnerabilityDataEnabled,
} from '../featureFlags';
import {
  EMPTY_SIGNALS,
  scopeQueryKey,
  type Capabilities,
  type ContextSignals,
  type EffectiveScope,
} from './types';

const SIGNALS_STALE_TIME_MS = 60_000;
const SIGNALS_GC_TIME_MS = 5 * 60_000;
const DEPLOYMENT_LIMIT = 50;
const ANOMALY_LIMIT = 50;

type SettledValue<T> = T | null;

function settledValue<T>(
  result: PromiseSettledResult<SettledValue<T>>,
): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function isFailedDeploymentStatus(status: unknown): boolean {
  return typeof status === 'string' &&
    /^(?:fail|failed|failure|rollback|rolled_back|delete_failed|cancel|cancelled)(?:_|$)/i.test(
      status.trim(),
    );
}

function countFailedDeployments(rows: readonly { status?: unknown }[]): number {
  return rows.reduce(
    (count, row) => count + (isFailedDeploymentStatus(row.status) ? 1 : 0),
    0,
  );
}

function sumDollarImpact(rows: readonly { dollar_impact?: unknown }[]): number {
  return rows.reduce((sum, row) => {
    const value =
      typeof row.dollar_impact === 'number'
        ? row.dollar_impact
        : typeof row.dollar_impact === 'string'
          ? Number(row.dollar_impact)
          : 0;

    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

/**
 * Fetch the currently eligible signal sources.
 *
 * A feature flag intentionally participates in eligibility in addition to the
 * capability check. Capabilities answer "could the user see/act on this?",
 * while the feature flag answers "does this product currently expose the
 * underlying data?". Both gates are required.
 */
async function fetchSignals(
  scope: EffectiveScope,
  can: Capabilities,
  fromISO: string,
): Promise<ContextSignals> {
  const connectionId = scopedConnectionId(scope);

  const wantIncidents =
    !isCloudOnlyMode() && can.has('incident.read');

  const wantSecurity =
    isVulnerabilityDataEnabled() && can.has('security.read');

  const wantCost = can.has('cost.read');
  const wantDevops = can.has('devops.read');
  const wantObs = can.has('observability.read');

  /**
   * Keep every branch as a Promise so Promise.allSettled has a stable tuple
   * shape even when a source is intentionally disabled.
   */
  const incidentOpenRequest = wantIncidents
    ? api.getIncidents({ status: 'open', limit: 1 })
    : Promise.resolve(null);

  const incidentInvestigatingRequest = wantIncidents
    ? api.getIncidents({ status: 'investigating', limit: 1 })
    : Promise.resolve(null);

  const vulnerabilityRequest = wantSecurity
    ? api.getVulnerabilityDashboard()
    : Promise.resolve(null);

  const attackPathRequest = wantSecurity
    ? api.getAttackPaths()
    : Promise.resolve(null);

  const anomalyRequest = wantCost
    ? api.getCostAnomalies({
        status: 'open',
        limit: ANOMALY_LIMIT,
        ...(connectionId ? { connectionId } : {}),
      })
    : Promise.resolve(null);

  const deploymentRequest = wantDevops
    ? api.getDeploymentEvents({
        from: fromISO,
        limit: DEPLOYMENT_LIMIT,
        ...(connectionId ? { connectionId } : {}),
      })
    : Promise.resolve(null);

  const alertRequest = wantObs
    ? api.getActiveAlerts({
        severity: 'critical',
        limit: 1,
      })
    : Promise.resolve(null);

  const [
    openIncidents,
    investigatingIncidents,
    vulnerabilities,
    attackPaths,
    anomalies,
    deployments,
    alerts,
  ] = await Promise.allSettled([
    incidentOpenRequest,
    incidentInvestigatingRequest,
    vulnerabilityRequest,
    attackPathRequest,
    anomalyRequest,
    deploymentRequest,
    alertRequest,
  ]);

  const openIncidentData = settledValue(openIncidents);
  const investigatingIncidentData = settledValue(investigatingIncidents);
  const vulnerabilityData = settledValue(vulnerabilities);
  const attackPathData = settledValue(attackPaths);
  const anomalyData = settledValue(anomalies);
  const deploymentData = settledValue(deployments);
  const alertData = settledValue(alerts);

  const anomalyRows = anomalyData?.items ?? [];
  const deploymentRows = deploymentData?.items ?? [];

  return {
    criticalIncidents:
      openIncidentData?.pagination?.total ?? 0,

    investigatingIncidents:
      investigatingIncidentData?.pagination?.total ?? 0,

    criticalVulns:
      vulnerabilityData?.bySeverity?.critical ?? 0,

    openAttackPaths:
      attackPathData?.items?.length ?? 0,

    costAnomalies: anomalyRows.length,

    anomalyDollarImpact:
      sumDollarImpact(anomalyRows),

    failedDeployments:
      countFailedDeployments(deploymentRows),

    criticalAlerts:
      alertData?.pagination?.total ?? 0,

    generatedAt: new Date().toISOString(),
  };
}

export function useContextSignals(
  scope: EffectiveScope,
  can: Capabilities,
): {
  signals: ContextSignals;
  loading: boolean;
  error: boolean;
} {
  const { dateRange } = useFilters();
  const fromISO = daysAgoISO(dateRangeToDays(dateRange));

  /**
   * `can.list()` is sorted by ALL_CAPABILITIES in the capability helper, so
   * the serialization remains deterministic and avoids unnecessary refetches
   * when the Set instance changes but effective capabilities do not.
   */
  const capabilityKey = can.list().join(',');

  const query = useQuery({
    queryKey: [
      'overview',
      'context-signals',
      scopeQueryKey(scope),
      capabilityKey,
      dateRange,
    ],
    queryFn: () => fetchSignals(scope, can, fromISO),
    staleTime: SIGNALS_STALE_TIME_MS,
    gcTime: SIGNALS_GC_TIME_MS,
    enabled: Boolean(scope.orgId),
  });

  return {
    signals: query.data ?? EMPTY_SIGNALS,
    loading: query.isPending,
    error: query.isError,
  };
}
