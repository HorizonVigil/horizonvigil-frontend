import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { api, ApiError, type CloudAccountService } from './api';
import { useAuth } from './auth';
import { useOrg } from './orgContext';
import { fetchAllPages } from './fetchAllPages';

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
  const { isAuthenticated } = useAuth();
  // See the matching comment in filterContext.tsx -- OrgProvider resolves
  // the active org (and calls api.setCurrentOrgId(), which makes api.ts
  // attach X-Org-Id) asynchronously after login, so gating this on
  // isAuthenticated alone let the initial auto-sync sweep fire before an
  // org id existed, 400ing on every account fetch it made.
  const { currentOrg } = useOrg();
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const runningIds = useRef<Set<string>>(new Set());
  const [autoSyncStatus, setAutoSyncStatus] = useState<'idle' | 'checking' | 'syncing' | 'done' | 'error'>('idle');
  const [autoSyncMessage, setAutoSyncMessage] = useState<string>('');
  const [lastAutoSyncAt, setLastAutoSyncAt] = useState<string | null>(null);
  const autoSyncInitRef = useRef(false);
  const autoSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncingRef = useRef(false);

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

  // ── Auto-sync every 24 hours for all connected cloud accounts ──────────
  // Runs once on mount, then every 24 hours. For each connected AWS account
  // and GCP project, checks if it needs a sync (lastSync is null or older
  // than 24 hours) and triggers discovery for stale ones.
  const runAutoSync = useCallback(async () => {
    // SyncProvider is mounted at the app root, above the router -- including
    // the public marketing routes. Without this guard, every anonymous
    // visitor triggered these authenticated-only calls ~3s after page load.
    if (!isAuthenticated || !currentOrg) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setAutoSyncStatus('checking');
    setAutoSyncMessage('Checking for accounts that need syncing…');
    try {
      // Fetch every connected account (AWS + GCP + Azure), paginated to
      // completion via fetchAllPages -- a single limit:200 fetch used to
      // silently stop at the server's per-request cap, meaning any account
      // past #200 on one cloud was permanently excluded from auto-sync with
      // no error or indication anything was missing.
      const [awsRes, gcpRes, azureRes] = await Promise.allSettled([
        fetchAllPages((page, limit) => api.getAccounts({ page, limit })),
        fetchAllPages((page, limit) => api.getGcpAccounts({ page, limit })),
        fetchAllPages((page, limit) => api.getAzureAccounts({ page, limit })),
      ]);
      const accounts: { id: string; lastSync: string | null; provider: 'aws' | 'gcp' | 'azure'; name: string }[] = [];
      if (awsRes.status === 'fulfilled') {
        for (const a of awsRes.value) {
          accounts.push({ id: a.id, lastSync: a.last_sync_at, provider: 'aws', name: a.connection_name ?? a.aws_account_id });
        }
      }
      if (gcpRes.status === 'fulfilled') {
        for (const a of gcpRes.value) {
          accounts.push({ id: a.id, lastSync: a.last_sync_at, provider: 'gcp', name: a.connection_name ?? a.gcp_project_id });
        }
      }
      if (azureRes.status === 'fulfilled') {
        for (const a of azureRes.value) {
          accounts.push({ id: a.id, lastSync: a.last_sync_at, provider: 'azure', name: a.connection_name ?? a.azure_subscription_id });
        }
      }

      const now = Date.now();
      const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
      const staleAccounts = accounts.filter(a => {
        if (runningIds.current.has(a.id)) return false;
        if (!a.lastSync) return true; // Never synced
        return now - new Date(a.lastSync).getTime() >= STALE_THRESHOLD_MS;
      });

      if (staleAccounts.length === 0) {
        setAutoSyncStatus('done');
        setAutoSyncMessage(`All ${accounts.length} account${accounts.length === 1 ? '' : 's'} are up to date.`);
        setLastAutoSyncAt(new Date().toISOString());
        syncingRef.current = false;
        return;
      }

      setAutoSyncStatus('syncing');
      setAutoSyncMessage(`Auto-syncing ${staleAccounts.length} account${staleAccounts.length === 1 ? '' : 's'}: ${staleAccounts.map(a => a.name).join(', ')}`);
      setLastAutoSyncAt(new Date().toISOString());

      // Trigger discovery for each stale account sequentially (not all at once
      // to avoid overwhelming Cloudflare's free-tier CPU budget)
      let synced = 0;
      for (const account of staleAccounts) {
        try {
          startDiscovery(account.id, account.provider === 'gcp' ? 'gcpAccounts' : account.provider === 'azure' ? 'azureAccounts' : 'awsAccounts');
          synced++;
        } catch (err) {
          // Continue with other accounts even if one fails
        }
      }

      setAutoSyncStatus('done');
      setAutoSyncMessage(`Auto-sync triggered for ${synced} of ${staleAccounts.length} stale account${staleAccounts.length === 1 ? '' : 's'}. Resources will update as scans complete.`);
    } catch (err) {
      setAutoSyncStatus('error');
      setAutoSyncMessage(err instanceof Error ? err.message : 'Auto-sync failed.');
    } finally {
      syncingRef.current = false;
    }
  }, [startDiscovery, isAuthenticated, currentOrg]);

  // Initialize auto-sync once org context is actually ready, then schedule
  // every 24 hours -- gating the one-shot `autoSyncInitRef` guard on mount
  // alone (the original condition) let this fire and capture a `runAutoSync`
  // closure built from a still-null `currentOrg`; since the guard only ever
  // lets this body run once, that stale closure would silently no-op forever
  // rather than actually retrying once the org became ready a moment later.
  useEffect(() => {
    if (autoSyncInitRef.current) return;
    if (!isAuthenticated || !currentOrg) return;
    autoSyncInitRef.current = true;

    // Run once org context is ready (checks if any account needs syncing now)
    const initialDelay = setTimeout(() => {
      void runAutoSync();
    }, 3000); // Wait 3 seconds for the app to load

    // Schedule every 24 hours
    autoSyncTimerRef.current = setInterval(() => {
      void runAutoSync();
    }, 24 * 60 * 60 * 1000);

    return () => {
      clearTimeout(initialDelay);
      if (autoSyncTimerRef.current) clearInterval(autoSyncTimerRef.current);
    };
  }, [runAutoSync]);

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