import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type DateRangePreset = '1h' | '7d' | '30d' | 'mtd' | 'custom';

export interface GlobalFilters {
  region: string; // 'all' or a specific AWS region
  dateRange: DateRangePreset;
  refreshToken: number;
}

interface FilterContextType extends GlobalFilters {
  setRegion: (region: string) => void;
  setDateRange: (range: DateRangePreset) => void;
  refresh: () => void;
}

const FilterContext = createContext<FilterContextType | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState('all');
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken(t => t + 1), []);

  return (
    <FilterContext.Provider value={{ region, dateRange, refreshToken, setRegion, setDateRange, refresh }}>
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
