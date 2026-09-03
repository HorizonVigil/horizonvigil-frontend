/**
 * Cloud Accounts — Activity / Audit tab (spec §39). Every connection /
 * discovery / validation / bulk-operation event, newest first. AWS-scoped
 * today (connector-aws's `/activity`); Azure/GCP per-account activity is on
 * each account's own Activity tab.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '../DataTable';
import { TableSkeleton } from '../Skeleton';
import { api, friendlyErrorMessage, type ActivityEntry } from '../../lib/api';
import { formatActivityAction, formatDate } from '../../lib/format';

export function ActivityPanel({ refreshToken }: { refreshToken: number }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const query = useQuery({
    queryKey: ['cloud-accounts', 'activity', page, pageSize, refreshToken],
    queryFn: () => api.getAwsAccountsActivity({ page, limit: pageSize }),
    staleTime: 30_000,
  });

  const columns: Column<ActivityEntry>[] = [
    { key: 'action', header: 'Action', sticky: true, render: (r) => <span className="text-slate-700 dark:text-slate-200">{formatActivityAction(r.action)}</span> },
    { key: 'actor', header: 'Actor', render: (r) => <span className="text-slate-500 dark:text-slate-400">{r.actor?.email ?? 'system'}</span> },
    { key: 'target', header: 'Target', render: (r) => r.targetId
      ? <button onClick={() => navigate(`/cloud-accounts/${r.targetId}`)} className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline">{r.targetType ?? 'target'}</button>
      : <span className="text-slate-400">—</span> },
    { key: 'when', header: 'When', render: (r) => <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(r.occurredAt)}</span> },
  ];

  if (query.isLoading && !query.data) return <TableSkeleton rows={8} cols={4} />;
  if (query.isError) {
    return <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">Couldn't load activity: {friendlyErrorMessage(query.error)}</div>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-400">Connection, discovery, validation and bulk-operation events across AWS accounts. Azure and GCP activity is on each account's own Activity tab.</p>
      <DataTable
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(r) => r.id}
        emptyMessage="No activity recorded yet."
        server={{
          page, pageSize, total: query.data?.pagination.total ?? 0, loading: query.isFetching,
          onPageChange: setPage,
          onPageSizeChange: (n) => { setPageSize(n); setPage(1); },
        }}
      />
    </div>
  );
}
