/**
 * The dynamic Overview (issue: "Dynamic Role & Access-Based Overview
 * Dashboard").
 *
 * Not a fixed dashboard — it is *composed* for the current user:
 *
 *   identity (useAuth)
 *     → role + menu permissions (useOrg)
 *       → capabilities         (lib/overview/capabilities)
 *       → enabled modules      (lib/overview/modules)
 *       → effective scope      (lib/overview/scope)
 *     → eligible widgets       (lib/overview/registryMeta)
 *     → live risk signals      (lib/overview/contextSignals)
 *     → saved personalization  (lib/overview/preferences)
 *   → buildOverviewConfig()    (lib/overview/engine)  ← issue §14 object
 *   → this page renders KPI strip + <OverviewGrid>
 *
 * The five example personas in the issue (Executive, DevSecOps, FinOps, SRE,
 * SecOps) are just points in this space — nothing here is hard-coded to any
 * of them.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { EmptyState } from '../components/EmptyState';
import { StatCardSkeleton, CardSkeleton } from '../components/Skeleton';
import { Icon } from '../components/icons';
import { useAuth } from '../lib/auth';
import { useOrg } from '../lib/orgContext';
import { useFilters } from '../lib/filterContext';
import { deriveCapabilities } from '../lib/overview/capabilities';
import { getEnabledModules } from '../lib/overview/modules';
import { useEffectiveScope } from '../lib/overview/scope';
import { useContextSignals } from '../lib/overview/contextSignals';
import { useOverviewPreferences } from '../lib/overview/preferences';
import { buildOverviewConfig, getEligibleMeta, KPI_STRIP_LIMIT } from '../lib/overview/engine';
import type { Role } from '../lib/navConfig';
import type { WidgetLayoutRect, WidgetRenderContext } from '../lib/overview/types';
import { OverviewGrid } from '../components/overview/OverviewGrid';
import { WidgetErrorBoundary } from '../components/overview/WidgetFrame';
import { SignalCenter } from '../components/overview/SignalCenter';
import { AddWidgetsDrawer } from '../components/overview/AddWidgetsDrawer';
import { CustomizeBar } from '../components/overview/CustomizeBar';
import { WhyDrawer } from '../components/overview/WhyDrawer';
import { getWidgetComponent } from '../components/overview/registry';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Overview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg, menuPermissions, isLoading } = useOrg();
  const { connections, region, dateRange } = useFilters();

  const role = (currentOrg?.myRole as Role) ?? 'viewer';
  const capabilities = useMemo(() => deriveCapabilities(role, menuPermissions), [role, menuPermissions]);
  const enabledModules = useMemo(() => getEnabledModules(role, menuPermissions), [role, menuPermissions]);

  const userId = user?.id ?? 'anon';
  const {
    prefs, setLayout, toggleHidden, toggleFavorite, addWidget, setDefaults, dismissSignal, reset,
  } = useOverviewPreferences(userId);

  const scope = useEffectiveScope({ projectId: prefs.defaults.projectId, environment: prefs.defaults.environment });
  const { signals } = useContextSignals(scope, capabilities);

  const config = useMemo(
    () => buildOverviewConfig({ userId, role, capabilities, enabledModules, scope, preferences: prefs, signals }),
    [userId, role, capabilities, enabledModules, scope, prefs, signals],
  );

  const eligible = useMemo(
    () => getEligibleMeta({ capabilities, enabledModules, role }),
    [capabilities, enabledModules, role],
  );

  const ctx: WidgetRenderContext = useMemo(
    () => ({ scope, can: capabilities, dateRange, region, connections, navigate }),
    [scope, capabilities, dateRange, region, connections, navigate],
  );

  const [customizing, setCustomizing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  const favorites = useMemo(() => new Set(prefs.favorites), [prefs.favorites]);
  const shownIds = useMemo(
    () => new Set([...config.kpis, ...config.widgets].map((w) => w.meta.id)),
    [config.kpis, config.widgets],
  );

  const kpiStrip = config.kpis.slice(0, KPI_STRIP_LIMIT);

  function handleResize(id: string, cols: 1 | 2 | 3) {
    const current = config.widgets.find((w) => w.meta.id === id)?.layout ?? { x: 0, y: 0, w: cols * 4, h: 6 };
    const next: Record<string, WidgetLayoutRect> = { ...prefs.layout, [id]: { ...current, w: cols * 4 } };
    setLayout(next);
  }

  if (isLoading && !currentOrg) {
    return (
      <div>
        <FilterBar title="Overview" breadcrumb={<Breadcrumb />} showAccountFilter={false} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <CardSkeleton lines={5} /><CardSkeleton lines={5} /><CardSkeleton lines={5} />
        </div>
      </div>
    );
  }

  const nothingToShow = config.kpis.length === 0 && config.widgets.length === 0;

  return (
    <div>
      <FilterBar title="Overview" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {greeting()}{user?.user_metadata?.full_name ? `, ${String(user.user_metadata.full_name).split(' ')[0]}` : ''}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Here's what matters across the environments you can access, right now.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setWhyOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Icon name="info" size={13} /> Why this view?
          </button>
          <button type="button" onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Icon name="plus" size={13} /> Add widgets
          </button>
          <button type="button" onClick={() => setCustomizing((c) => !c)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-2.5 py-1.5 ${customizing ? 'bg-brand-600 text-white' : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <Icon name="sliders" size={13} /> {customizing ? 'Done' : 'Customize'}
          </button>
        </div>
      </div>

      <section
        aria-labelledby="intelligence-heading"
        className="relative mb-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 px-5 py-5 text-white shadow-sm sm:px-6"
      >
        <div className="absolute -right-20 -top-24 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-5 xl:grid-cols-[1.2fr_.8fr] xl:items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Horizon Intelligence
            </div>
            <h3 id="intelligence-heading" className="mt-2 text-xl font-semibold tracking-tight">
              Move from signals to decisions.
            </h3>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
              Review prioritized cost, security, and operations decisions with evidence, advisor guidance, ownership, and a durable outcome record.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/ai-copilot')}
                className="rounded-md bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-500"
              >
                Review decision queue
              </button>
              <button
                type="button"
                onClick={() => navigate('/ai-copilot?view=advisor')}
                className="rounded-md border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500"
              >
                Ask AI Advisor
              </button>
            </div>
          </div>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {[
              ['01', 'Explain'],
              ['02', 'Verify'],
              ['03', 'Advise'],
              ['04', 'Record'],
            ].map(([number, label]) => (
              <li key={label} className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
                <span className="text-[10px] font-semibold text-brand-400">{number}</span>
                <p className="mt-1 text-xs font-medium text-slate-200">{label}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {customizing && (
        <CustomizeBar scope={scope} defaults={prefs.defaults} onSetDefault={setDefaults} onReset={reset} onDone={() => setCustomizing(false)} />
      )}

      <SignalCenter signals={signals} dismissed={prefs.dismissedSignals} onDismiss={dismissSignal} onNavigate={navigate} />

      {nothingToShow ? (
        <EmptyState
          icon="grid"
          title="Your Overview is being set up"
          description="You don't have access to any modules yet. Ask an administrator to grant you a role or module permissions, and this page will fill in automatically."
        />
      ) : (
        <>
          {kpiStrip.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {kpiStrip.map((k) => {
                const Comp = getWidgetComponent(k.meta.id);
                return (
                  <WidgetErrorBoundary key={k.meta.id} title={k.meta.title}>
                    {Comp ? <Comp ctx={ctx} /> : null}
                  </WidgetErrorBoundary>
                );
              })}
            </div>
          )}

          <OverviewGrid
            config={config}
            ctx={ctx}
            customizing={customizing}
            favorites={favorites}
            onLayoutChange={setLayout}
            onToggleFavorite={toggleFavorite}
            onHide={(id) => toggleHidden(id, 'panel')}
            onResize={handleResize}
          />
        </>
      )}

      <AddWidgetsDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        eligible={eligible}
        shownIds={shownIds}
        onAdd={(id) => { addWidget(id); }}
      />
      <WhyDrawer open={whyOpen} onClose={() => setWhyOpen(false)} config={config} />
    </div>
  );
}
