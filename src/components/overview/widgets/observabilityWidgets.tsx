/**
 * Observability-category Overview widgets.
 *
 * Alerts + events are real. The golden signals (latency / traffic / errors /
 * saturation) and availability need a metrics/uptime source HorizonVigil
 * doesn't ingest yet — they render an honest pending state.
 */
import { api } from '../../../lib/api';
import { daysAgoISO, formatActivityAction, formatDate } from '../../../lib/format';
import { dateRangeToDays } from '../../../lib/filterContext';
import { scopedConnectionId, scopeMonitoringHealth } from '../../../lib/overview/scope';
import type { WidgetComponent } from '../../../lib/overview/types';
import { KpiValue, PendingBody, ViewAllLink, WidgetBody, useWidgetQuery } from './shared';

export const AlertsPanelWidget: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('alerts-panel', ctx, () => api.getActiveAlerts({ limit: 8, connection_id: scopedConnectionId(ctx.scope) }));
  return (
    <WidgetBody query={query} errorLabel="Alerts couldn't be loaded." emptyTitle="No alerts firing"
      emptyIcon="alerts" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {d.items.map((a) => (
              <li key={a.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="text-slate-600 dark:text-slate-300 truncate">{a.alert_name}</span>
                <span className={`shrink-0 font-medium ${a.severity === 'critical' ? 'text-red-600 dark:text-red-400' : a.severity === 'high' ? 'text-orange-600 dark:text-orange-400' : 'text-amber-600 dark:text-amber-400'}`}>{a.severity}</span>
              </li>
            ))}
          </ul>
          <ViewAllLink to="/alerts" label="Open Alerts" />
        </div>
      )}
    </WidgetBody>
  );
};

export const EventsWidget: WidgetComponent = ({ ctx }) => {
  const from = daysAgoISO(dateRangeToDays(ctx.dateRange));
  const query = useWidgetQuery('events', ctx, () => api.getRecentActivity(1, 8, from));
  return (
    <WidgetBody query={query} errorLabel="Events couldn't be loaded." emptyTitle="No events yet"
      emptyIcon="activity" isEmpty={(d) => d.items.length === 0}>
      {(d) => (
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {d.items.map((e) => (
            <li key={e.id} className="py-1.5 flex justify-between gap-2">
              <span className="text-slate-600 dark:text-slate-300 truncate">{formatActivityAction(e.action)}</span>
              <span className="text-slate-400 shrink-0">{formatDate(e.occurredAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
};

export const GoldenSignalsWidget: WidgetComponent = () => (
  <PendingBody icon="chart-line" note="Latency, traffic, errors and saturation need a metrics source (CloudWatch metric streams, Prometheus, OTel). Connect one to light this up."
    cta={{ label: 'Open Monitoring', to: '/monitoring?tab=Metrics' }} />
);
export const ErrorRateWidget: WidgetComponent = () => <PendingBody icon="chart-line" note="Error-rate series needs a metrics source." />;
export const LatencyWidget: WidgetComponent = () => <PendingBody icon="chart-line" note="Latency percentiles need a metrics source." />;
export const TrafficWidget: WidgetComponent = () => <PendingBody icon="chart-line" note="Traffic (RPS) needs a metrics source." />;
export const SaturationWidget: WidgetComponent = () => <PendingBody icon="cpu" note="Saturation needs a metrics source." />;

// ── KPIs ──────────────────────────────────────────────────────────────────

export const ServiceHealthKpi: WidgetComponent = ({ ctx }) => {
  const query = useWidgetQuery('kpi-service-health', ctx, async () => scopeMonitoringHealth(await api.getMonitoringHealth(), ctx.scope));
  const d = query.data;
  const healthy = d ? (d.overallByStatus?.healthy ?? d.overallByState?.OK ?? 0) : 0;
  const pct = d && d.total > 0 ? Math.round((healthy / d.total) * 100) : null;
  return <KpiValue label="Service Health" value={pct === null ? '—' : `${pct}%`} icon="gauge"
    tone={pct === null ? 'neutral' : pct >= 90 ? 'good' : pct >= 60 ? 'warning' : 'critical'}
    caption={d ? `${d.total} resources` : ''} onClick={() => ctx.navigate('/monitoring?tab=Health')} />;
};

export const AvailabilityKpi: WidgetComponent = ({ ctx }) => (
  <KpiValue label="Availability" value="—" icon="gauge" caption="needs uptime source" onClick={() => ctx.navigate('/monitoring')} />
);
export const ErrorRateKpi: WidgetComponent = ({ ctx }) => (
  <KpiValue label="Error Rate" value="—" icon="activity" caption="needs metrics source" onClick={() => ctx.navigate('/monitoring?tab=Metrics')} />
);
export const LatencyKpi: WidgetComponent = ({ ctx }) => (
  <KpiValue label="P95 / P99 Latency" value="—" icon="clock" caption="needs metrics source" onClick={() => ctx.navigate('/monitoring?tab=Metrics')} />
);
export const EventsPerMinKpi: WidgetComponent = ({ ctx }) => (
  <KpiValue label="Events / Minute" value="—" icon="activity" caption="needs events pipeline" onClick={() => ctx.navigate('/monitoring')} />
);
