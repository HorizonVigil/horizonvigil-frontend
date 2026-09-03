/**
 * Cloud Accounts — Health tab (spec §8, §37). One row per connected
 * environment across AWS + Azure + GCP, each with an explainable score:
 * click a row to see the five weighted signals and exactly why it has that
 * state. Data from the connector `GET /health/detailed` endpoints.
 */
import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../Badge';
import { StatCard } from '../StatCard';
import { Icon } from '../icons';
import { TableSkeleton } from '../Skeleton';
import { EmptyState } from '../EmptyState';
import { api, friendlyErrorMessage, type CloudAccountHealthRow, type HealthSignalStatus } from '../../lib/api';
import { combineHealth, HEALTH_STATE_TONE, HEALTH_STATE_LABEL, healthTierClass } from '../../lib/cloudAccounts/health';

const SIGNAL_DOT: Record<HealthSignalStatus, string> = {
  ok: 'bg-emerald-500', warn: 'bg-amber-500', fail: 'bg-red-500', unknown: 'bg-slate-400',
};

export function HealthPanel({ refreshToken }: { refreshToken: number }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState<'' | 'aws' | 'azure' | 'gcp'>('');
  const [stateFilter, setStateFilter] = useState<'' | 'healthy' | 'warning' | 'critical' | 'unknown'>('');

  const query = useQuery({
    queryKey: ['cloud-accounts', 'health-detailed', refreshToken],
    queryFn: async () => {
      const [aws, azure, gcp] = await Promise.allSettled([
        api.getAwsHealthDetailed(), api.getAzureHealthDetailed(), api.getGcpHealthDetailed(),
      ]);
      const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
      const responses = [val(aws), val(azure), val(gcp)];
      const rows = responses.flatMap((r) => r?.accounts ?? []);
      return { responses, rows, combined: combineHealth(responses) };
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    let rows: CloudAccountHealthRow[] = query.data?.rows ?? [];
    if (providerFilter) rows = rows.filter((r) => r.provider === providerFilter);
    if (stateFilter) rows = rows.filter((r) => r.state === stateFilter);
    const rank = { critical: 0, warning: 1, unknown: 2, healthy: 3 };
    return [...rows].sort((a, b) => rank[a.state] - rank[b.state] || a.score - b.score);
  }, [query.data, providerFilter, stateFilter]);

  if (query.isLoading) return <TableSkeleton rows={6} cols={5} />;
  if (query.isError) {
    return (
      <div className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-300">
        Couldn't load account health: {friendlyErrorMessage(query.error)}
      </div>
    );
  }

  const combined = query.data!.combined;
  if (combined.total === 0) {
    return <EmptyState icon="gauge" title="No connected environments yet" description="Connect an AWS account, Azure subscription or GCP project to see its health here." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Overall Health" value={combined.healthPercent === null ? '—' : `${combined.healthPercent}%`}
          caption={combined.healthPercent === null ? 'Nothing rated yet' : `${combined.healthy}/${combined.total - combined.unknown} healthy`}
          icon="gauge" iconTone={combined.healthPercent !== null && combined.healthPercent >= 85 ? 'good' : combined.healthPercent !== null && combined.healthPercent >= 60 ? 'warning' : 'critical'} />
        <StatCard label="Healthy" value={String(combined.healthy)} icon="check-circle" iconTone="good" />
        <StatCard label="Warning" value={String(combined.warning)} icon="alert-triangle" iconTone={combined.warning > 0 ? 'warning' : 'neutral'} />
        <StatCard label="Critical" value={String(combined.critical)} icon="shield-alert" iconTone={combined.critical > 0 ? 'critical' : 'neutral'} />
        <StatCard label="Unknown" value={String(combined.unknown)} icon="help" iconTone="neutral" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {combined.perProvider.map((p) => (
          <button key={p.provider} type="button" onClick={() => setProviderFilter((f) => f === p.provider ? '' : p.provider)}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${providerFilter === p.provider ? 'border-brand-400 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <div className="text-xs uppercase tracking-wide text-slate-400">{p.provider}</div>
            <div className={`text-lg font-semibold tabular-nums ${healthTierClass(p.healthPercent)}`}>{p.healthPercent === null ? '—' : `${p.healthPercent}%`}</div>
            <div className="text-[11px] text-slate-400">{p.total} environment{p.total === 1 ? '' : 's'}</div>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {(['healthy', 'warning', 'critical', 'unknown'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStateFilter((f) => f === s ? '' : s)}
              className={`text-xs rounded-full px-2.5 py-1 border capitalize transition-colors ${stateFilter === s ? 'bg-brand-600 border-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
              <th className="px-3 py-2">Environment</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const open = expanded === row.connectionId;
              return (
                <Fragment key={row.connectionId}>
                  <tr className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setExpanded(open ? null : row.connectionId)}>
                    <td className="px-3 py-2">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/cloud-accounts/${row.connectionId}`); }} className="text-slate-700 dark:text-slate-200 hover:underline font-medium">{row.connectionName}</button>
                      <span className="text-xs text-slate-400 ml-1.5">{row.environment}</span>
                    </td>
                    <td className="px-3 py-2"><Badge tone="neutral">{row.provider.toUpperCase()}</Badge></td>
                    <td className="px-3 py-2 tabular-nums">{row.state === 'unknown' ? '—' : `${row.score}`}</td>
                    <td className="px-3 py-2"><Badge tone={HEALTH_STATE_TONE[row.state]}>{HEALTH_STATE_LABEL[row.state]}</Badge></td>
                    <td className="px-3 py-2 text-right text-slate-400"><Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} /></td>
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 bg-slate-50/60 dark:bg-slate-800/30">
                      <td colSpan={5} className="px-3 py-3">
                        <ul className="flex flex-col gap-1.5">
                          {row.signals.map((sig) => (
                            <li key={sig.key} className="flex items-start gap-2 text-xs">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${SIGNAL_DOT[sig.status]}`} />
                              <span className="font-medium text-slate-600 dark:text-slate-300 w-32 shrink-0">{sig.label}</span>
                              <span className="text-slate-500 dark:text-slate-400">{sig.detail}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No environments match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
