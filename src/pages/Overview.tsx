import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { Donut } from '../components/charts/Donut';
import { LineChart } from '../components/charts/LineChart';
import { BarChart } from '../components/charts/BarChart';
import { Icon } from '../components/icons';
import { useOrg } from '../lib/orgContext';
import { useFilters, dateRangeToDays } from '../lib/filterContext';
import { useToast } from '../lib/toast';
import { api, friendlyErrorMessage, type OverviewDashboard, type ActivityEntry, type QuickAction, type Favorite } from '../lib/api';
import { money } from '../lib/format';

function daysAgoISO(days: number): string {
  return new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatActivityAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\./g, ' — ');
}

function formatActivityDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Unknown time'
    : date.toLocaleString();
}


// Health label/color tiers — extracted so the KPI card stays readable.
function healthTier(score: number): { label: string; className: string } {
  if (score >= 90) return { label: 'Excellent', className: 'text-emerald-600 dark:text-emerald-400 font-medium' };
  if (score >= 70) return { label: 'Needs attention', className: 'text-amber-600 dark:text-amber-400 font-medium' };
  if (score >= 40) return { label: 'Degraded', className: 'text-orange-600 dark:text-orange-400 font-medium' };
  return { label: 'Critical', className: 'text-red-600 dark:text-red-400 font-medium' };
}

// A widget that failed to load must never render identically to "genuinely
// empty" (the same EmptyState both cases used to share) -- a cost-fetch
// timeout and an account with zero spend look the same to a reader unless
// the failure says so explicitly.
function WidgetError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
      <Icon name="alert-triangle" size={13} className="shrink-0" />
      {message}
    </div>
  );
}

export function Overview() {
  const { folders, projects, currentOrg } = useOrg();
  const { region, dateRange, refreshToken } = useFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [dashboard, setDashboard] = useState<OverviewDashboard | null>(null);
  const [resourceTrend, setResourceTrend] = useState<{ date: string; created: number; deleted: number }[]>([]);
  const [trendDays, setTrendDays] = useState(30);
  const [costByService, setCostByService] = useState<Record<string, number>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  // Per-widget failure flags so a degraded widget can say so instead of
  // silently rendering an EmptyState that reads as "genuinely no data".
  const [widgetErrors, setWidgetErrors] = useState<{
    trend?: boolean; cost?: boolean; activity?: boolean; quickActions?: boolean; favorites?: boolean;
  }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); // re-fetch on top of already-visible data
  const [error, setError] = useState<string | null>(null);
  // Whether to show the skeleton (first load / retry after failure) or the
  // subtle refreshing bar (real data already on screen) has to survive
  // `load` being memoized -- a plain `!dashboard` read inside `load` closes
  // over whatever `dashboard` was bound to at the callback's last recreation
  // (whenever region/dateRange/toast last changed), not its current value,
  // since `dashboard` isn't a dependency of this callback. Concretely: after
  // the first successful load, `load` itself is NOT recreated (its deps
  // didn't change), so it keeps closing over the pre-load `null` -- every
  // later refresh (e.g. clicking Refresh, which only bumps `refreshToken`)
  // would still see `!dashboard` as true and wrongly re-show the skeleton
  // instead of the refreshing bar. A ref sidesteps this: `.current` is
  // always read fresh at call time, never captured by a stale closure.
  const hasLoadedOnce = useRef(false);
  const requestIdRef = useRef(0);
  const [removingFavoriteId, setRemovingFavoriteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!hasLoadedOnce.current) setLoading(true); else setRefreshing(true);
    setError(null);

    try {
      const days = dateRangeToDays(dateRange);
      const from = daysAgoISO(days);

      // allSettled, not all -- every backend service this page calls runs at
      // Cloud Run min-instances=0 (see the deploy config), so a cold start on
      // any single one of these calls used to blank the ENTIRE dashboard
      // behind one generic error. The primary dashboard call is still treated
      // as required -- there's no meaningful page without it -- but every
      // other widget is independent and should degrade on its own.
      const [dashRes, resourcesRes, costRes, activityRes, quickActionsRes, favoritesRes] = await Promise.allSettled([
        api.getOverviewDashboard({ region }),
        api.getResourcesDashboard({ region, days }),
        api.getCostAnalytics({ region, from }),
        api.getRecentActivity(1, 8, from),
        api.getQuickActions(),
        api.getFavorites(),
      ]);

      if (dashRes.status === 'rejected') throw dashRes.reason;
      if (requestId !== requestIdRef.current) return;

      setDashboard(dashRes.value);
      hasLoadedOnce.current = true;

      if (requestId !== requestIdRef.current) return;

      // Clear stale widget data up-front so a failed refetch never leaves old
      // numbers on screen masquerading as current ones.
      setWidgetErrors({
        trend: resourcesRes.status !== 'fulfilled',
        cost: costRes.status !== 'fulfilled',
        activity: activityRes.status !== 'fulfilled',
        quickActions: quickActionsRes.status !== 'fulfilled',
        favorites: favoritesRes.status !== 'fulfilled',
      });

      if (resourcesRes.status === 'fulfilled') {
        setResourceTrend(resourcesRes.value.trend30d ?? []);
        setTrendDays(resourcesRes.value.trendDays ?? days);
      } else {
        setResourceTrend([]);
        console.error('Resource trend widget failed to load:', resourcesRes.reason);
      }

      if (costRes.status === 'fulfilled') setCostByService(costRes.value.byService ?? {});
      else { setCostByService({}); console.error('Cost-by-service widget failed to load:', costRes.reason); }

      if (activityRes.status === 'fulfilled') setActivity(activityRes.value.items ?? []);
      else { setActivity([]); console.error('Recent activity widget failed to load:', activityRes.reason); }

      if (quickActionsRes.status === 'fulfilled') setQuickActions(quickActionsRes.value.actions ?? []);
      else { setQuickActions([]); console.error('Quick actions widget failed to load:', quickActionsRes.reason); }

      if (favoritesRes.status === 'fulfilled') setFavorites(favoritesRes.value.favorites ?? []);
      else { setFavorites([]); console.error('Favorites widget failed to load:', favoritesRes.reason); }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      const message = friendlyErrorMessage(
        err,
        'Failed to load the Overview dashboard.',
      );
      setError(message);
      toast(message, 'error');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [region, dateRange, toast]);

  // OrgProvider resolves the active org (and only then makes api.ts attach
  // the X-Org-Id header every one of these calls needs) asynchronously after
  // login -- without waiting for currentOrg, this fired before an org id
  // existed and every call 400'd with "Missing X-Org-Id header".
  useEffect(() => { if (currentOrg) void load(); }, [load, refreshToken, currentOrg]);

  // The Overview submenu links to sections within this same page rather than
  // separate routes, so scrolling has to happen client-side. Waits for
  // `loading` to clear since target sections don't exist in the DOM yet.
  useEffect(() => {
    if (loading || !location.hash) return;
    document.getElementById(location.hash.slice(1))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, loading]);

  async function removeFavorite(id: string) {
    if (removingFavoriteId) return;

    setRemovingFavoriteId(id);

    try {
      await api.removeFavorite(id);
      setFavorites(prev => prev.filter(f => f.id !== id));
    } catch (err) {
      toast(
        friendlyErrorMessage(err, 'Failed to remove favorite.'),
        'error',
      );
    } finally {
      setRemovingFavoriteId(null);
    }
  }

  const topServices = useMemo(
    () =>
      Object.entries(costByService)
        .filter(([, cost]) => Number.isFinite(cost) && cost >= 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6),
    [costByService],
  );

  const folderProjectCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const project of projects) {
      if (!project.folder_id) continue;
      counts.set(project.folder_id, (counts.get(project.folder_id) ?? 0) + 1);
    }

    return counts;
  }, [projects]);

  const unfiledProjects = useMemo(
    () => projects.filter(project => !project.folder_id),
    [projects],
  );

  const resourceDistribution = useMemo(
    () =>
      Object.entries(dashboard?.resources.byCategory ?? {})
        .filter(([, value]) => Number.isFinite(value) && value > 0)
        .map(([label, value]) => ({
          label,
          value,
          colorCategory: label,
        })),
    [dashboard?.resources.byCategory],
  );

  const totalResources = Math.max(0, dashboard?.resources.total ?? 0);
  const totalConnections = Math.max(0, dashboard?.connections.total ?? 0);
  const errorConnections = Math.max(0, dashboard?.connections.error ?? 0);
  const monthToDate = Math.max(0, dashboard?.cost.monthToDate ?? 0);
  // With zero connections there is nothing to score -- showing "100%" would
  // read as "everything is fine", so surface an explicit em-dash instead.
  const hasConnections = totalConnections > 0;
  const healthScore = hasConnections
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            ((totalConnections - Math.min(errorConnections, totalConnections)) /
              totalConnections) *
              100,
          ),
        ),
      )
    : null;

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

  // A failed first load has nothing real to show underneath it — a zeroed-out
  // dashboard would read as "nothing here yet" instead of "the request
  // failed", so this replaces the whole page.
  if (error && !dashboard) {
    return (
      <div>
        <FilterBar title="Overview" breadcrumb={<Breadcrumb />} showAccountFilter={false} />
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm">
          <Icon name="alert-triangle" size={16} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-800 dark:text-red-300 font-medium">Couldn't load the Overview dashboard</p>
            <p className="text-red-700 dark:text-red-400 text-xs mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            {refreshing ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <FilterBar title="Overview" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      {/* Subtle indicator while filter-driven refetches are in flight --
          content stays visible but users need to know it's updating. */}
      {refreshing && (
        <div role="status" aria-live="polite"
          className="h-0.5 mb-3 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" />
        </div>
      )}

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
      <div id="executive-dashboard" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 scroll-mt-4">
        <button type="button" onClick={() => navigate('/cloud-accounts')}
          aria-label={`${totalConnections} cloud accounts${errorConnections > 0 ? `, ${errorConnections} need attention` : ', all connected'}`}
          className="exec-kpi-card text-left w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="cloud" size={14} className="text-brand-500" />
            Cloud Accounts
          </span>
          <span className="exec-kpi-value">{totalConnections}</span>
          <span className="text-xs text-slate-400">
            {!hasConnections ? 'No accounts connected yet' : errorConnections > 0 ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">{errorConnections} need attention</span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">All connected</span>
            )}
          </span>
        </button>

        <button type="button" onClick={() => navigate('/resources')}
          aria-label={`${totalResources.toLocaleString()} total resources`}
          className="exec-kpi-card text-left w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="resources" size={14} className="text-brand-500" />
            Total Resources
          </span>
          <span className="exec-kpi-value">{totalResources.toLocaleString()}</span>
          <span className="text-xs text-slate-400">Across all accounts</span>
        </button>

        <button type="button" onClick={() => navigate('/cost-management')}
          aria-label={`Month-to-date spend ${money(monthToDate)}`}
          className="exec-kpi-card text-left w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="cost" size={14} className="text-brand-500" />
            Cost (MTD)
          </span>
          <span className="exec-kpi-value">{money(monthToDate)}</span>
          <span className="text-xs text-slate-400">
            {monthToDate === 0 && hasConnections ? 'No billable usage yet this month' : 'Month to date spend'}
          </span>
        </button>

        <button type="button" onClick={() => navigate('/cloud-accounts')}
          aria-label={healthScore === null ? 'Health score unavailable' : `Health score ${healthScore}%`}
          className="exec-kpi-card text-left w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-lg">
          <span className="exec-kpi-label flex items-center gap-1.5">
            <Icon name="gauge" size={14} className="text-brand-500" />
            Health Score
          </span>
          <span className="exec-kpi-value">{healthScore === null ? '—' : `${healthScore}%`}</span>
          <span className="text-xs text-slate-400">
            {healthScore === null
              ? 'Connect an account to measure'
              : (() => { const t = healthTier(healthScore); return <span className={t.className}>{t.label}</span>; })()}
          </span>
        </button>
      </div>

      {/* Quick Actions */}
      <div id="quick-actions" className="mb-5 scroll-mt-4">
        <h3 className="section-title mb-2 flex items-center gap-1.5">
          <Icon name="zap" size={14} className="text-slate-400" />
          Quick Actions
        </h3>
        {widgetErrors.quickActions ? (
          <WidgetError message="Quick actions couldn't be loaded right now." />
        ) : quickActions.length === 0 ? (
          <EmptyState icon="zap" title="No quick actions available" description="Shortcuts to common tasks will appear here." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {quickActions.map(qa => (
              <button type="button"
                key={qa.key}
                onClick={() => navigate(qa.path)}
                title={qa.description}
                aria-label={qa.label}
                className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-slate-700 dark:text-slate-200 hover:border-brand-400 dark:hover:border-brand-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {qa.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="chart-card lg:col-span-2">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Resource Trend ({trendDays} days)</h3>
            <span className="text-xs text-slate-400">
              {widgetErrors.trend ? 'Unavailable'
                : resourceTrend.reduce((sum, d) => sum + d.created + d.deleted, 0) <= 2
                  ? 'Limited history — little resource activity yet'
                  : 'Created vs Deleted'}
            </span>
          </div>
          {widgetErrors.trend ? (
            <WidgetError message="Resource trend couldn't be loaded. It will recover on your next visit." />
          ) : resourceTrend.length > 0 ? (
            <LineChart series={[
              { label: 'Created', points: resourceTrend.map(d => ({ x: d.date, y: d.created })) },
              { label: 'Deleted', points: resourceTrend.map(d => ({ x: d.date, y: d.deleted })) },
            ]} />
          ) : (
            <EmptyState icon="chart-line" title="No resource activity yet" description="Created and deleted resources will chart here once discovery has run a few times." />
          )}
        </div>

        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Resource Distribution</h3>
            <span className="text-xs text-slate-400">By category</span>
          </div>
          <Donut
            data={resourceDistribution}
            centerLabel={{ value: String(totalResources), caption: 'resources' }}
          />
        </div>
      </div>

      {/* Cost + Organization Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="chart-card">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Top Services by Cost</h3>
            <span className="text-xs text-slate-400">MTD</span>
          </div>
          {widgetErrors.cost ? (
            <WidgetError message="Cost breakdown couldn't be loaded." />
          ) : topServices.length > 0 ? (
            <BarChart data={topServices.map(([service, cost]) => ({ label: service, value: cost }))} valueFormatter={money} />
          ) : (
            <EmptyState icon="cost" title="No cost data yet" description="Connect a cloud account and run a sync to see spend broken down by service." />
          )}
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
                  <span className="text-xs text-slate-400">{`${folderProjectCounts.get(f.id) ?? 0} project${(folderProjectCounts.get(f.id) ?? 0) === 1 ? '' : 's'}`}</span>
                </li>
              ))}
              {unfiledProjects.map(p => (
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
        <div id="favorites" className="chart-card scroll-mt-4">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Favorites</h3>
            <span className="text-xs text-slate-400">Pinned resources</span>
          </div>
          {widgetErrors.favorites ? (
            <WidgetError message="Favorites couldn't be loaded." />
          ) : favorites.length === 0 ? (
            <EmptyState icon="star" title="No favorites yet" description="Pin accounts, resources, or reports from other pages to find them here quickly." />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {favorites.map(f => (
                <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                  <button type="button"
                    onClick={() => navigate(f.path)}
                    className="text-slate-700 dark:text-slate-200 hover:underline flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                  >
                    <Icon name="star-filled" size={14} className="text-amber-400" />
                    <span className="text-xs text-slate-400">{f.type}</span> {f.label}
                  </button>
                  <button type="button"
                    onClick={() => void removeFavorite(f.id)}
                    className="text-xs text-slate-400 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div id="activity-timeline" className="chart-card scroll-mt-4">
          <div className="chart-card-header">
            <h3 className="chart-card-title">Recent Activity</h3>
            <span className="text-xs text-slate-400">Audit trail</span>
          </div>
          {widgetErrors.activity ? (
            <WidgetError message="Recent activity couldn't be loaded." />
          ) : activity.length === 0 ? (
            <EmptyState icon="activity" title="No activity yet" description="Actions across your organization — connecting accounts, running syncs, editing settings — will show up here." />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {activity.map(entry => (
                <li key={entry.id} className="py-2 text-sm flex justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-200 min-w-0">
                    {formatActivityAction(entry.action)}{' '}
                    <span className="text-slate-400">by {entry.actor?.email ?? 'system'}</span>
                  </span>
                  <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">
                    {formatActivityDate(entry.occurredAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/organization" className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-2 inline-block">
            View full audit log →
          </Link>
        </div>
      </div>
    </div>
  );
}