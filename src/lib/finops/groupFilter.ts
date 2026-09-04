/**
 * FinOps' Cloud + Environment "group filter" — shared across all three
 * FinOps sections (Overview, Cost Management, Cost Optimization), owned by
 * FinOps.tsx and passed down. Lives separately from overview.ts, which is
 * scoped to the Overview tab's own composition.
 *
 * Most cost-optimization-api endpoints (and a couple of cost-management-api
 * ones — Cost Explorer, Forecast) only accept a single `connectionId`, not a
 * list, so a Cloud/Environment filter that resolves to *several* connections
 * can't always be sent as a request parameter the way the single-account
 * FilterBar selection is. Where the response rows carry their own
 * `connection_id` (CostSnapshot, CostRecommendation, CostAnomaly), this
 * narrows the fetched-unscoped rows down to the group client-side instead —
 * real data, just filtered in the browser rather than the query. Endpoints
 * with no per-row `connection_id` at all (cost-optimization's dashboard
 * totals, budgets, cost allocation/chargeback/showback, the CSV export,
 * forecast) genuinely can't be scoped this way — that's a backend gap, not
 * something faked here.
 */
import type { Provider } from './overview';

export type { Provider };

export interface GroupFilter {
  provider: Provider | null;
  /** 'all' or a specific connection environment (e.g. 'production'). */
  environment: string;
}

export interface ResolvedGroupFilter extends GroupFilter {
  /** Connection ids matching the filter, or undefined when neither half of the filter is active (meaning: don't narrow at all). */
  connectionIds?: string[];
}

/** The connection ids matching the active group filter. undefined when no Cloud/Environment filter is active. */
export function groupConnectionIds(filter: GroupFilter, connections: { id: string; provider: Provider; environment: string }[]): string[] | undefined {
  if (!filter.provider && filter.environment === 'all') return undefined;
  return connections
    .filter((c) => (!filter.provider || c.provider === filter.provider) && (filter.environment === 'all' || c.environment === filter.environment))
    .map((c) => c.id);
}

/** Keeps only rows whose connection_id is in the group filter's connection list. A no-op (returns `rows` unchanged) when no group filter is active (connectionIds is undefined) — e.g. when a more specific single-account filter already scoped the request server-side. */
export function filterByGroup<T extends { connection_id: string }>(rows: T[], connectionIds: string[] | undefined): T[] {
  if (!connectionIds) return rows;
  const ids = new Set(connectionIds);
  return rows.filter((r) => ids.has(r.connection_id));
}
