import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { type UnifiedAccountRow, toUnifiedRow, toUnifiedGcpRow, toUnifiedAzureRow } from './unifiedAccounts';
import { fetchAllPages } from './fetchAllPages';

export type DateRangePreset = '1h' | '7d' | '30d' | 'mtd' | 'custom';

export interface GlobalFilters {
  region: string; // 'all' or a specific AWS region
  account: string; // 'all' or a specific connection id
  dateRange: DateRangePreset;
  refreshToken: number;
  /** Every connected AWS account, GCP project, AND Azure subscription, merged — was AWS-only until an earlier fix (then AWS+GCP), which meant the app-wide Account dropdown (FilterBar, budget/maintenance-window scope pickers, ...) could never even show a GCP project or Azure subscription, let alone filter by one. */
  connections: UnifiedAccountRow[];
}

interface FilterContextType extends GlobalFilters {
  setRegion: (region: string) => void;
  setAccount: (account: string) => void;
  setDateRange: (range: DateRangePreset) => void;
  refresh: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [region, setRegion] = useState('all');
  const [account, setAccount] = useState('all');
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [refreshToken, setRefreshToken] = useState(0);
  const [connections, setConnections] = useState<UnifiedAccountRow[]>([]);

  const refresh = useCallback(() => setRefreshToken(t => t + 1), []);

  // Lives here (above the router, mounted once) rather than being re-fetched
  // by every page that wants an Account filter — every page reads the same
  // list, and it refetches whenever something bumps refreshToken (e.g. the
  // FilterBar's Refresh button, or connecting/disconnecting an account).
  // All three providers, each paginated to completion via fetchAllPages
  // (not a single limit:200 fetch, which used to silently truncate any org
  // past 200 accounts on one cloud with no indication anything was missing)
  // then merged client-side — this dropdown needs the real full list since
  // filtering to an account past #200 previously had no way to even find it.
  // allSettled, not all — a hiccup in one provider's API (e.g. gcp-accounts-api
  // briefly unavailable) must not blank out the other provider's accounts too.
  useEffect(() => {
    // FilterProvider wraps the whole app, including the public marketing
    // routes -- without this guard, every anonymous visitor to "/" fired
    // these two authenticated-only calls and ate a 401, for no purpose
    // (there's no connections list to show until someone's logged in).
    if (!isAuthenticated) { setConnections([]); return; }
    void Promise.allSettled([
      fetchAllPages((page, limit) => api.getAccounts({ page, limit })),
      fetchAllPages((page, limit) => api.getGcpAccounts({ page, limit })),
      fetchAllPages((page, limit) => api.getAzureAccounts({ page, limit })),
    ]).then(([aws, gcp, azure]) => {
      const awsRows = aws.status === 'fulfilled' ? aws.value.map(toUnifiedRow) : [];
      const gcpRows = gcp.status === 'fulfilled' ? gcp.value.map(toUnifiedGcpRow) : [];
      const azureRows = azure.status === 'fulfilled' ? azure.value.map(toUnifiedAzureRow) : [];
      setConnections([...awsRows, ...gcpRows, ...azureRows]);
    });
  }, [refreshToken, isAuthenticated]);

  return (
    <FilterContext.Provider value={{ region, account, dateRange, refreshToken, connections, setRegion, setAccount, setDateRange, refresh }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}

export function dateRangeToDays(range: DateRangePreset): number {
  switch (range) {
    case '1h': return 1;
    case '7d': return 7;
    case '30d': return 30;
    case 'mtd': return new Date().getDate();
    default: return 30;
  }
}
