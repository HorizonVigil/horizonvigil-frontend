import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api, type CloudConnection } from './api';

export type DateRangePreset = '1h' | '7d' | '30d' | 'mtd' | 'custom';

export interface GlobalFilters {
  region: string; // 'all' or a specific AWS region
  account: string; // 'all' or a specific connection id
  dateRange: DateRangePreset;
  refreshToken: number;
  connections: CloudConnection[]; // powers the Account dropdown, fetched once here instead of per-page
}

interface FilterContextType extends GlobalFilters {
  setRegion: (region: string) => void;
  setAccount: (account: string) => void;
  setDateRange: (range: DateRangePreset) => void;
  refresh: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState('all');
  const [account, setAccount] = useState('all');
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [refreshToken, setRefreshToken] = useState(0);
  const [connections, setConnections] = useState<CloudConnection[]>([]);

  const refresh = useCallback(() => setRefreshToken(t => t + 1), []);

  // Lives here (above the router, mounted once) rather than being re-fetched
  // by every page that wants an Account filter — every page reads the same
  // list, and it refetches whenever something bumps refreshToken (e.g. the
  // FilterBar's Refresh button, or connecting/disconnecting an account).
  useEffect(() => { void api.getAccounts({ limit: 200 }).then(r => setConnections(r.items)); }, [refreshToken]);

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
