/**
 * Per-account Health tab body (spec §37) — shared by the AWS / Azure / GCP
 * account-detail pages. Shows the explainable score + the five weighted
 * signals from the connector `GET /accounts/:id/health` endpoint.
 */
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../Badge';
import { CardSkeleton } from '../Skeleton';
import { Icon } from '../icons';
import { api, friendlyErrorMessage, type HealthSignalStatus } from '../../lib/api';
import { HEALTH_STATE_TONE, HEALTH_STATE_LABEL } from '../../lib/cloudAccounts/health';

const DOT: Record<HealthSignalStatus, string> = { ok: 'bg-emerald-500', warn: 'bg-amber-500', fail: 'bg-red-500', unknown: 'bg-slate-400' };

export function AccountHealthTab({ id, provider }: { id: string; provider: 'aws' | 'gcp' | 'azure' }) {
  const query = useQuery({
    queryKey: ['account-health', provider, id],
    queryFn: () => api.getAccountHealth(id, provider),
    staleTime: 60_000,
    retry: false,
  });

  if (query.isLoading) return <CardSkeleton lines={5} />;
  if (query.isError) {
    return <div className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">Couldn't load health: {friendlyErrorMessage(query.error)}</div>;
  }

  const h = query.data!;
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">{h.state === 'unknown' ? '—' : h.score}</div>
        <div>
          <Badge tone={HEALTH_STATE_TONE[h.state]}>{HEALTH_STATE_LABEL[h.state]}</Badge>
          <p className="text-xs text-slate-400 mt-1">Weighted roll-up of the five signals below.</p>
        </div>
      </div>
      <ul className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {h.signals.map((sig) => (
          <li key={sig.key} className="flex items-start gap-3 px-4 py-3">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 mt-1.5 ${DOT[sig.status]}`} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                {sig.label}
                <span className="text-[10px] uppercase tracking-wide text-slate-400">weight {sig.weight}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{sig.detail}</p>
            </div>
            {sig.status === 'fail' && <Icon name="alert-triangle" size={13} className="text-red-500 shrink-0 ml-auto mt-1" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
