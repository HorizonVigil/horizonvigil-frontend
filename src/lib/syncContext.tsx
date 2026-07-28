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
}

const SyncContext = createContext<SyncContextType | null>(null);

/**
 * Mounted once at the app root so a check started from AwsAccounts.tsx keeps
 * running even if that component unmounts mid-request.
 *
 * This used to drive a multi-step AWS discovery scan (plan -> step*N ->
 * finalize) against a customer's live AWS account. That scanning engine
 * isn't part of this rebuild (see docs/about-project.md) — aws-accounts-api
 * only has a single honest `/test` endpoint that confirms stored credentials
 * are present and well-formed, no live `sts:GetCallerIdentity` call. This
 * still exposes the same `{status,done,total,stepId}` shape so call sites
 * that used to render step progress don't need special-casing, but done/total
 * are always 0/1 -> 1/1 in one jump since there's only one step now.
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

  return <SyncContext.Provider value={{ syncStates, startSync }}>{children}</SyncContext.Provider>;
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
