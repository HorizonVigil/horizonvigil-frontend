/**
 * DevOps-category Overview widgets — deployments (real, from
 * monitoring-api's CloudFormation stack-event history) and CI metrics
 * (pending: no CI provider integration exists yet).
 */
import { BarChart } from '../../charts/BarChart';
import { api } from '../../../lib/api';
import { daysAgoISO } from '../../../lib/format';
import { dateRangeToDays } from '../../../lib/filterContext';
import { scopedConnectionId } from '../../../lib/overview/scope';
import type { WidgetComponent } from '../../../lib/overview/types';
import { KpiValue, PendingBody, ViewAllLink, WidgetBody, useWidgetQuery } from './shared';

const isFailed = (status: string) => /fail|rollback|delete_failed|cancel/i.test(status);
const isSuccess = (status: string) => /complete|succe|create_complete|update_complete/i.test(status);

function useDeployments(id: string, ctx: Parameters<WidgetComponent>[0]['ctx'], limit = 50) {
  const from = daysAgoISO(dateRangeToDays(ctx.dateRange));
  return useWidgetQuery(id, ctx, () =>
    api.getDeploymentEvents({ from, limit, ...(scopedConnectionId(ctx.scope) ? { connectionId: scopedConnectionId(ctx.scope) } : {}) }));
}

export const RecentDeploymentsWidget: WidgetComponent = ({ ctx }) => {
  const query = useDeployments('recent-deployments', ctx, 8);
  return (
    <WidgetBody query={query} errorLabel="Deployments couldn't be loaded." emptyTitle="No deployments recorded"
      emptyDescription="CloudFormation stack events appear here once a connected account has deployment history."
      emptyIcon="automation" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {d.items.map((e) => (
              <li key={e.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-300 truncate">{e.deployment_name}</span>
                <span className={`shrink-0 font-medium ${isFailed(e.status) ? 'text-red-600 dark:text-red-400' : isSuccess(e.status) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {e.status}
                </span>
              </li>
            ))}
          </ul>
          <ViewAllLink to="/monitoring?tab=Health" label="Open Monitoring" />
        </div>
      )}
    </WidgetBody>
  );
};

export const DeploymentFrequencyWidget: WidgetComponent = ({ ctx }) => {
  const query = useDeployments('deployment-frequency', ctx);
  return (
    <WidgetBody query={query} errorLabel="Deployment frequency couldn't be loaded." emptyTitle="No deployments in window"
      emptyIcon="chart-bar" isEmpty={(d) => d.items.length === 0}>
      {(d) => {
        const byDay: Record<string, number> = {};
        for (const e of d.items) {
          const day = e.occurred_at.slice(0, 10);
          byDay[day] = (byDay[day] ?? 0) + 1;
        }
        const rows = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-8);
        return <BarChart data={rows.map(([label, value]) => ({ label: label.slice(5), value }))} />;
      }}
    </WidgetBody>
  );
};

export const FailedDeploymentsWidget: WidgetComponent = ({ ctx }) => {
  const query = useDeployments('failed-deployments', ctx);
  return (
    <WidgetBody query={query} errorLabel="Failed deployments couldn't be loaded." emptyTitle="No failed deployments"
      emptyDescription="Every deployment in the window succeeded." emptyIcon="check-circle"
      isEmpty={(d) => d.items.filter((e) => isFailed(e.status)).length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.filter((e) => isFailed(e.status)).slice(0, 8).map((e) => (
            <li key={e.id} className="py-1.5">
              <div className="text-slate-600 dark:text-slate-300 truncate">{e.deployment_name}</div>
              {e.reason && <div className="text-[11px] text-red-500 dark:text-red-400 truncate">{e.reason}</div>}
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const ChangeFailureRateWidget: WidgetComponent = ({ ctx }) => {
  const query = useDeployments('change-failure-rate', ctx);
  return (
    <WidgetBody query={query} errorLabel="Change failure rate couldn't be loaded." emptyTitle="No deployments in window"
      emptyIcon="percent" isEmpty={(d) => d.items.length === 0}>
      {(d) => {
        const total = d.items.length;
        const failed = d.items.filter((e) => isFailed(e.status)).length;
        const pct = total > 0 ? Math.round((failed / total) * 100) : 0;
        return (
          <div className="flex flex-col gap-1">
            <div className={`text-4xl font-bold tabular-nums ${pct >= 30 ? 'text-red-600 dark:text-red-400' : pct >= 15 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{pct}%</div>
            <div className="text-xs text-slate-400">{failed} of {total} deployments failed</div>
          </div>
        );
      }}
    </WidgetBody>
  );
};

export const PipelineHealthWidget: WidgetComponent = () => (
  <PendingBody icon="git-branch" note="Connect a CI provider (GitHub Actions, GitLab CI, Jenkins) to see pipeline status here." />
);
export const BuildSuccessRateWidget: WidgetComponent = () => (
  <PendingBody icon="git-branch" note="Build success rate needs a connected CI provider." />
);
export const LeadTimeWidget: WidgetComponent = () => (
  <PendingBody icon="clock" note="Lead time for changes needs commit metadata linked to deployments." />
);

// ── KPIs ──────────────────────────────────────────────────────────────────

export const DeploymentsKpi: WidgetComponent = ({ ctx }) => {
  const query = useDeployments('kpi-deployments', ctx);
  return <KpiValue label="Deployments" value={query.data ? String(query.data.items.length) : '—'} icon="automation"
    caption="in window" onClick={() => ctx.navigate('/monitoring?tab=Health')} />;
};

export const RepositoriesKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-repositories', ctx, async () => {
    const { items } = await api.getGitInstallations();
    if (items.length === 0) return 0;
    const repoLists = await Promise.allSettled(items.map((i) => api.getInstallationRepos(i.id)));
    return repoLists.reduce((s, r) => s + (r.status === 'fulfilled' ? r.value.items.length : 0), 0);
  }, { retry: false });
  return <KpiValue label="Repositories" value={query.data === undefined ? '—' : String(query.data)} icon="git-branch"
    caption="connected" onClick={() => ctx.navigate('/code-security?tab=Repositories')} />;
};

export const PipelineSuccessKpi: WidgetComponent = ({ ctx }) => (
  <KpiValue label="Pipeline Success Rate" value="—" icon="git-branch" caption="connect a CI provider"
    onClick={() => ctx.navigate('/settings?tab=Git Integration')} />
);
