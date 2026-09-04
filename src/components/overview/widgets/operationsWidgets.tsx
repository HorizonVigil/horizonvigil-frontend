/**
 * Operations-category Overview widgets — incidents, alerts, the unified
 * "recommended actions" list, automation runs, activity, favorites, quick
 * actions. Several are migrated verbatim from the old static Overview.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, friendlyErrorMessage } from '../../../lib/api';
import { daysAgoISO, formatActivityAction, formatDate, money } from '../../../lib/format';
import { dateRangeToDays } from '../../../lib/filterContext';
import { scopeQueryKey, type WidgetComponent } from '../../../lib/overview/types';
import { scopedConnectionId } from '../../../lib/overview/scope';
import { KpiValue, ViewAllLink, WidgetAction, WidgetBody, WidgetError, WidgetLoading, useWidgetQuery } from './shared';

export const QuickActionsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('quick-actions', ctx, () => api.getQuickActions());
  return (
    <WidgetBody query={query} errorLabel="Quick actions couldn't be loaded." emptyTitle="No quick actions"
      emptyIcon="zap" isEmpty={(d) => d.actions.length === 0}>
      {(d) => (
        <div className="flex flex-wrap gap-2">
          {d.actions.map((qa) => (
            <button type="button" key={qa.key} title={qa.description} onClick={() => ctx.navigate(qa.path)}
              className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              {qa.label}
            </button>
          ))}
        </div>
      )}
    </WidgetBody>
  );
};

export const ActiveIncidentsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('active-incidents', ctx, () =>
    api.getIncidents({ status: 'open', limit: 8, ...(scopedConnectionId(ctx.scope) ? { connectionId: scopedConnectionId(ctx.scope) } : {}) }));
  return (
    <WidgetBody query={query} errorLabel="Incidents couldn't be loaded." emptyTitle="No open incidents"
      emptyDescription="Nothing is on fire right now." emptyIcon="check-circle"
      isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {d.items.map((i) => (
              <li key={i.id} className="py-1.5 flex items-center justify-between gap-2">
                <button type="button" onClick={() => ctx.navigate(`/incidents/${i.id}`)}
                  className="text-left text-slate-600 dark:text-slate-300 hover:underline truncate">{i.title}</button>
                <span className={`shrink-0 font-medium ${i.severity === 'critical' ? 'text-red-600 dark:text-red-400' : i.severity === 'high' ? 'text-orange-600 dark:text-orange-400' : 'text-amber-600 dark:text-amber-400'}`}>{i.severity}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <ViewAllLink to="/incidents" label="Open Incidents" />
            <WidgetAction ctx={ctx} need="incident.manage" label="Triage" to="/incidents?tab=Open" />
          </div>
        </div>
      )}
    </WidgetBody>
  );
};

export const CriticalAlertsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('critical-alerts', ctx, () => api.getActiveAlerts({ severity: 'critical', limit: 8, connection_id: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Critical alerts couldn't be loaded." emptyTitle="No critical alerts"
      emptyIcon="check-circle" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((a) => (
            <li key={a.id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{a.alert_name}</span>
              <span className="text-slate-400 shrink-0">{formatDate(a.triggered_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const InvestigationsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('investigations', ctx, () => api.getIncidents({ status: 'investigating', limit: 8, connectionId: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Investigations couldn't be loaded." emptyTitle="No active investigations"
      emptyIcon="search" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((i) => (
            <li key={i.id} className="py-1.5">
              <button type="button" onClick={() => ctx.navigate(`/incidents/${i.id}`)}
                className="text-left text-slate-600 dark:text-slate-300 hover:underline truncate w-full">{i.incident_number} · {i.title}</button>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const AutomationActivityWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('automation-activity', ctx, () => api.getExecutionHistory({ limit: 8 }));
  return (
    <WidgetBody query={query} errorLabel="Automation activity couldn't be loaded." emptyTitle="No automation runs yet"
      emptyIcon="automation" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((e) => (
            <li key={e.id} className="py-1.5 flex items-center justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{e.automation_type.replace(/_/g, ' ')}</span>
              <span className={`shrink-0 font-medium ${e.status === 'failed' ? 'text-red-600 dark:text-red-400' : e.status === 'succeeded' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{e.status}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const RecentActivityWidget: WidgetComponent = ({ ctx }) => {
  const from = daysAgoISO(dateRangeToDays(ctx.dateRange));
  const query = useWidgetQuery('recent-activity', ctx, () => api.getRecentActivity(1, 8, from));
  return (
    <WidgetBody query={query} errorLabel="Recent activity couldn't be loaded." emptyTitle="No activity yet"
      emptyIcon="activity" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {d.items.map((e) => (
              <li key={e.id} className="py-2 flex justify-between gap-3">
                <span className="text-slate-700 dark:text-slate-200 min-w-0 truncate">
                  {formatActivityAction(e.action)} <span className="text-slate-400">by {e.actor?.email ?? 'system'}</span>
                </span>
                <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{formatDate(e.occurredAt)}</span>
              </li>
            ))}
          </ul>
          <ViewAllLink to="/organization" label="View full audit log" />
        </div>
      )}
    </WidgetBody>
  );
};

export const FavoritesWidget: WidgetComponent = ({ ctx }) => {
  const qc = useQueryClient();
  const query = useWidgetQuery('favorites', ctx, () => api.getFavorites());
  const remove = useMutation({
    mutationFn: (id: string) => api.removeFavorite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overview', 'favorites', scopeQueryKey(ctx.scope)] }),
  });
  return (
    <WidgetBody query={query} errorLabel="Favorites couldn't be loaded." emptyTitle="No favorites yet"
      emptyDescription="Pin accounts, resources or reports from other pages." emptyIcon="star"
      isEmpty={(d) => d.favorites.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-sm">
          {d.favorites.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <button type="button" onClick={() => ctx.navigate(f.path)}
                className="text-slate-700 dark:text-slate-200 hover:underline truncate flex items-center gap-1.5">
                <span className="text-xs text-slate-400">{f.type}</span> {f.label}
              </button>
              <button type="button" onClick={() => remove.mutate(f.id)} disabled={remove.isPending}
                className="text-xs text-slate-400 hover:text-red-500 shrink-0">Remove</button>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

/** Unified, cross-domain "what to do next" — mirrors the composition in pages/Issues.tsx. */
export const RecommendedActionsWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('recommended-actions', ctx, async () => {
    const [savings, findings, incidents] = await Promise.allSettled([
      ctx.can.has('cost.read') ? api.getSavingsOpportunities({ status: 'open', limit: 3, connectionId: scopedConnectionId(ctx.scope) }) : Promise.resolve(null),
      ctx.can.has('security.read') ? api.getFindings({ severity: 'critical', status: 'open', limit: 3, connection_id: scopedConnectionId(ctx.scope) }) : Promise.resolve(null),
      ctx.can.has('incident.read') ? api.getIncidents({ status: 'open', limit: 3, connectionId: scopedConnectionId(ctx.scope) }) : Promise.resolve(null),
    ]);
    const v = <T,>(r: PromiseSettledResult<T | null>) => (r.status === 'fulfilled' ? r.value : null);
    type Row = { key: string; label: string; sub: string; to: string; tone: 'critical' | 'warning' | 'good' };
    const rows: Row[] = [];
    for (const i of v(incidents)?.items ?? []) rows.push({ key: `i-${i.id}`, label: i.title, sub: `Incident · ${i.severity}`, to: `/incidents/${i.id}`, tone: 'critical' });
    for (const f of v(findings)?.items ?? []) rows.push({ key: `f-${f.id}`, label: f.title, sub: 'Critical finding', to: `/vulnerability-management/findings/${f.id}`, tone: 'critical' });
    for (const s of v(savings)?.items ?? []) rows.push({ key: `s-${s.id}`, label: s.issue, sub: `Save ${money(s.potential_monthly_savings)}/mo`, to: '/finops?section=Cost+Optimization', tone: 'good' });
    return rows;
  });

  if (query.isLoading) return <WidgetLoading />;
  if (query.isError || !query.data) return <WidgetError message={friendlyErrorMessage(query.error, "Recommendations couldn't be loaded.")} />;
  if (query.data.length === 0) {
    return <p className="text-xs text-slate-400 py-6 text-center">Nothing needs your attention right now.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
      {query.data.map((r) => (
        <li key={r.key} className="py-2">
          <button type="button" onClick={() => ctx.navigate(r.to)} className="text-left w-full">
            <div className="text-slate-700 dark:text-slate-200 truncate">{r.label}</div>
            <div className={`text-[11px] ${r.tone === 'critical' ? 'text-red-500 dark:text-red-400' : r.tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{r.sub}</div>
          </button>
        </li>
      ))}
    </ul>
  );
};

// ── KPIs ──────────────────────────────────────────────────────────────────

export const ActiveIncidentsKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-active-incidents', ctx, () => api.getIncidents({ status: 'open', limit: 1, connectionId: scopedConnectionId(ctx.scope) }));
  const n = query.data?.pagination.total ?? 0;
  return <KpiValue label="Active Incidents" value={query.data ? String(n) : '—'} icon="incidents"
    tone={n > 0 ? 'critical' : 'good'} caption={n > 0 ? 'open' : 'all clear'} onClick={() => ctx.navigate('/incidents')} />;
};

export const OpenInvestigationsKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-open-investigations', ctx, () => api.getIncidents({ status: 'investigating', limit: 1, connectionId: scopedConnectionId(ctx.scope) }));
  const n = query.data?.pagination.total ?? 0;
  return <KpiValue label="Open Investigations" value={query.data ? String(n) : '—'} icon="search"
    tone={n > 0 ? 'warning' : 'good'} onClick={() => ctx.navigate('/incidents?tab=Investigating')} />;
};

export const MttrKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-mttr', ctx, async () => {
    const { items } = await api.getIncidents({ status: 'resolved', limit: 50, connectionId: scopedConnectionId(ctx.scope) });
    const durations = items
      .filter((i) => i.resolved_at)
      .map((i) => new Date(i.resolved_at as string).getTime() - new Date(i.created_at).getTime())
      .filter((ms) => ms > 0);
    if (durations.length === 0) return null;
    return durations.reduce((s, d) => s + d, 0) / durations.length;
  });
  const ms = query.data;
  const label = ms == null ? '—' : ms < 3.6e6 ? `${Math.round(ms / 6e4)}m` : ms < 8.64e7 ? `${(ms / 3.6e6).toFixed(1)}h` : `${(ms / 8.64e7).toFixed(1)}d`;
  return <KpiValue label="MTTR" value={label} icon="clock" caption="mean time to resolve" onClick={() => ctx.navigate('/incidents?tab=Resolved')} />;
};

export const OpenIssuesKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-open-issues', ctx, async () => {
    const [recs, findings, alerts] = await Promise.allSettled([
      ctx.can.has('cost.read') ? api.getSavingsOpportunities({ status: 'open', limit: 1, connectionId: scopedConnectionId(ctx.scope) }) : Promise.resolve(null),
      ctx.can.has('security.read') ? api.getFindings({ status: 'open', limit: 1, connection_id: scopedConnectionId(ctx.scope) }) : Promise.resolve(null),
      ctx.can.has('observability.read') ? api.getActiveAlerts({ limit: 1, connection_id: scopedConnectionId(ctx.scope) }) : Promise.resolve(null),
    ]);
    const t = (r: PromiseSettledResult<{ pagination: { total: number } } | null>) => (r.status === 'fulfilled' && r.value ? r.value.pagination.total : 0);
    return t(recs) + t(findings) + t(alerts);
  });
  return <KpiValue label="Open Issues" value={query.data === undefined ? '—' : query.data.toLocaleString()} icon="issues"
    tone={query.data ? 'warning' : 'good'} onClick={() => ctx.navigate('/issues')} />;
};
