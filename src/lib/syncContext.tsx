import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';

import {
  api,
  ApiError,
  type CloudAccountService,
} from './api';

const DEFAULT_SERVICE: CloudAccountService = 'awsAccounts';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1_000;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 800;
const RETRY_MAX_DELAY_MS = 8_000;
const RETRY_JITTER_MS = 250;

const TERMINAL_RUN_STATUSES = new Set([
  'SUCCEEDED',
  'PARTIALLY_SUCCEEDED',
  'FAILED',
  'CANCELED',
]);

type SyncStatus = 'running' | 'done' | 'error';

export interface SyncState {
  status: SyncStatus;
  done: number;
  total: number;
  stepId: string;
  error?: string;
  warning?: string;
}

interface SyncContextType {
  syncStates: Record<string, SyncState>;
  startSync: (
    connectionId: string,
    service?: CloudAccountService,
  ) => void;
  startDiscovery: (
    connectionId: string,
    service?: CloudAccountService,
  ) => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

function normalizeConnectionId(connectionId: string): string {
  const value = connectionId.trim();

  if (!value) {
    throw new Error('A connection ID is required.');
  }

  if (value.length > 256) {
    throw new Error('Invalid connection ID.');
  }

  return value;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.trim();

    if (message) {
      return message;
    }
  }

  return fallback;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return false;
  }

  if (error instanceof DOMException) {
    return error.name !== 'AbortError';
  }

  /*
   * Browser fetch/network failures normally arrive as TypeError.
   * Do not retry arbitrary Error instances because those may represent
   * programming/data-contract failures rather than transient networking.
   */
  return error instanceof TypeError;
}

function retryDelay(attempt: number): number {
  const exponential = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * 2 ** attempt,
  );

  return exponential + Math.random() * RETRY_JITTER_MS;
}

function sleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      new DOMException('Operation aborted.', 'AbortError'),
    );
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);

    const onAbort = () => {
      window.clearTimeout(timer);
      reject(
        new DOMException('Operation aborted.', 'AbortError'),
      );
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const attempts = Math.max(
    1,
    Math.min(options.attempts ?? MAX_RETRY_ATTEMPTS, MAX_RETRY_ATTEMPTS),
  );

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new DOMException(
        'Operation aborted.',
        'AbortError',
      );
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (
        !isRetryableError(error) ||
        attempt === attempts - 1
      ) {
        throw error;
      }

      await sleep(retryDelay(attempt), options.signal);
    }
  }

  throw lastError ?? new Error('Operation failed.');
}

function isTerminalStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

function isSuccessfulStatus(status: string): boolean {
  return status === 'SUCCEEDED';
}

export function SyncProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [syncStates, setSyncStates] = useState<
    Record<string, SyncState>
  >({});

  const runningIds = useRef<Set<string>>(new Set());

  /*
   * Every invocation receives a monotonically increasing token.
   * A stale async operation can therefore never overwrite the state
   * belonging to a newer operation.
   */
  const operationTokens = useRef<Map<string, number>>(new Map());
  const nextOperationToken = useRef(0);

  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const beginOperation = useCallback(
    (connectionId: string): number => {
      const token = ++nextOperationToken.current;

      operationTokens.current.set(
        connectionId,
        token,
      );

      runningIds.current.add(connectionId);

      return token;
    },
    [],
  );

  const isCurrentOperation = useCallback(
    (connectionId: string, token: number): boolean =>
      mountedRef.current &&
      operationTokens.current.get(connectionId) === token,
    [],
  );

  const endOperation = useCallback(
    (connectionId: string, token: number) => {
      if (
        operationTokens.current.get(connectionId) === token
      ) {
        operationTokens.current.delete(connectionId);
        runningIds.current.delete(connectionId);
      }
    },
    [],
  );

  const startSync = useCallback(
    (
      rawConnectionId: string,
      service: CloudAccountService = DEFAULT_SERVICE,
    ) => {
      const connectionId = normalizeConnectionId(rawConnectionId);

      if (runningIds.current.has(connectionId)) {
        return;
      }

      const token = beginOperation(connectionId);

      setSyncStates((previous) => ({
        ...previous,
        [connectionId]: {
          status: 'running',
          done: 0,
          total: 1,
          stepId: 'test',
        },
      }));

      void (async () => {
        try {
          const result = await withRetry(
            () => api.testAccount(connectionId, service),
          );

          if (!isCurrentOperation(connectionId, token)) {
            return;
          }

          const credentialsPresent =
            Boolean(result.credentialsPresent);

          setSyncStates((previous) => ({
            ...previous,
            [connectionId]: {
              status: credentialsPresent ? 'done' : 'error',
              done: credentialsPresent ? 1 : 0,
              total: 1,
              stepId: '',
              warning: credentialsPresent
                ? result.message || undefined
                : undefined,
              error: credentialsPresent
                ? undefined
                : result.message || 'Account test failed.',
            },
          }));
        } catch (error) {
          if (!isCurrentOperation(connectionId, token)) {
            return;
          }

          setSyncStates((previous) => ({
            ...previous,
            [connectionId]: {
              status: 'error',
              done: 0,
              total: 1,
              stepId: '',
              error: errorMessage(
                error,
                'Unable to test the cloud account.',
              ),
            },
          }));
        } finally {
          endOperation(connectionId, token);
        }
      })();
    },
    [
      beginOperation,
      endOperation,
      isCurrentOperation,
    ],
  );

  const startDiscovery = useCallback(
    (
      rawConnectionId: string,
      service: CloudAccountService = DEFAULT_SERVICE,
    ) => {
      const connectionId = normalizeConnectionId(rawConnectionId);

      if (runningIds.current.has(connectionId)) {
        return;
      }

      const token = beginOperation(connectionId);

      setSyncStates((previous) => ({
        ...previous,
        [connectionId]: {
          status: 'running',
          done: 0,
          total: 1,
          stepId: 'Queueing…',
        },
      }));

      void (async () => {
        const controller = new AbortController();

        const timeout = window.setTimeout(() => {
          controller.abort();
        }, MAX_POLL_DURATION_MS);

        try {
          const started = await withRetry(
            () =>
              api.startCollectionRun(
                connectionId,
                service,
              ),
            {
              signal: controller.signal,
            },
          );

          for (;;) {
            const run = await withRetry(
              () =>
                api.getCollectionRun(
                  started.id,
                  service,
                ),
              {
                signal: controller.signal,
              },
            );

            if (!isCurrentOperation(connectionId, token)) {
              return;
            }

            const terminal = isTerminalStatus(run.status);
            const successful = isSuccessfulStatus(run.status);

            const completedSteps = Number.isFinite(
              run.progress?.completedSteps,
            )
              ? Math.max(
                  0,
                  Math.trunc(
                    run.progress.completedSteps,
                  ),
                )
              : 0;

            const totalSteps = Number.isFinite(
              run.progress?.totalSteps,
            )
              ? Math.max(
                  completedSteps,
                  Math.trunc(run.progress.totalSteps),
                )
              : Math.max(completedSteps, 1);

            setSyncStates((previous) => ({
              ...previous,
              [connectionId]: {
                status: terminal
                  ? successful
                    ? 'done'
                    : 'error'
                  : 'running',
                done: completedSteps,
                total: totalSteps,
                stepId: terminal
                  ? ''
                  : run.explanation || 'Collecting…',
                error:
                  terminal && !successful
                    ? run.errorSummary ||
                      run.explanation ||
                      'Collection completed with errors.'
                    : undefined,
                warning:
                  terminal && successful
                    ? run.explanation || undefined
                    : undefined,
              },
            }));

            if (terminal) {
              return;
            }

            await sleep(
              POLL_INTERVAL_MS,
              controller.signal,
            );
          }
        } catch (error) {
          if (!isCurrentOperation(connectionId, token)) {
            return;
          }

          const aborted =
            error instanceof DOMException &&
            error.name === 'AbortError';

          setSyncStates((previous) => ({
            ...previous,
            [connectionId]: {
              status: 'error',
              done: 0,
              total: 1,
              stepId: '',
              error: aborted
                ? 'Collection status could not be confirmed within the allowed time. The server-owned run may still be processing.'
                : errorMessage(
                    error,
                    'Could not start or monitor collection.',
                  ),
            },
          }));
        } finally {
          window.clearTimeout(timeout);
          controller.abort();
          endOperation(connectionId, token);
        }
      })();
    },
    [
      beginOperation,
      endOperation,
      isCurrentOperation,
    ],
  );

  return (
    <SyncContext.Provider
      value={{
        syncStates,
        startSync,
        startDiscovery,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);

  if (!context) {
    throw new Error(
      'useSync must be used within SyncProvider.',
    );
  }

  return context;
}

export function useSyncCompletion(
  connectionIds: string[],
  onComplete: () => void,
) {
  const { syncStates } = useSync();

  const previousStatus =
    useRef<Record<string, SyncStatus | undefined>>({});

  const latest = useRef({
    connectionIds,
    onComplete,
  });

  /*
   * Written in an effect, not during render.
   *
   * This assignment used to sit in the render body. React may render a
   * component and then throw that render away (concurrent rendering, Strict
   * Mode's double invoke, a suspended tree), and a ref mutated during such a
   * render keeps the discarded values -- so the effect below could fire
   * `onComplete` from a render that was never committed. Committing the
   * update in its own effect ties it to a render that actually happened.
   *
   * Declared BEFORE the effect that reads it, so on any given commit the ref
   * is refreshed first.
   */
  useEffect(() => {
    latest.current = {
      connectionIds,
      onComplete,
    };
  }, [connectionIds, onComplete]);

  useEffect(() => {
    let transitioned = false;

    for (const rawId of latest.current.connectionIds) {
      const id = rawId.trim();

      if (!id) {
        continue;
      }

      const currentStatus = syncStates[id]?.status;
      const previous = previousStatus.current[id];

      if (
        previous === 'running' &&
        (currentStatus === 'done' ||
          currentStatus === 'error')
      ) {
        transitioned = true;
      }

      previousStatus.current[id] = currentStatus;
    }

    if (transitioned) {
      latest.current.onComplete();
    }
  }, [syncStates]);
}