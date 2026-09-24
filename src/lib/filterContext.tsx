/**
 * Global application filters and cloud-connection catalogue.
 *
 * Responsibilities:
 * - own the app-wide region/account/date-range filters;
 * - load the complete AWS/GCP/Azure connection catalogue for authenticated
 *   users;
 * - expose a scope-filtered `connections` list for normal UI consumers;
 * - retain `allConnections` for the small set of flows that explicitly need
 *   the organization-wide list;
 * - keep provider failures isolated so one unavailable provider does not erase
 *   successful data from the others.
 *
 * IMPORTANT:
 * `connections` is a client-side data-selection convenience. It is NOT an
 * authorization boundary. Backend endpoints must enforce organization,
 * resource-grant, and account scope independently.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { useOrg } from './orgContext';
import {
  type UnifiedAccountRow,
  toUnifiedRow,
  toUnifiedGcpRow,
  toUnifiedAzureRow,
} from './unifiedAccounts';
import { fetchAllPages } from './fetchAllPages';
import { filterConnectionsByScope } from './scope';

export type DateRangePreset = '1h' | '7d' | '30d' | 'mtd';

export interface GlobalFilters {
  /** `'all'` or a specific AWS region. */
  region: string;
  /** `'all'` or a specific connection id. */
  account: string;
  dateRange: DateRangePreset;
  /** Monotonic token used by consumers that need an explicit refresh signal. */
  refreshToken: number;

  /**
   * All connected AWS accounts, GCP projects, and Azure subscriptions after
   * provider normalization, narrowed to the current folder/project scope.
   */
  connections: UnifiedAccountRow[];

  /**
   * Full authenticated organization catalogue before the folder/project scope
   * filter. Use sparingly and only where an organization-wide picker is
   * actually required.
   */
  allConnections: UnifiedAccountRow[];
}

interface FilterContextType extends GlobalFilters {
  setRegion: (region: string) => void;
  setAccount: (account: string) => void;
  setDateRange: (range: DateRangePreset) => void;
  refresh: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

const DEFAULT_DATE_RANGE: DateRangePreset = '30d';

function normalizeFilterValue(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAccountSelection(
  requested: string,
  connections: readonly UnifiedAccountRow[],
): string {
  const normalized = normalizeFilterValue(requested);

  if (!normalized || normalized === 'all') {
    return 'all';
  }

  return connections.some((connection) => connection.id === normalized)
    ? normalized
    : 'all';
}

function toUnifiedConnections<T>(
  result: PromiseSettledResult<T[]>,
  map: (item: T) => UnifiedAccountRow,
): UnifiedAccountRow[] {
  if (result.status !== 'fulfilled') {
    return [];
  }

  return result.value
    .map((item) => {
      try {
        return map(item);
      } catch {
        // One malformed provider row should not invalidate every other
        // account returned by the provider.
        return null;
      }
    })
    .filter(
      (row): row is UnifiedAccountRow =>
        row !== null &&
        typeof row.id === 'string' &&
        row.id.trim().length > 0,
    );
}

function mergeUniqueConnections(
  groups: readonly UnifiedAccountRow[][],
): UnifiedAccountRow[] {
  const seen = new Set<string>();
  const result: UnifiedAccountRow[] = [];

  for (const group of groups) {
    for (const connection of group) {
      const id = connection.id.trim();

      if (!id || seen.has(id)) {
        continue;
      }

      seen.add(id);
      result.push(connection);
    }
  }

  return result;
}

export function FilterProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const { currentOrg, scope, folders, projects } = useOrg();

  const [region, setRegionState] = useState('all');
  const [account, setAccountState] = useState('all');
  const [dateRange, setDateRangeState] =
    useState<DateRangePreset>(DEFAULT_DATE_RANGE);
  const [refreshToken, setRefreshToken] = useState(0);
  const [allConnections, setAllConnections] = useState<
    UnifiedAccountRow[]
  >([]);

  /**
   * Incremented for every catalogue load. A stale Promise.allSettled result
   * must never overwrite data belonging to a newer auth/org/refresh state.
   */
  const requestGenerationRef = useRef(0);

  /**
   * Keep the latest account selection available to asynchronous effects
   * without making the whole provider reload solely because a user selected
   * a different account.
   */
  const accountRef = useRef(account);

  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  /**
   * Folder/project ScopePicker changes are applied locally against the already
   * loaded organization-wide catalogue. No extra provider requests are
   * required merely to narrow the current scope.
   */
  const connections = useMemo(
    () =>
      filterConnectionsByScope(
        allConnections,
        scope,
        folders,
        projects,
      ),
    [allConnections, scope, folders, projects],
  );

  const setRegion = useCallback((value: string) => {
    const normalized = normalizeFilterValue(value);
    setRegionState(normalized || 'all');
  }, []);

  const setAccount = useCallback((value: string) => {
    const normalized = normalizeFilterValue(value);
    setAccountState(normalized || 'all');
  }, []);

  const setDateRange = useCallback((range: DateRangePreset) => {
    setDateRangeState(range);
  }, []);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  /**
   * Load every provider's complete connection list.
   *
   * allSettled is deliberate:
   * - AWS failure must not erase working GCP/Azure rows;
   * - GCP failure must not erase AWS/Azure rows;
   * - Azure failure must not erase AWS/GCP rows.
   *
   * The generation guard handles refresh/org/auth races because the underlying
   * API client may not expose AbortSignal all the way through fetchAllPages.
   */
  useEffect(() => {
    const generation = ++requestGenerationRef.current;

    if (!isAuthenticated || !currentOrg?.id) {
      setAllConnections([]);
      setAccountState('all');
      return;
    }

    let disposed = false;

    const loadConnections = async () => {
      const results = await Promise.allSettled([
        fetchAllPages((page, limit) =>
          api.getAccounts({ page, limit }),
        ),
        fetchAllPages((page, limit) =>
          api.getGcpAccounts({ page, limit }),
        ),
        fetchAllPages((page, limit) =>
          api.getAzureAccounts({ page, limit }),
        ),
      ]);

      if (
        disposed ||
        generation !== requestGenerationRef.current
      ) {
        return;
      }

      const [aws, gcp, azure] = results;

      const awsRows = toUnifiedConnections(
        aws,
        toUnifiedRow,
      );

      const gcpRows = toUnifiedConnections(
        gcp,
        toUnifiedGcpRow,
      );

      const azureRows = toUnifiedConnections(
        azure,
        toUnifiedAzureRow,
      );

      const merged = mergeUniqueConnections([
        awsRows,
        gcpRows,
        azureRows,
      ]);

      setAllConnections(merged);

      /**
       * Do not keep a selected account that disappeared from the latest
       * authoritative catalogue. This can happen after disconnect/delete or
       * after an organization switch.
       */
      setAccountState((current) =>
        normalizeAccountSelection(current, merged),
      );
    };

    void loadConnections().catch(() => {
      /**
       * A failed request is isolated at the provider level by allSettled.
       * An unexpected orchestration failure should not throw out of an effect.
       * Keep the previous successful catalogue intact when one exists.
       */
    });

    return () => {
      disposed = true;
    };
  }, [
    refreshToken,
    isAuthenticated,
    currentOrg?.id,
  ]);

  /**
   * If the current folder/project scope removes the selected account from the
   * normal scoped list, do not silently leave an impossible UI selection.
   *
   * `all` remains valid for the global account filter; a selected connection
   * must exist in the currently visible scoped catalogue.
   */
  useEffect(() => {
    const selected = normalizeFilterValue(accountRef.current);

    if (
      !selected ||
      selected === 'all'
    ) {
      return;
    }

    const existsInScope = connections.some(
      (connection) => connection.id === selected,
    );

    if (!existsInScope) {
      setAccountState('all');
    }
  }, [connections]);

  const contextValue = useMemo<FilterContextType>(
    () => ({
      region,
      account,
      dateRange,
      refreshToken,
      connections,
      allConnections,
      setRegion,
      setAccount,
      setDateRange,
      refresh,
    }),
    [
      region,
      account,
      dateRange,
      refreshToken,
      connections,
      allConnections,
      setRegion,
      setAccount,
      setDateRange,
      refresh,
    ],
  );

  return (
    <FilterContext.Provider value={contextValue}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextType {
  const context = useContext(FilterContext);

  if (!context) {
    throw new Error(
      'useFilters must be used within FilterProvider',
    );
  }

  return context;
}

/**
 * Convert the UI date-range preset to the lookback value expected by current
 * Overview APIs.
 *
 * NOTE:
 * The existing API contract represents `1h` with a one-day lookback. That is
 * intentionally preserved here for compatibility; callers that need a true
 * one-hour window must use an endpoint accepting explicit timestamps.
 */
export function dateRangeToDays(
  range: DateRangePreset,
): number {
  switch (range) {
    case '1h':
      return 1;
    case '7d':
      return 7;
    case '30d':
      return 30;
    case 'mtd':
      return new Date().getDate();
    default:
      return 30;
  }
}
