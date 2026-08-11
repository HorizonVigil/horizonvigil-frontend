import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { BarChart } from '../components/charts/BarChart';
import { Icon } from '../components/icons';
import { useOrg } from '../lib/orgContext';
import { useFilters, dateRangeToDays } from '../lib/filterContext';
import { api, type OverviewDashboard, type ActivityEntry, type QuickAction, type Favorite } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function Overview() {
  const { folders, projects } = useOrg();
  const { region, dateRange, refreshToken } = useFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const [dashboard, setDashboard] = useState<OverviewDashboard | null>(null);
  const [resourceTrend, setResourceTrend] = useState<{ date: string; created: number; deleted: number }[]>([]);
  const [trendDays, setTrendDays] = useState(30);
  const [costByService, setCostByService] = useState<Record<string, number>>({});
  const [forecast, setForecast] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const days = dateRangeToDays(dateRange);
      const from = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const [dash, resourcesDash, costAnalytics, costForecast, activityRes, quickActionsRes, favoritesRes] = await Promise.all([
        api.getOverviewDashboard({ region }),
        api.getResourcesDashboard({ region, days }),
        api.getCostAnalytics({ region, from }),
        api.getCostForecast({ region }),
        api.getRecentActivity(1, 8, from),
        api.getQuickActions(),
        api.getFavorites(),
      ]);
      setDashboard(dash);
      setResourceTrend(resourcesDash.trend30d);
      setTrendDays(resourcesDash.trendDays);
      setCostByService(costAnalytics.byService);
      setForecast(costForecast.projectedTotal);
      setActivity(activityRes.items);
      setQuickActions(quickActionsRes.actions);
      setFavorites(favoritesRes.favorites);
    } finally {
      setLoading(false);
    }
  }, [region, dateRange]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // The Overview submenu links to sections within this same page (Executive
  // Dashboard, Activity Timeline, Quick Actions, Favorites) rather than
  // separate routes, so scrolling has to happen client-side -- the browser's
  // native hash-scroll only fires on a real page load, not an SPA route
  // change. Waits for `loading` to clear since the target sections don't
  // exist in the DOM until the dashboard data has rendered.
  useEffect(() => {
    if (loading || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, loading]);

  async function removeFavorite(id: string) {
    await api.removeFavorite(id);
    setFavorites(prev => prev.filter(f => f.id !== id));
  }

  const topServices = Object.entries(costByService).sort(([, a], [, b]) => b - a).slice(0, 6);

  if (loading && !dashboard) {
    return (
      <div>
        <FilterBar title="Overview" breadcrumb={<Breadcrumb />} showAccountFilter={false} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={5} />
          <CardSkeleton lines={5} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={4} />
        </div>
      </div>
    );
  }

  const totalResources = dashboard?.resources.total ?? 0;
  const totalConnections = dashboard?.connections.total ?? 0;
  const errorConnections = dashboard?.connections.error ?? 0;
  const monthToDate = dashboard?.cost.monthToDate ?? 0;
  const healthScore = totalConnections > 0 ? Math.round(((totalConnections - errorConnections) / totalConnections) * 100) : 100;

  return (
    <div>
      <FilterBar title="Overview" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      {/* Executive Summary */}
      {dashboard?.executiveSummary && (
        <div className="ai-insight-panel mb-5">
          <span className="ai-insight-title">
            <Icon name="sparkles" size={14} />
            AI Executive Summary
          </span>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{dashboard.executiveSummary}</p>
        </div>
      )}

      {/* Executive KPI Row */}
      <div id="executive-dashboard" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <button type="button" onClick={() => navigate('/cloud-accounts')} className="exec-kpi-card text-left w-full cursor-pointer">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="cloud" size={14} className="text-brand-500" />
            Cloud Accounts
          </span>
          <span className="exec-kpi-value">{totalConnections}</span>
          <span className="text-xs text-slate-400">
            {errorConnections > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">{errorConnections} need attention</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">All connected</span>
            )}
          </span>
        </button>
        <button type="button" onClick={() => navigate('/resources')} className="exec-kpi-card text-left w-full cursor-pointer">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="resources" size={14} className="text-brand-500" />
            Total Resources
          </span>
          <span className="exec-kpi-value">{totalResources.toLocaleString()}</span>
          <span className="text-xs text-slate-400">Across all accounts</span>
        </button>
        <button type="button" onClick={() => navigate('/cost-management')} className="exec-kpi-card text-left w-full cursor-pointer">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="cost" size={14} className="text-brand-500" />
            Cost (MTD)
          </span>
          <span className="exec-kpi-value">{money(monthToDate)}</span>
          <span className="text-xs text-slate-400">
            {monthToDate === 0 && totalConnections > 0 ? 'No billable usage yet this month' : 'Month to date spend'}
          </span>
        </button>
        <button type="button" onClick={() => navigate('/cloud-accounts')} className="exec-kpi-card text-left w-full cursor-pointer">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="gauge" size={14} className="text-brand-500" />
            Health Score
          </span>
          <span className="exec-kpi-value">{healthScore}%</span>
          <span className="text-xs text-slate-400">
            {healthScore >= 90 ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Excellent</span>
            ) : healthScore >= 70 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">Needs attention</span>
            ) : healthScore >= 40 ? (
              <span className="text-orange-600 dark:text-orange-400 font-medium">Degraded</span>
            ) : (
              <span className="text-red-600 dark:text-red-400 font-medium">Critical</span>
            )}
          </span>
        </button>
      </div>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div id="quick-actions" className="mb-5">
          <h3 className="section-title mb-2 flex items-center gap-1.5">
            <Icon name="zap" size={14} className="text-slate-400" />
            Quick Actions
          </h3>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(qa => (
              <button
                key={qa.key}
                onClick={() => navigate(qa.path)}
                title={qa.description}
                className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="chart-card lg:col-span-2">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Resource Trend ({trendDays} days)</h3>
            <span className="text-xs text-slate-400">
              {resourceTrend.reduce((sum, d) => sum + d.created + d.deleted, 0) <= 2
                ? 'Limited history — this account has had little resource activity yet'
                : 'Created vs Deleted'}
            </span>
          </div>
          {resourceTrend.length > 0
            ? <LineChart series={[{ label: 'Created', points: resourceTrend.map(d => ({ x: d.date, y: d.created })) }, { label: 'Deleted', points: resourceTrend.map(d => ({ x: d.date, y: d.deleted })) }]} />
            : <EmptyState icon="chart-line" title="No resource activity yet" description="Created and deleted resources will chart here once discovery has run a few times." />}
        </div>
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Resource Distribution</h3>
            <span className="text-xs text-slate-400">By category</span>
          </div>
          <Donut data={Object.entries(dashboard?.resources.byCategory ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(totalResources), caption: 'resources' }} />
        </div>
      </div>

      {/* Cost + Organization Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Top Services by Cost</h3>
            <span className="text-xs text-slate-400">MTD</span>
          </div>
          {topServices.length > 0
            ? <BarChart data={topServices.map(([service, cost]) => ({ label: service, value: cost }))} valueFormatter={money} />
            : <EmptyState icon="cost" title="No cost data yet" description="Connect a cloud account and run a sync to see spend broken down by service." />}
        </div>
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Folders & Projects</h3>
            <span className="text-xs text-slate-400">Organization structure</span>
          </div>
          {folders.length === 0 && projects.length === 0 ? (
            <EmptyState icon="folder" title="No folders or projects yet" description="Set these up under Organization Management to group accounts by team or environment." />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {folders.map(f => (
                <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Icon name="folder" size={14} className="text-slate-400" />
                    {f.name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {(() => { const n = projects.filter(p => p.folder_id === f.id).length; return `${n} project${n === 1 ? '' : 's'}`; })()}
                  </span>
                </li>
              ))}
              {projects.filter(p => !p.folder_id).map(p => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {p.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Favorites + Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div id="favorites" className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Favorites</h3>
            <span className="text-xs text-slate-400">Pinned resources</span>
          </div>
          {favorites.length === 0 ? (
            <EmptyState icon="star" title="No favorites yet" description="Pin accounts, resources, or reports from other pages to find them here quickly." />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {favorites.map(f => (
                <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                  <button onClick={() => navigate(f.path)} className="text-slate-700 dark:text-slate-200 hover:underline flex items-center gap-1.5">
                    <Icon name="star-filled" size={14} className="text-amber-400" />
                    <span className="text-xs text-slate-400">{f.type}</span> {f.label}
                  </button>
                  <button onClick={() => void removeFavorite(f.id)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div id="activity-timeline" className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Recent Activity</h3>
            <span className="text-xs text-slate-400">Audit trail</span>
          </div>
          {activity.length === 0 ? (
            <EmptyState icon="activity" title="No activity yet" description="Actions across your organization — connecting accounts, running syncs, editing settings — will show up here." />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {activity.map(entry => (
                <li key={entry.id} className="py-2 text-sm flex justify-between">
                  <span className="text-slate-700 dark:text-slate-200">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')} <span className="text-slate-400">by {entry.actor?.email ?? 'system'}</span></span>
                  <span className="text-xs text-slate-400 shrink-0">{new Date(entry.occurredAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/organization" className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-2 inline-block">View full audit log →</Link>
        </div>
      </div>
    </div>
  );
}