import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { api } from './api';

export interface SyncState {
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  stepId: string;
  error?: string;
}

interface SyncContextType {
  syncStates: Record<string, SyncState>;
  startSync: (connectionId: string) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

/**
 * Mounted once at the app root (above the router), so a sync started from
 * AwsAccounts.tsx keeps running to completion even after the user navigates
 * to another page and that component unmounts — the promise chain lives
 * here, not in whichever page triggered it. Without this, navigating away
 * mid-sync didn't actually stop the sync (it's just a JS promise chain that
 * runs to completion regardless), but coming back showed a fresh "Sync Now"
 * button with no memory that one was already running — inviting a second,
 * concurrent sync of the same connection.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const runningIds = useRef<Set<string>>(new Set());

  const startSync = useCallback((connectionId: string) => {
    if (runningIds.current.has(connectionId)) return; // already running — ignore a duplicate trigger
    runningIds.current.add(connectionId);
    setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done: 0, total: 0, stepId: '' } }));

    (async () => {
      try {
        await api.runDiscoverySteps(connectionId, (done, total, stepId) => {
          setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done, total, stepId } }));
        });
        await api.syncConnectionCost(connectionId).catch(() => {});
        await api.generateRecommendations(connectionId).catch(() => {});
        setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'done', done: 0, total: 0, stepId: '' } }));
      } catch (err) {
        setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'error', done: 0, total: 0, stepId: '', error: (err as Error).message || 'Sync failed.' } }));
      } finally {
        runningIds.current.delete(connectionId);
      }
    })();
  }, []);

  return <SyncContext.Provider value={{ syncStates, startSync }}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

/** Calls `onComplete` once when any of `connectionIds` transitions out of 'running' — used to refresh a page's data when a background sync (possibly started from elsewhere) finishes. */
export function useSyncCompletion(connectionIds: string[], onComplete: () => void) {
  const { syncStates } = useSync();
  const prevStatus = useRef<Record<string, string | undefined>>({});
  // Refreshed every render (not just on syncStates changes) so the effect
  // below always calls the latest onComplete/connectionIds without needing
  // them in its dependency array — they're new references every render.
  const latest = useRef({ connectionIds, onComplete });
  latest.current = { connectionIds, onComplete };

  useEffect(() => {
    let completed = false;
    for (const id of latest.current.connectionIds) {
      const status = syncStates[id]?.status;
      if (prevStatus.current[id] === 'running' && (status === 'done' || status === 'error')) completed = true;
      prevStatus.current[id] = status;
    }
    if (completed) latest.current.onComplete();
  }, [syncStates]);
}
