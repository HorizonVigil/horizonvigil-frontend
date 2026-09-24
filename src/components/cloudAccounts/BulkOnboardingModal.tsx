import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { Modal } from '../Modal';
import { Icon } from '../icons';

import {
  api,
  friendlyErrorMessage,
} from '../../lib/api';

import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';

/**
 * Cloud Accounts — Bulk onboarding from an AWS Organization.
 *
 * Flow:
 *
 *   Pick management connection
 *          ↓
 *   Preview organization
 *          ↓
 *   Confirm import
 *          ↓
 *   Import connections
 *          ↓
 *   Poll imported connection status
 *          ↓
 *   Complete / partial completion / timeout
 *
 * Important:
 * - Preview must remain read-only.
 * - The actual import is performed by the backend.
 * - Cloud authorization remains backend-controlled.
 * - This component does not create or modify AWS resources itself.
 */

type Phase =
  | 'pick'
  | 'preview'
  | 'importing'
  | 'done';

type ImportProgress = {
  connected: number;
  syncing: number;
  pending: number;
  failed: number;
};

type Environment =
  | 'production'
  | 'staging'
  | 'dev'
  | 'sandbox'
  | 'qa'
  | 'security'
  | 'dr'
  | 'legacy';

interface BulkOnboardingModalProps {
  open: boolean;
  onClose: () => void;
  rows: UnifiedAccountRow[];
  onImported: () => void;
}

const ENVIRONMENTS: readonly Environment[] = [
  'production',
  'staging',
  'dev',
  'sandbox',
  'qa',
  'security',
  'dr',
  'legacy',
] as const;

const DEFAULT_ENVIRONMENT: Environment =
  'production';

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 20;

const EMPTY_PROGRESS: ImportProgress = {
  connected: 0,
  syncing: 0,
  pending: 0,
  failed: 0,
};

function normalizeText(
  value: unknown,
  fallback = '',
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  return normalized || fallback;
}

function normalizeId(
  value: unknown,
): string {
  return normalizeText(value);
}

function normalizeNonNegativeInteger(
  value: unknown,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor(value),
  );
}

function normalizeEnvironment(
  value: string,
): Environment {
  return ENVIRONMENTS.includes(
    value as Environment,
  )
    ? (value as Environment)
    : DEFAULT_ENVIRONMENT;
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isAbortError(
  error: unknown,
): boolean {
  return (
    error instanceof DOMException &&
    error.name === 'AbortError'
  );
}

function normalizeProgress(
  progress: ImportProgress,
): ImportProgress {
  return {
    connected:
      normalizeNonNegativeInteger(
        progress.connected,
      ),

    syncing:
      normalizeNonNegativeInteger(
        progress.syncing,
      ),

    pending:
      normalizeNonNegativeInteger(
        progress.pending,
      ),

    failed:
      normalizeNonNegativeInteger(
        progress.failed,
      ),
  };
}

function normalizeStatus(
  value: unknown,
): string {
  return normalizeText(value).toLowerCase();
}

function getConnectionStatusBucket(
  status: unknown,
): keyof ImportProgress {
  const normalized =
    normalizeStatus(status);

  if (normalized === 'connected') {
    return 'connected';
  }

  if (
    normalized === 'syncing' ||
    normalized === 'discovering' ||
    normalized === 'scanning' ||
    normalized === 'running'
  ) {
    return 'syncing';
  }

  if (
    normalized === 'error' ||
    normalized === 'failed' ||
    normalized === 'expired'
  ) {
    return 'failed';
  }

  return 'pending';
}

/**
 * Bulk AWS Organization onboarding modal.
 */
export function BulkOnboardingModal({
  open,
  onClose,
  rows,
  onImported,
}: BulkOnboardingModalProps) {
  const [phase, setPhase] =
    useState<Phase>('pick');

  const [managementId, setManagementId] =
    useState('');

  const [environment, setEnvironment] =
    useState<Environment>(
      DEFAULT_ENVIRONMENT,
    );

  const [error, setError] =
    useState<string | null>(null);

  const [preview, setPreview] =
    useState<
      Awaited<
        ReturnType<
          typeof api.getAwsBulkImportPreview
        >
      > | null
    >(null);

  const [result, setResult] =
    useState<
      Awaited<
        ReturnType<
          typeof api.bulkImportAwsFromOrg
        >
      > | null
    >(null);

  const [progress, setProgress] =
    useState<ImportProgress | null>(null);

  const [busy, setBusy] =
    useState(false);

  /*
   * Used to prevent stale async operations from updating state after:
   * - modal closes
   * - component unmounts
   * - a new onboarding run begins
   */
  const operationIdRef =
    useRef(0);

  const mountedRef =
    useRef(true);

  const awsRows = useMemo(() => {
    if (!Array.isArray(rows)) {
      return [];
    }

    return rows.filter(
      (row) =>
        row?.provider === 'aws' &&
        row?.connectionMethod ===
          'cross_account_role' &&
        Boolean(
          normalizeId(row?.id),
        ),
    );
  }, [rows]);

  const selectedManagementAccount =
    useMemo(
      () =>
        awsRows.find(
          (row) =>
            normalizeId(row?.id) ===
            managementId,
        ) ?? null,
      [awsRows, managementId],
    );

  /*
   * Component lifecycle tracking.
   */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      operationIdRef.current += 1;
    };
  }, []);

  /*
   * Reset the workflow whenever the modal opens.
   */
  useEffect(() => {
    if (!open) {
      /*
       * Invalidate any active async workflow.
       */
      operationIdRef.current += 1;
      return;
    }

    operationIdRef.current += 1;

    setPhase('pick');
    setError(null);
    setPreview(null);
    setResult(null);
    setProgress(null);
    setBusy(false);
    setEnvironment(
      DEFAULT_ENVIRONMENT,
    );
    setManagementId(
      normalizeId(awsRows[0]?.id),
    );
  }, [open, awsRows]);

  const isOperationCurrent =
    useCallback(
      (operationId: number): boolean =>
        mountedRef.current &&
        operationIdRef.current ===
          operationId,
      [],
    );

  const runPreview = useCallback(
    async () => {
      const id =
        normalizeId(managementId);

      if (!id || busy) {
        return;
      }

      const operationId =
        ++operationIdRef.current;

      setBusy(true);
      setError(null);

      try {
        const response =
          await api.getAwsBulkImportPreview(
            id,
          );

        if (
          !isOperationCurrent(
            operationId,
          )
        ) {
          return;
        }

        setPreview(response);
        setPhase('preview');
      } catch (err) {
        if (
          !isOperationCurrent(
            operationId,
          ) ||
          isAbortError(err)
        ) {
          return;
        }

        setError(
          friendlyErrorMessage(
            err,
            'Preview failed — verify that this connection is the AWS Organizations management account and that the required permissions are available.',
          ),
        );
      } finally {
        if (
          isOperationCurrent(
            operationId,
          )
        ) {
          setBusy(false);
        }
      }
    },
    [
      busy,
      isOperationCurrent,
      managementId,
    ],
  );

  const pollImportProgress =
    useCallback(
      async (
        connectionIds: string[],
        operationId: number,
      ): Promise<{
        progress: ImportProgress;
        completed: boolean;
      }> => {
        let latestProgress =
          normalizeProgress(
            EMPTY_PROGRESS,
          );

        for (
          let attempt = 0;
          attempt < MAX_POLL_ATTEMPTS;
          attempt += 1
        ) {
          if (
            !isOperationCurrent(
              operationId,
            )
          ) {
            return {
              progress: latestProgress,
              completed: false,
            };
          }

          if (attempt > 0) {
            await sleep(
              POLL_INTERVAL_MS,
            );

            if (
              !isOperationCurrent(
                operationId,
              )
            ) {
              return {
                progress:
                  latestProgress,
                completed: false,
              };
            }
          }

          const statuses =
            await Promise.allSettled(
              connectionIds.map(
                (connectionId) =>
                  api.getAccount(
                    connectionId,
                  ),
              ),
            );

          if (
            !isOperationCurrent(
              operationId,
            )
          ) {
            return {
              progress:
                latestProgress,
              completed: false,
            };
          }

          const counts: ImportProgress = {
            ...EMPTY_PROGRESS,
          };

          for (const statusResult of statuses) {
            if (
              statusResult.status !==
              'fulfilled'
            ) {
              /*
               * A status request failure is treated as failed for the
               * progress display, rather than silently pretending the
               * connection is still pending.
               */
              counts.failed += 1;
              continue;
            }

            const bucket =
              getConnectionStatusBucket(
                statusResult.value
                  ?.status,
              );

            counts[bucket] += 1;
          }

          latestProgress =
            normalizeProgress(
              counts,
            );

          setProgress(
            latestProgress,
          );

          const terminalCount =
            latestProgress.connected +
            latestProgress.failed;

          if (
            terminalCount >=
            connectionIds.length
          ) {
            return {
              progress:
                latestProgress,
              completed: true,
            };
          }
        }

        /*
         * Polling timed out. This is not necessarily an import failure.
         * Some connections may still be processing asynchronously.
         */
        return {
          progress:
            latestProgress,
          completed: false,
        };
      },
      [isOperationCurrent],
    );

  const runImport = useCallback(
    async () => {
      if (
        busy ||
        !preview ||
        preview.importable <= 0
      ) {
        return;
      }

      const normalizedManagementId =
        normalizeId(managementId);

      if (!normalizedManagementId) {
        setError(
          'Select a valid management account connection before importing.',
        );
        return;
      }

      const normalizedEnvironment =
        normalizeEnvironment(
          environment,
        );

      const operationId =
        ++operationIdRef.current;

      setBusy(true);
      setError(null);
      setProgress(null);
      setPhase('importing');

      try {
        const importResult =
          await api.bulkImportAwsFromOrg(
            {
              managementConnectionId:
                normalizedManagementId,
              environment:
                normalizedEnvironment,
            },
          );

        if (
          !isOperationCurrent(
            operationId,
          )
        ) {
          return;
        }

        setResult(importResult);

        const importedConnections =
          Array.isArray(
            importResult?.connections,
          )
            ? importResult.connections
            : [];

        const connectionIds =
          importedConnections
            .map((connection) =>
              normalizeId(
                connection?.id,
              ),
            )
            .filter(Boolean);

        if (connectionIds.length === 0) {
          /*
           * Import completed but the backend returned no connection IDs to
           * poll. We cannot claim live progress, so finish with the server's
           * import result.
           */
          if (
            isOperationCurrent(
              operationId,
            )
          ) {
            setProgress({
              ...EMPTY_PROGRESS,
              connected:
                normalizeNonNegativeInteger(
                  importResult?.imported,
                ),
            });

            onImported();
            setPhase('done');
          }

          return;
        }

        const pollingResult =
          await pollImportProgress(
            connectionIds,
            operationId,
          );

        if (
          !isOperationCurrent(
            operationId,
          )
        ) {
          return;
        }

        /*
         * Refresh the parent once the import itself has completed, regardless
         * of whether all asynchronous discovery/status polling has reached a
         * terminal state.
         */
        onImported();

        setProgress(
          pollingResult.progress,
        );

        setPhase('done');

        if (
          !pollingResult.completed &&
          pollingResult.progress.pending > 0
        ) {
          setError(
            'Import completed, but some connections are still processing. You can close this dialog and monitor their status from Cloud Accounts.',
          );
        }
      } catch (err) {
        if (
          !isOperationCurrent(
            operationId,
          ) ||
          isAbortError(err)
        ) {
          return;
        }

        setError(
          friendlyErrorMessage(
            err,
            'Bulk import failed.',
          ),
        );

        /*
         * The preview is still valid enough to let the user retry. The backend
         * should make the import operation idempotent so a retry cannot create
         * duplicate connections.
         */
        setPhase('preview');
      } finally {
        if (
          isOperationCurrent(
            operationId,
          )
        ) {
          setBusy(false);
        }
      }
    },
    [
      busy,
      environment,
      isOperationCurrent,
      managementId,
      onImported,
      pollImportProgress,
      preview,
    ],
  );

  const handleClose =
    useCallback(() => {
      /*
       * Invalidate active preview/import/polling operations before allowing
       * the modal to close.
       */
      operationIdRef.current += 1;

      setBusy(false);
      onClose();
    }, [onClose]);

  /*
   * No eligible AWS cross-account connection.
   */
  if (awsRows.length === 0) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Bulk onboard from AWS Organization"
        wide
      >
        <div className="flex flex-col gap-3 text-sm text-slate-500 dark:text-slate-400">
          <p>
            Bulk onboarding needs your AWS
            Organizations{' '}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">
              management account
            </strong>{' '}
            connected first using a
            cross-account role.
          </p>

          <p className="text-xs leading-5">
            Connect it via{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-200">
              + Connect Cloud → AWS →
              Cross-Account Role
            </strong>
            , deploy the
            HorizonVigilRead role StackSet
            across your Organization, and
            configure the required external ID
            and template from Settings.
          </p>
        </div>
      </Modal>
    );
  }

  const previewImportable =
    normalizeNonNegativeInteger(
      preview?.importable,
    );

  const previewActive =
    normalizeNonNegativeInteger(
      preview?.active,
    );

  const previewAlreadyConnected =
    normalizeNonNegativeInteger(
      preview?.alreadyConnected,
    );

  const previewOverLimit =
    normalizeNonNegativeInteger(
      preview?.overLimit,
    );

  const previewSample =
    Array.isArray(preview?.sample)
      ? preview.sample
      : [];

  const importedCount =
    normalizeNonNegativeInteger(
      result?.imported,
    );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Bulk onboard from AWS Organization"
      wide
    >
      <div
        className="flex flex-col gap-4"
        aria-busy={busy}
      >
        {/* PICK */}
        {phase === 'pick' && (
          <>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="bulk-management-account"
                className="text-sm text-slate-600 dark:text-slate-300"
              >
                Management account connection
              </label>

              <select
                id="bulk-management-account"
                value={managementId}
                onChange={(event) => {
                  setManagementId(
                    event.target.value,
                  );
                  setError(null);
                }}
                disabled={busy}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {awsRows.map((row) => {
                  const id =
                    normalizeId(row?.id);

                  const name =
                    normalizeText(
                      row?.name,
                      'Unnamed account',
                    );

                  const identifier =
                    normalizeText(
                      row?.identifier,
                    );

                  return (
                    <option
                      key={id}
                      value={id}
                    >
                      {name}
                      {identifier
                        ? ` (${identifier})`
                        : ''}
                    </option>
                  );
                })}
              </select>

              {selectedManagementAccount && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Selected:{' '}
                  {normalizeText(
                    selectedManagementAccount.name,
                    'Unnamed account',
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="bulk-environment"
                className="text-sm text-slate-600 dark:text-slate-300"
              >
                Environment for imported
                accounts
              </label>

              <select
                id="bulk-environment"
                value={environment}
                onChange={(event) => {
                  setEnvironment(
                    normalizeEnvironment(
                      event.target.value,
                    ),
                  );
                  setError(null);
                }}
                disabled={busy}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {ENVIRONMENTS.map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value}
                    </option>
                  ),
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                void runPreview()
              }
              disabled={
                busy ||
                !managementId
              }
              className="rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950"
            >
              {busy
                ? 'Checking…'
                : 'Preview accounts'}
            </button>
          </>
        )}

        {/* PREVIEW */}
        {phase === 'preview' &&
          preview && (
            <>
              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                aria-label="AWS Organization import preview"
              >
                <Stat
                  label="In Organization"
                  value={previewActive}
                />

                <Stat
                  label="Already connected"
                  value={
                    previewAlreadyConnected
                  }
                />

                <Stat
                  label="Will import"
                  value={
                    previewImportable
                  }
                  tone="brand"
                />
              </div>

              {previewOverLimit > 0 && (
                <div
                  role="status"
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400"
                >
                  {previewOverLimit.toLocaleString()}{' '}
                  account
                  {previewOverLimit === 1
                    ? ''
                    : 's'} exceed the
                  per-call import limit and
                  will not be imported in
                  this run.
                </div>
              )}

              {previewSample.length >
                0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Sample:
                  </span>{' '}
                  {previewSample
                    .map((sample) =>
                      normalizeText(
                        sample?.name,
                        'Unnamed account',
                      ),
                    )
                    .filter(Boolean)
                    .join(', ')}

                  {previewImportable >
                    previewSample.length && (
                    <span aria-hidden="true">
                      …
                    </span>
                  )}
                </div>
              )}

              {error && (
                <ErrorMessage
                  message={error}
                />
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setPhase('pick');
                    setError(null);
                  }}
                  disabled={busy}
                  className="flex-1 rounded-md border border-slate-200 py-2 text-sm text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-950"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void runImport()
                  }
                  disabled={
                    busy ||
                    previewImportable ===
                      0
                  }
                  className="flex-1 rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950"
                >
                  {busy
                    ? 'Importing…'
                    : `Import ${previewImportable.toLocaleString()} account${
                        previewImportable ===
                        1
                          ? ''
                          : 's'
                      }`}
                </button>
              </div>
            </>
          )}

        {/* IMPORTING / DONE */}
        {(phase === 'importing' ||
          phase === 'done') && (
          <div className="flex flex-col gap-4">
            {result && (
              <div
                role="status"
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-5 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200"
              >
                Created{' '}
                <strong>
                  {importedCount.toLocaleString()}
                </strong>{' '}
                connection
                {importedCount === 1
                  ? ''
                  : 's'}
                . Newly imported connections
                are available for status
                monitoring.
              </div>
            )}

            {progress && (
              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-4"
                aria-label="Import progress"
              >
                <Stat
                  label="Connected"
                  value={
                    progress.connected
                  }
                  tone="good"
                />

                <Stat
                  label="In progress"
                  value={
                    progress.pending
                  }
                />

                <Stat
                  label="Syncing"
                  value={
                    progress.syncing
                  }
                />

                <Stat
                  label="Failed"
                  value={
                    progress.failed
                  }
                  tone={
                    progress.failed > 0
                      ? 'bad'
                      : undefined
                  }
                />
              </div>
            )}

            {phase === 'importing' && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500"
              >
                <Icon
                  name="refresh-cw"
                  size={12}
                  className="animate-spin"
                  aria-hidden="true"
                />

                <span>
                  Checking imported connection
                  status…
                </span>
              </div>
            )}

            {error && (
              <ErrorMessage
                message={error}
              />
            )}

            {phase === 'done' && (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md bg-brand-600 py-2 text-sm font-medium text-white transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
              >
                Done
              </button>
            )}
          </div>
        )}

        {error &&
          phase !== 'preview' &&
          phase !== 'done' && (
            <ErrorMessage
              message={error}
            />
          )}
      </div>
    </Modal>
  );
}

interface StatProps {
  label: string;
  value: number;
  tone?: 'brand' | 'good' | 'bad';
}

function Stat({
  label,
  value,
  tone,
}: StatProps) {
  const normalizedValue =
    normalizeNonNegativeInteger(
      value,
    );

  const valueClass =
    tone === 'brand'
      ? 'text-brand-600 dark:text-brand-400'
      : tone === 'good'
        ? 'text-emerald-600 dark:text-emerald-400'
        : tone === 'bad'
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-800 dark:text-slate-100';

  return (
    <div className="rounded-lg border border-slate-200 bg-white py-2 text-center dark:border-slate-800 dark:bg-slate-900">
      <div
        className={`text-lg font-semibold tabular-nums ${valueClass}`}
      >
        {normalizedValue.toLocaleString()}
      </div>

      <div className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
    </div>
  );
}

function ErrorMessage({
  message,
}: {
  message: string;
}) {
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
    >
      {message}
    </p>
  );
}