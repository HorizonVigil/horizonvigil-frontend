/**
 * Cloud Accounts — Changes tab (spec §38). Cloud-configuration change
 * timeline per environment: AWS CloudTrail management events, Azure Activity
 * Log, GCP Admin Activity audit logs — all normalized to one shape.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CardSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { Icon } from '../icons';
import { api, friendlyErrorMessage } from '../../lib/api';
import type { UnifiedAccountRow } from '../../lib/unifiedAccounts';
import { ProviderChips, type ProviderValue } from './ProviderChips';

interface Change { id: string; when: string | null; who: string; operation: string; status: string | null; resource: string | null; extra: string | null }

export function ChangesPanel({ rows }: { rows: UnifiedAccountRow[] }) {
  const [provider, setProvider] = useState<ProviderValue | null>(null);
  const [selected, setSelected] = useState<string>('');
  /**
   * AWS-P1-05: this panel is called Changes and was showing every
   * Describe, List and Get call the account made. Read traffic outnumbers
   * configuration changes by orders of magnitude, so the rows that matter
   * -- who changed what -- were buried in noise.
   *
   * Default is changes only; the reads are one toggle away rather than
   * deleted, because "who read this" is a legitimate audit question. It is
   * just not what a page called Changes should answer by default.
   */
  const [includeReadOnly, setIncludeReadOnly] = useState(false);

  const counts = useMemo(() => {
    const c: Partial<Record<ProviderValue, number>> = {};
    for (const r of rows) c[r.provider] = (c[r.provider] ?? 0) + 1;
    return c;
  }, [rows]);
  const visibleRows = useMemo(() => (provider ? rows.filter((r) => r.provider === provider) : rows), [rows, provider]);
  const row = useMemo(() => visibleRows.find((r) => r.id === selected), [visibleRows, selected]);

  useEffect(() => {
    if (visibleRows.length > 0 && !visibleRows.some((r) => r.id === selected)) setSelected(visibleRows[0].id);
  }, [visibleRows, selected]);

  const query = useQuery({
    queryKey: ['cloud-accounts', 'changes', selected, row?.provider, includeReadOnly],
    queryFn: async (): Promise<Change[]> => {
      if (!row) return [];
      if (row.provider === 'aws') {
        const r = await api.getAccountCloudTrailEvents(row.id, { includeReadOnly });
        return r.events.map((ev) => ({
          id: ev.eventId, when: ev.eventTime, who: ev.username ?? ev.userIdentityType ?? 'unknown',
          operation: ev.eventName, status: ev.errorCode ? 'error' : 'ok', resource: ev.resources.map((x) => x.resourceName).filter(Boolean)[0] ?? null,
          extra: `${ev.eventSource}${ev.awsRegion ? ` · ${ev.awsRegion}` : ''}${ev.errorCode ? ` · ${ev.errorCode}` : ''}`,
        }));
      }
      const r = await api.getProviderChanges(row.id, row.provider);
      return r.events.map((ev) => ({
        id: ev.id, when: ev.when, who: ev.who, operation: ev.operation, status: ev.status,
        resource: ev.resource, extra: [ev.resourceType, ev.level].filter(Boolean).join(' · ') || null,
      }));
    },
    enabled: !!row,
    staleTime: 60_000,
    retry: false,
  });

  if (rows.length === 0) {
    return <EmptyState icon="activity" title="No connected environments" description="Connect an account to see its configuration changes." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <ProviderChips value={provider} onChange={setProvider} counts={counts} />
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-slate-500 dark:text-slate-400">Environment</label>
        <select value={selected} onChange={(e) => setSelected(e.target.value)}
          className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5">
          {visibleRows.map((r) => <option key={r.id} value={r.id}>{r.provider.toUpperCase()} — {r.name}</option>)}
        </select>
        {row?.provider === 'aws' && (
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={includeReadOnly} onChange={(e) => setIncludeReadOnly(e.target.checked)} className="rounded border-slate-300 dark:border-slate-600" />
            Include read-only events
          </label>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {row?.provider === 'aws'
            ? (includeReadOnly ? 'CloudTrail events, including reads' : 'CloudTrail configuration changes')
            : row?.provider === 'azure' ? 'Activity Log (control plane)' : 'Admin Activity audit logs'} — last 30 days
        </span>
      </div>

      {query.isLoading ? <CardSkeleton lines={6} /> : query.isError ? (
        <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Couldn't load changes: {friendlyErrorMessage(query.error)} — audit-log read access may not be granted for this environment.
        </div>
      ) : (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="activity"
          title={includeReadOnly ? 'No recent activity' : 'No recent changes'}
          description={includeReadOnly
            ? 'No CloudTrail activity in the window.'
            : 'No configuration changes in the window. Read-only calls are hidden — tick "Include read-only events" to see them.'}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {query.data!.map((ev) => (
            <li key={ev.id} className="px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5 truncate">
                  {ev.status === 'error' && <Icon name="alert-triangle" size={12} className="text-red-500 shrink-0" />}
                  {ev.operation}
                </span>
                <span className="text-xs text-slate-400 shrink-0">{ev.when ? new Date(ev.when).toLocaleString() : '—'}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5 truncate">
                {ev.who}{ev.resource ? ` · ${ev.resource}` : ''}{ev.extra ? ` · ${ev.extra}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
