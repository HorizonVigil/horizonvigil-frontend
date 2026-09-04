/**
 * FinOps' Cloud + Environment "group filter" — shared across all three
 * FinOps sections (Overview, Cost Management, Cost Optimization), owned by
 * FinOps.tsx and passed down. Lives separately from overview.ts, which is
 * scoped to the Overview tab's own composition.
 *
 * Resolves to a `connectionIds` list that every horizonvigil-cost endpoint
 * now accepts (see connectionScopeFilter/resolveConnectionIds server-side) —
 * scoping happens in the query, not by filtering rows after the fact.
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
