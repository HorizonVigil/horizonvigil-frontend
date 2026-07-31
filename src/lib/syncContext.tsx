import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { api } from './api';

export interface SyncState {
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  stepId: string;
  error?: string;
  warning?: string;
}

interface SyncContextType {
  syncStates: Record<string, SyncState>;
  startSync: (connectionId: string) => void;
  startDiscovery: (connectionId: string) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

/**
 * Mounted once at the app root so a check/scan started from AwsAccounts.tsx
 * keeps running even if that component unmounts mid-request.
 *
 * `startSync` is the lightweight credentials check (`/test` — no live AWS
 * call). `startDiscovery` drives the real multi-step scan (plan -> step*N ->
 * finalize) restored from the pre-teardown build, one request per
 * scanner×region step so each invocation fits Cloudflare's free-tier
 * CPU/subrequest budget. Both write into the same `syncStates[id]` slot —
 * they're mutually exclusive per connection, which `runningIds` enforces.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const runningIds = useRef<Set<string>>(new Set());

  const startSync = useCallback((connectionId: string) => {
    if (runningIds.current.has(connectionId)) return;
    runningIds.current.add(connectionId);
    setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done: 0, total: 1, stepId: 'test' } }));

    (async () => {
      try {
        const result = await api.testAccount(connectionId);
        setSyncStates(prev => ({
          ...prev,
          [connectionId]: {
            status: 'done', done: 1, total: 1, stepId: '',
            warning: result.credentialsPresent ? result.message : undefined,
            error: result.credentialsPresent ? undefined : result.message,
          },
        }));
      } catch (err) {
        setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'error', done: 0, total: 1, stepId: '', error: (err as Error).message || 'Test failed.' } }));
      } finally {
        runningIds.current.delete(connectionId);
      }
    })();
  }, []);

  const startDiscovery = useCallback((connectionId: string) => {
    if (runningIds.current.has(connectionId)) return;
    runningIds.current.add(connectionId);
    setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done: 0, total: 1, stepId: 'Planning scan…' } }));

    (async () => {
      const runStartedAt = new Date().toISOString();
      const stepErrors: { message: string; severity: 'error' | 'info' }[] = [];
      try {
        const { steps } = await api.getDiscoverySteps(connectionId);
        const total = steps.length || 1;
        for (let done = 0; done < steps.length; done++) {
          const stepId = steps[done];
          setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done, total, stepId } }));
          const result = await api.runDiscoveryStep(connectionId, stepId);
          if (result.error) stepErrors.push({ message: `${stepId}: ${result.error}`, severity: result.errorSeverity ?? 'error' });
        }
        setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done: steps.length, total, stepId: 'Finishing up…' } }));
        const summary = await api.finalizeDiscovery(connectionId, runStartedAt, stepErrors);
        // Best-effort — a scan that found real resources should still report success even if this fails.
        await api.generateRecommendations(connectionId).catch(() => {});
        const realErrors = stepErrors.filter(e => e.severity !== 'info');
        setSyncStates(prev => ({
          ...prev,
          [connectionId]: {
            status: realErrors.length > 0 ? 'error' : 'done', done: steps.length, total, stepId: '',
            error: realErrors.length > 0 ? `${realErrors.length} scan step${realErrors.length === 1 ? '' : 's'} failed: ${realErrors[0].message}` : undefined,
            warning: realErrors.length === 0 ? `Found ${summary.totalResources} resources${summary.deleted ? `, removed ${summary.deleted} no longer in AWS` : ''}.` : undefined,
          },
        }));
      } catch (err) {
        setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'error', done: 0, total: 1, stepId: '', error: (err as Error).message || 'Discovery failed.' } }));
      } finally {
        runningIds.current.delete(connectionId);
      }
    })();
  }, []);

  return <SyncContext.Provider value={{ syncStates, startSync, startDiscovery }}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}

/** Calls `onComplete` once when any of `connectionIds` transitions out of 'running'. */
export function useSyncCompletion(connectionIds: string[], onComplete: () => void) {
  const { syncStates } = useSync();
  const prevStatus = useRef<Record<string, string | undefined>>({});
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
