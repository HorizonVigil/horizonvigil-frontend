import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { api, ApiError, type CloudAccountService } from './api';

/**
 * A raw `fetch()` failure (a dropped connection, a Cloud Run cold-start
 * timeout, a momentary network blip) throws a plain TypeError — "Failed to
 * fetch" in Chrome — not an ApiError, and previously that one failure
 * aborted an entire multi-step discovery scan immediately, surfacing as a
 * scary persistent error banner even when the account itself is healthy
 * (confirmed live: a real account showed this banner with
 * cloud_connections.error_message still null, meaning the *previous* real
 * scan had succeeded fine — this was a transient hiccup on a later,
 * automatic 24h-sweep retry, not an actual account problem). Retries only
 * transient network failures with backoff, per the Cross-Phase Standards'
 * own "exponential backoff with jitter and bounded retries" rule — a real
 * ApiError (403, 500, ...) is a server-confirmed failure and retrying it
 * blindly wouldn't help, so those still fail immediately as before.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 800): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError) throw err;
      if (i === attempts - 1) break;
      await new Promise(r => setTimeout(r, baseDelayMs * 2 ** i + Math.random() * 250));
    }
  }
  throw lastErr;
}

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
  startSync: (connectionId: string, service?: CloudAccountService) => void;
  startDiscovery: (connectionId: string, service?: CloudAccountService) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

/**
 * Mounted once at the app root so a check/scan started from CloudAccounts.tsx
 * keeps running even if that component unmounts mid-request.
 *
 * `startSync` is the lightweight credentials check (`/test` — no live cloud
 * call). `startDiscovery` drives the real multi-step scan (steps -> run-step
 * ×N -> finalize), one request per step so each invocation fits Cloudflare's
 * free-tier CPU/subrequest budget. Both write into the same `syncStates[id]`
 * slot — they're mutually exclusive per connection, which `runningIds`
 * enforces. `service` defaults to 'awsAccounts' (every existing call site
 * predates GCP support and doesn't pass one) — aws-accounts-api and
 * gcp-accounts-api expose the identical steps/run-step/finalize contract, so
 * this loop is genuinely provider-agnostic, not duplicated per provider.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const runningIds = useRef<Set<string>>(new Set());

  const startSync = useCallback((connectionId: string, service: CloudAccountService = 'awsAccounts') => {
    if (runningIds.current.has(connectionId)) return;
    runningIds.current.add(connectionId);
    setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done: 0, total: 1, stepId: 'test' } }));

    (async () => {
      try {
        const result = await withRetry(() => api.testAccount(connectionId, service));
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

  const startDiscovery = useCallback((connectionId: string, service: CloudAccountService = 'awsAccounts') => {
    if (runningIds.current.has(connectionId)) return;
    runningIds.current.add(connectionId);
    setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done: 0, total: 1, stepId: 'Planning scan…' } }));

    (async () => {
      const runStartedAt = new Date().toISOString();
      const stepErrors: { message: string; severity: 'error' | 'info' }[] = [];
      try {
        const { steps } = await withRetry(() => api.getDiscoverySteps(connectionId, service));
        const total = steps.length || 1;
        for (let done = 0; done < steps.length; done++) {
          const stepId = steps[done];
          setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done, total, stepId } }));
          try {
            const result = await withRetry(() => api.runDiscoveryStep(connectionId, stepId, service));
            if (result.error) stepErrors.push({ message: `${stepId}: ${result.error}`, severity: result.errorSeverity ?? 'error' });
          } catch (err) {
            // Retries exhausted on a real network failure for this one step —
            // record it and move on to the next step rather than losing the
            // whole scan's progress over one bad step (Cross-Phase Standards'
            // "preserve partial results ... instead of reporting false
            // completeness" — the opposite, aborting outright, was the bug).
            stepErrors.push({ message: `${stepId}: ${(err as Error).message || 'Network error'}`, severity: 'error' });
          }
        }
        setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'running', done: steps.length, total, stepId: 'Finishing up…' } }));
        const summary = await withRetry(() => api.finalizeDiscovery(connectionId, runStartedAt, stepErrors, service, steps.length));
        // Recommendation generation and alert-rule evaluation used to fire
        // from here (client-side, best-effort) after every interactive
        // scan -- moved server-side into aws-accounts-api's runFinalize
        // (discovery.ts), which every scan path now funnels through
        // (interactive, daily sweep, abandoned-scan recovery), not just this
        // one. Calling them again here would just be a redundant, racy
        // duplicate of what the server already guarantees. See
        // cloudops-connector-aws/src/lib/postScanHooks.ts.
        const realErrors = stepErrors.filter(e => e.severity !== 'info');
        setSyncStates(prev => ({
          ...prev,
          [connectionId]: {
            status: realErrors.length > 0 ? 'error' : 'done', done: steps.length, total, stepId: '',
            error: realErrors.length > 0 ? `${realErrors.length} scan step${realErrors.length === 1 ? '' : 's'} failed: ${realErrors[0].message}` : undefined,
            warning: realErrors.length === 0 ? `Found ${summary.totalResources} resources${summary.deleted ? `, removed ${summary.deleted} no longer seen` : ''}.` : undefined,
          },
        }));
      } catch (err) {
        setSyncStates(prev => ({ ...prev, [connectionId]: { status: 'error', done: 0, total: 1, stepId: '', error: (err as Error).message || 'Discovery failed.' } }));
      } finally {
        runningIds.current.delete(connectionId);
      }
    })();
  }, []);

  /**
   * REMOVED 2026-09-09 (AWS connector audit AWS-P0-01, P0-A containment):
   * a 3-second post-login sweep plus a 24-hour interval that started real
   * provider discovery from the browser.
   *
   * It fetched every AWS/GCP/Azure connection, picked any whose last sync was
   * over 24h old, and called startDiscovery on each -- so simply logging in
   * could begin a 1,628-step scan. It did not filter to active connections,
   * and its only guard was an in-memory per-tab Set, so two tabs or two users
   * could start overlapping scans of the same account with no distributed
   * lock, no checkpoint, and no way to resume when a tab closed.
   *
   * Nothing replaces it on the client, and nothing needs to: scheduled
   * scanning is already server-owned and running -- `scheduled-scan-aws`
   * daily, `scheduled-first-scan-aws` every 20 minutes for new and abandoned
   * scans, plus the GCP equivalents. Staleness is the server's job.
   *
   * The state this drove (autoSyncStatus/autoSyncMessage/lastAutoSyncAt) was
   * never read outside this provider, so no UI regresses.
   *
   * Manual discovery (startDiscovery above) is still browser-orchestrated and
   * is deliberately left for Phase 3, which replaces it with a durable
   * server-owned job. The audit separates these: P0-A containment stops the
   * AUTOMATIC scans; server-owned workflows are P0-B.
   */

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