import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const DEMO_DATA_KEY = 'horizonvigil_demo_data';

function getInitialEnabled(): boolean {
  return localStorage.getItem(DEMO_DATA_KEY) === 'on';
}

interface DemoDataContextType {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

const DemoDataContext = createContext<DemoDataContextType | null>(null);

/**
 * Client-side-only "simulated enterprise-scale data" mode -- see
 * lib/demoData/seed.ts for the generators and DemoDataBanner.tsx for the
 * visible indicator. Off by default; persisted the same way lib/theme.tsx
 * persists its choice, so a reload doesn't silently drop back to real data
 * mid-demo. Never talks to any API -- toggling this never issues a network
 * request, and no seed-module output is ever sent anywhere.
 */
export function DemoDataProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState<boolean>(getInitialEnabled);

  useEffect(() => {
    localStorage.setItem(DEMO_DATA_KEY, enabled ? 'on' : 'off');
  }, [enabled]);

  const setEnabled = useCallback((next: boolean) => setEnabledState(next), []);
  const toggle = useCallback(() => setEnabledState(e => !e), []);

  return <DemoDataContext.Provider value={{ enabled, setEnabled, toggle }}>{children}</DemoDataContext.Provider>;
}

export function useDemoData() {
  const context = useContext(DemoDataContext);
  if (!context) throw new Error('useDemoData must be used within DemoDataProvider');
  return context;
}
