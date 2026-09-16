import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { DataTable, type Column } from '../DataTable';
import { TableSkeleton } from '../Skeleton';
import {
  api,
  friendlyErrorMessage,
  type ActivityEntry,
} from '../../lib/api';
import {
  formatActivityAction,
  formatDate,
} from '../../lib/format';
import { ProviderChips } from './ProviderChips';

interface ActivityPanelProps {
  refreshToken: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  maximum?: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  const normalized = Math.max(
    1,
    Math.floor(value),
  );

  return maximum !== undefined
    ? Math.min(maximum, normalized)
    : normalized;
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

function normalizeId(
  value: unknown,
): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function formatAction(
  action: unknown,
): string {
  try {
    return normalizeText(
      formatActivityAction(action as ActivityEntry['action']),
      'Unknown action',
    );
  } catch {
    return 'Unknown action';
  }
}

function formatOccurredAt(
  occurredAt: unknown,
): string {
  if (
    typeof occurredAt !== 'string' ||
    occurredAt.trim().length === 0
  ) {
    return 'Date unavailable';
  }

  const timestamp = Date.parse(occurredAt);

  if (!Number.isFinite(timestamp)) {
    return 'Date unavailable';
  }

  try {
    return formatDate(occurredAt);
  } catch {
    return 'Date unavailable';
  }
}

/**
 * Cloud Accounts — Activity / Audit panel.
 *
 * AWS-scoped activity is currently loaded from the AWS connector activity
 * endpoint. Azure/GCP activity remains available from each account's own
 * Activity tab according to the current application contract.
 *
 * This component is presentation/pagination logic only. Authorization and
 * tenant scoping remain enforced by the API/backend.
 */
export function ActivityPanel({
  refreshToken,
}: ActivityPanelProps) {
  const navigate = useNavigate();

  const [page, setPage] = useState(DEFAULT_PAGE);
  const [pageSize, setPageSize] =
    useState(DEFAULT_PAGE_SIZE);

  const normalizedPage = normalizePositiveInteger(
    page,
    DEFAULT_PAGE,
  );

  const normalizedPageSize =
    normalizePositiveInteger(
      pageSize,
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );

  const query = useQuery({
    queryKey: [
      'cloud-accounts',
      'activity',
      'aws',
      normalizedPage,
      normalizedPageSize,
      refreshToken,
    ],

    queryFn: () =>
      api.getAwsAccountsActivity({
        page: normalizedPage,
        limit: normalizedPageSize,
      }),

    staleTime: 30_000,

    /*
     * Activity is a read-only query. Retrying transient failures is generally
     * safe because it has no cloud-side mutation side effect.
     */
    retry: 2,

    /*
     * Keep the previous page visible while the next page is loading.
     * This avoids an unnecessary blank table during pagination.
     */
    placeholderData: (previousData) =>
      previousData,
  });

  const handleTargetClick = useCallback(
    (targetId: string) => {
      const normalizedId =
        normalizeId(targetId);

      if (!normalizedId) {
        return;
      }

      navigate(
        `/cloud-accounts/${encodeURIComponent(
          normalizedId,
        )}`,
      );
    },
    [navigate],
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      const normalizedNextPage =
        normalizePositiveInteger(
          nextPage,
          DEFAULT_PAGE,
        );

      if (
        normalizedNextPage === normalizedPage
      ) {
        return;
      }

      setPage(normalizedNextPage);
    },
    [normalizedPage],
  );

  const handlePageSizeChange = useCallback(
    (nextPageSize: number) => {
      const normalizedNextPageSize =
        normalizePositiveInteger(
          nextPageSize,
          DEFAULT_PAGE_SIZE,
          MAX_PAGE_SIZE,
        );

      if (
        normalizedNextPageSize ===
        normalizedPageSize
      ) {
        return;
      }

      /*
       * Changing page size invalidates the current page position.
       */
      setPageSize(normalizedNextPageSize);
      setPage(DEFAULT_PAGE);
    },
    [normalizedPageSize],
  );

  const columns = useMemo<
    Column<ActivityEntry>[]
  >(
    () => [
      {
        key: 'action',
        header: 'Action',
        sticky: true,
        render: (row) => (
          <span
            className="text-slate-700 dark:text-slate-200"
            title={formatAction(row?.action)}
          >
            {formatAction(row?.action)}
          </span>
        ),
      },

      {
        key: 'actor',
        header: 'Actor',
        render: (row) => {
          const email =
            typeof row?.actor?.email === 'string'
              ? row.actor.email.trim()
              : '';

          return (
            <span
              className="text-slate-500 dark:text-slate-400"
              title={email || 'system'}
            >
              {email || 'system'}
            </span>
          );
        },
      },

      {
        key: 'target',
        header: 'Target',
        render: (row) => {
          const targetId =
            normalizeId(row?.targetId);

          const targetType =
            normalizeText(
              row?.targetType,
              'Target',
            );

          if (!targetId) {
            return (
              <span className="text-slate-400 dark:text-slate-500">
                —
              </span>
            );
          }

          return (
            <button
              type="button"
              onClick={() =>
                handleTargetClick(targetId)
              }
              aria-label={`Open ${targetType} ${targetId}`}
              className="max-w-[14rem] truncate text-left text-xs font-mono text-brand-600 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 dark:text-brand-400 dark:focus-visible:ring-offset-slate-950"
              title={targetId}
            >
              {targetType}
            </button>
          );
        },
      },

      {
        key: 'when',
        header: 'When',
        render: (row) => {
          const occurredAt =
            typeof row?.occurredAt === 'string'
              ? row.occurredAt
              : '';

          const formatted =
            formatOccurredAt(occurredAt);

          const validTimestamp =
            occurredAt &&
            Number.isFinite(
              Date.parse(occurredAt),
            );

          return validTimestamp ? (
            <time
              dateTime={occurredAt}
              className="whitespace-nowrap text-xs text-slate-400 dark:text-slate-500"
              title={formatted}
            >
              {formatted}
            </time>
          ) : (
            <span className="whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
              {formatted}
            </span>
          );
        },
      },
    ],
    [handleTargetClick],
  );

  /*
   * Initial loading gets the skeleton.
   *
   * During pagination/refetch, existing data remains visible through
   * placeholderData and DataTable receives `loading`.
   */
  if (query.isPending && !query.data) {
    return (
      <div
        role="status"
        aria-label="Loading activity"
      >
        <TableSkeleton
          rows={8}
          cols={4}
        />
      </div>
    );
  }

  if (query.isError && !query.data) {
    return (
      <div
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300"
      >
        <p>
          Couldn&apos;t load activity:{' '}
          {friendlyErrorMessage(query.error)}
        </p>

        <button
          type="button"
          onClick={() => {
            void query.refetch();
          }}
          disabled={query.isFetching}
          className="mt-2 text-xs font-medium underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950"
        >
          {query.isFetching
            ? 'Retrying…'
            : 'Retry'}
        </button>
      </div>
    );
  }

  const items = Array.isArray(
    query.data?.items,
  )
    ? query.data.items
    : [];

  const total = normalizePositiveInteger(
    query.data?.pagination?.total,
    0,
  );

  return (
    <div
      className="flex flex-col gap-2"
      aria-busy={query.isFetching}
    >
      <ProviderChips
        lockedTo="aws"
        lockedReason="Per-account only — open the account's own Activity tab"
        className="mb-1"
      />

      <p className="text-xs leading-5 text-slate-400 dark:text-slate-500">
        Connection, discovery, validation and
        bulk-operation events across AWS accounts.
        Azure and GCP activity is available on each
        account&apos;s own Activity tab.
      </p>

      {query.isError && query.data && (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          The latest activity refresh failed. Showing
          the last successfully loaded results.
        </div>
      )}

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) =>
          normalizeId(row?.id) ||
          `${normalizeText(
            row?.occurredAt,
            'unknown-time',
          )}-${normalizeText(
            row?.action,
            'unknown-action',
          )}`
        }
        emptyMessage="No activity recorded yet."
        server={{
          page: normalizedPage,
          pageSize: normalizedPageSize,
          total,
          loading: query.isFetching,
          onPageChange: handlePageChange,
          onPageSizeChange:
            handlePageSizeChange,
        }}
      />
    </div>
  );
}