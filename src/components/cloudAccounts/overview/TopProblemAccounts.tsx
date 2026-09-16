import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { ProviderMark } from './ProviderMark';
import { SectionCard } from './primitives';

import {
  PROVIDER_LABEL,
  type ProblemAccount,
} from '../../../lib/cloudAccounts/overview';

interface TopProblemAccountsProps {
  rows: ProblemAccount[];
  onValidate?: (connectionId: string) => void;
}

interface NormalizedProblemAccount {
  connectionId: string;
  connectionName: string;
  issue: string;
  provider: ProblemAccount['provider'];
  originalIndex: number;
}

function normalizeText(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  return normalized || fallback;
}

function normalizeConnectionId(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

/**
 * Compact table of cloud accounts requiring attention.
 *
 * The component deliberately does not invent or infer account health.
 * `rows` are assumed to have already been filtered and authorized by the
 * domain/API layer.
 *
 * Important:
 * - Empty connection IDs are never used to construct account URLs.
 * - Empty IDs are never passed to `onValidate`.
 * - Provider identity is rendered through `ProviderMark`.
 * - Existing routes and callback contracts are preserved.
 */
export function TopProblemAccounts({
  rows,
  onValidate,
}: TopProblemAccountsProps) {
  const navigate = useNavigate();

  const normalizedRows = useMemo<NormalizedProblemAccount[]>(
    () => {
      if (!Array.isArray(rows)) {
        return [];
      }

      return rows
        .map((row, originalIndex) => ({
          connectionId: normalizeConnectionId(
            row?.connectionId,
          ),
          connectionName: normalizeText(
            row?.connectionName,
            'Unnamed environment',
          ),
          issue: normalizeText(
            row?.issue,
            'Issue details unavailable',
          ),
          provider: row?.provider,
          originalIndex,
        }))
        /*
         * A connection ID is required for a useful row action.
         * Do not render an account row that cannot safely link to an
         * identifiable connection.
         */
        .filter(
          (
            row,
          ): row is NormalizedProblemAccount =>
            Boolean(row.connectionId) &&
            Boolean(row.provider) &&
            Boolean(PROVIDER_LABEL[row.provider]),
        );
    },
    [rows],
  );

  const handleView = useCallback(
    (connectionId: string) => {
      const normalizedId =
        normalizeConnectionId(connectionId);

      if (!normalizedId) {
        return;
      }

      navigate(
        `/cloud-accounts/${encodeURIComponent(normalizedId)}`,
      );
    },
    [navigate],
  );

  const handleValidate = useCallback(
    (connectionId: string) => {
      const normalizedId =
        normalizeConnectionId(connectionId);

      if (!normalizedId || !onValidate) {
        return;
      }

      onValidate(normalizedId);
    },
    [onValidate],
  );

  /*
   * Preserve the existing "hide the whole section when there are no rows"
   * behavior. Invalid rows are also excluded from the rendered table because
   * they cannot support a safe account action.
   */
  if (normalizedRows.length === 0) {
    return null;
  }

  return (
    <SectionCard
      title="Top Accounts Requiring Attention"
      icon="alert-triangle"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <caption className="sr-only">
            Cloud environments currently requiring attention
          </caption>

          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <th
                scope="col"
                className="py-2 pr-3 font-medium"
              >
                Environment
              </th>

              <th
                scope="col"
                className="py-2 pr-3 font-medium"
              >
                Provider
              </th>

              <th
                scope="col"
                className="py-2 pr-3 font-medium"
              >
                Issue
              </th>

              <th
                scope="col"
                className="py-2 text-right font-medium"
              >
                Actions
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {normalizedRows.map((row) => {
              const providerLabel =
                PROVIDER_LABEL[row.provider];

              const rowKey = `${row.connectionId}-${row.originalIndex}`;

              return (
                <tr
                  key={rowKey}
                  className="align-middle"
                >
                  <td className="max-w-[14rem] py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleView(row.connectionId)
                      }
                      aria-label={`View ${row.connectionName}`}
                      className="block max-w-[14rem] truncate font-medium text-slate-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-slate-200 dark:focus-visible:ring-offset-slate-950"
                      title={row.connectionName}
                    >
                      {row.connectionName}
                    </button>
                  </td>

                  <td className="py-2.5 pr-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <ProviderMark
                        provider={row.provider}
                        size={15}
                        decorative
                      />

                      <span>{providerLabel}</span>
                    </span>
                  </td>

                  <td
                    className="max-w-[24rem] py-2.5 pr-3 text-xs text-slate-500 dark:text-slate-400"
                    title={row.issue}
                  >
                    <span className="block truncate">
                      {row.issue}
                    </span>
                  </td>

                  <td className="py-2.5 text-right">
                    <div className="inline-flex items-center justify-end gap-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          handleView(row.connectionId)
                        }
                        aria-label={`View ${row.connectionName}`}
                        className="text-xs font-medium text-brand-600 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-brand-400 dark:focus-visible:ring-offset-slate-950"
                      >
                        View
                      </button>

                      {onValidate && (
                        <button
                          type="button"
                          onClick={() =>
                            handleValidate(
                              row.connectionId,
                            )
                          }
                          aria-label={`Validate ${row.connectionName}`}
                          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-slate-400 dark:hover:text-slate-200 dark:focus-visible:ring-offset-slate-950"
                        >
                          Validate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}