import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCard } from '../components/StatCard';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { BarChart } from '../components/charts/BarChart';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { api, type OverviewDashboard, type ActivityEntry, type QuickAction, type Favorite } from '../lib/api';

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function Overview() {
  const { folders, projects } = useOrg();
  const { refreshToken } = useFilters();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<OverviewDashboard | null>(null);
  const [resourceTrend, setResourceTrend] = useState<{ date: string; created: number; deleted: number }[]>([]);
  const [costByService, setCostByService] = useState<Record<string, number>>({});
  const [forecast, setForecast] = useState<number | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, resourcesDash, costAnalytics, costForecast, activityRes, quickActionsRes, favoritesRes] = await Promise.all([
        api.getOverviewDashboard(),
        api.getResourcesDashboard(),
        api.getCostAnalytics(),
        api.getCostForecast(),
        api.getRecentActivity(1, 8),
        api.getQuickActions(),
        api.getFavorites(),
      ]);
      setDashboard(dash);
      setResourceTrend(resourcesDash.trend30d);
      setCostByService(costAnalytics.byService);
      setForecast(costForecast.projectedTotal);
      setActivity(activityRes.items);
      setQuickActions(quickActionsRes.actions);
      setFavorites(favoritesRes.favorites);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

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

  return (
    <div>
      <FilterBar title="Overview" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      {dashboard?.executiveSummary && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-900 bg-brand-50 dark:bg-brand-950/30 px-4 py-3 mb-5 text-sm text-slate-700 dark:text-slate-200">
          <span className="text-[10px] uppercase tracking-wide text-brand-600 dark:text-brand-400 font-medium block mb-1">Executive Summary</span>
          {dashboard.executiveSummary}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="AWS Accounts" value={String(dashboard?.connections.total ?? 0)} caption={dashboard?.connections.error ? `${dashboard.connections.error} need attention` : undefined} />
        <StatCard label="Total Resources" value={(dashboard?.resources.total ?? 0).toLocaleString()} />
        <StatCard label="Cost (MTD)" value={money(dashboard?.cost.monthToDate ?? 0)} caption="real Cost Explorer spend" />
        <StatCard label="Forecasted Cost" value={forecast !== null ? money(forecast) : '—'} caption="linear projection" />
      </div>

      {quickActions.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(qa => (
              <button
                key={qa.key}
                onClick={() => navigate(qa.path)}
                title={qa.description}
                className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 lg:col-span-2">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Trend (30 days)</h3>
          {resourceTrend.length > 0
            ? <LineChart series={[{ label: 'Created', points: resourceTrend.map(d => ({ x: d.date, y: d.created })) }, { label: 'Deleted', points: resourceTrend.map(d => ({ x: d.date, y: d.deleted })) }]} />
            : <EmptyState icon="∿" title="No resource activity yet" description="Created and deleted resources will chart here once discovery has run a few times." />}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Resource Distribution</h3>
          <Donut data={Object.entries(dashboard?.resources.byCategory ?? {}).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value, colorCategory: label }))} centerLabel={{ value: String(dashboard?.resources.total ?? 0), caption: 'resources' }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Top Services by Cost</h3>
          {topServices.length > 0
            ? <BarChart data={topServices.map(([service, cost]) => ({ label: service, value: cost }))} valueFormatter={money} />
            : <EmptyState icon="$" title="No cost data yet" description="Connect a cloud account and run a sync to see spend broken down by service." />}
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Folders & Projects</h3>
          {folders.length === 0 && projects.length === 0 ? (
            <EmptyState icon="📁" title="No folders or projects yet" description="Set these up under Organization Management to group accounts by team or environment." />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {folders.map(f => (
                <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-200">📁 {f.name}</span>
                  <span className="text-xs text-slate-400">{projects.filter(p => p.folder_id === f.id).length} projects</span>
                </li>
              ))}
              {projects.filter(p => !p.folder_id).map(p => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{p.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Favorites</h3>
        {favorites.length === 0 ? (
          <EmptyState icon="☆" title="No favorites yet" description="Pin accounts, resources, or reports from other pages to find them here quickly." />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {favorites.map(f => (
              <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                <button onClick={() => navigate(f.path)} className="text-slate-700 dark:text-slate-200 hover:underline flex items-center gap-1.5">
                  <span className="text-xs text-slate-400">{f.type}</span> {f.label}
                </button>
                <button onClick={() => void removeFavorite(f.id)} className="text-xs text-slate-400 hover:text-red-500">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Recent Activity</h3>
        {activity.length === 0 ? (
          <EmptyState icon="▤" title="No activity yet" description="Actions across your organization — connecting accounts, running syncs, editing settings — will show up here." />
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
  );
}
