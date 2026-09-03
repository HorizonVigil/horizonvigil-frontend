/**
 * Cloud Accounts — Changes tab (spec §38). Cloud-configuration change
 * timeline. AWS is real (CloudTrail management events, per account). Azure
 * Activity Log and GCP Cloud Audit Logs are a backend follow-up.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { Icon } from '../icons';
import { api, friendlyErrorMessage } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';

export function ChangesPanel({ rows }: { rows: UnifiedAccountRow[] }) {
  const awsRows = useMemo(() => rows.filter((r) => r.provider === 'aws'), [rows]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!selected && awsRows.length > 0) setSelected(awsRows[0].id);
  }, [awsRows, selected]);

  const query = useQuery({
    queryKey: ['cloud-accounts', 'changes', selected],
    queryFn: () => api.getAccountCloudTrailEvents(selected),
    enabled: !!selected,
    staleTime: 60_000,
    retry: false,
  });

  if (rows.length === 0) {
    return <EmptyState icon="activity" title="No connected environments" description="Connect an account to see its configuration changes." />;
  }
  if (awsRows.length === 0) {
    return <EmptyState icon="activity" title="Change tracking is available for AWS today" description="Azure Activity Log and GCP Cloud Audit Log ingestion are a tracked follow-up. Per-account activity is on each account's Activity tab." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 dark:text-slate-400">AWS account</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}
          className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
          {awsRows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <span className="text-xs text-slate-400 ml-auto">CloudTrail management events — last 90 days</span>
      </div>

      {query.isLoading ? <CardSkeleton lines={6} /> : query.isError ? (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Couldn't load changes: {friendlyErrorMessage(query.error)} — CloudTrail read access may not be granted for this account.
        </div>
      ) : (query.data?.events.length ?? 0) === 0 ? (
        <EmptyState icon="activity" title="No recent changes" description="No CloudTrail management events in the window." />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {query.data!.events.map((ev) => (
            <li key={ev.eventId} className="px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  {ev.errorCode && <Icon name="alert-triangle" size={12} className="text-red-500" />}
                  {ev.eventName}
                </span>
                <span className="text-xs text-slate-400 shrink-0">{new Date(ev.eventTime).toLocaleString()}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {ev.eventSource} · {ev.username ?? ev.userIdentityType ?? 'unknown'} · {ev.awsRegion ?? '—'}
                {ev.errorCode && <span className="text-red-500"> · {ev.errorCode}</span>}
                {ev.resources.length > 0 && ` · ${ev.resources.map((r) => r.resourceName).filter(Boolean).slice(0, 2).join(', ')}`}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
