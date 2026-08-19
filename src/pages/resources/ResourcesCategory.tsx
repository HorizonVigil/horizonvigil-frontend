import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { FilterBar } from '../../components/FilterBar';
import { WorkspaceBreadcrumb } from '../../components/WorkspaceBreadcrumb';
import { EmptyState } from '../../components/EmptyState';
import { useFilters } from '../../lib/filterContext';
import { useResourcesUrlFilters } from '../../lib/useResourcesUrlFilters';
import { api, type ResourceCatalogEntry } from '../../lib/api';
import { serviceLabel } from '../Resources';

/** Services within one category (e.g. Networking -> VPC, Route53, CloudFront, ELB)
 * — the middle level of the Resources drill-down. Every catalogued service shows,
 * live or not; only live ones are clickable into a workspace. */
export function ResourcesCategory() {
  const { category = '' } = useParams<{ category: string }>();
  const { account, region, connections, refreshToken } = useFilters();
  const navigate = useNavigate();
  const location = useLocation();
  useResourcesUrlFilters();
  // The catalog is a shared reference table across all three providers --
  // with no account selected there's no single provider to filter to, so
  // every catalogued service shows (mixed AWS+GCP+Azure). With one account
  // selected, its provider is known and the grid narrows to just that
  // cloud's services -- otherwise e.g. a GCP-filtered user sees a wall of
  // AWS tiles (all correctly empty, but indistinguishable from a real leak
  // without clicking through).
  const selectedProvider = account === 'all' ? undefined : connections.find(c => c.id === account)?.provider;
  const [catalog, setCatalog] = useState<ResourceCatalogEntry[]>([]);
  // getResourceExplorer() has no per-category variant, but it's a small,
  // cheap-to-fetch aggregate (every category + its services in one call) —
  // this is where the exact, org-wide per-service resource counts come from.
  const [byService, setByService] = useState<Record<string, number>>({});

  useEffect(() => {
    void api.getResourceCatalog({ category, provider: selectedProvider }).then(r => setCatalog(r.items));
  }, [category, selectedProvider]);

  useEffect(() => {
    void api.getResourceExplorer({ connectionId: account === 'all' ? undefined : account, region: region === 'all' ? undefined : region }).then(r => {
      const entry = r.categories.find(c => c.category === category);
      setByService(Object.fromEntries((entry?.services ?? []).map(s => [s.service, s.count])));
    });
  }, [category, account, region, refreshToken]);

  const services = useMemo(() => {
    const byServiceMeta = new Map<string, { live: boolean; typeCount: number }>();
    for (const entry of catalog) {
      const existing = byServiceMeta.get(entry.service);
      if (existing) {
        existing.live = existing.live || entry.scanner_status === 'live';
        existing.typeCount += 1;
      } else {
        byServiceMeta.set(entry.service, { live: entry.scanner_status === 'live', typeCount: 1 });
      }
    }
    return [...byServiceMeta.entries()]
      .map(([service, meta]) => ({ service, ...meta, count: byService[service] ?? 0 }))
      .sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || b.count - a.count || a.service.localeCompare(b.service));
  }, [catalog, byService]);

  return (
    <div>
      <FilterBar
        title={category}
        breadcrumb={<WorkspaceBreadcrumb items={[{ label: 'Resources', to: `/resources${location.search}` }, { label: category }]} />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {services.map(s => {
          const card = (
            <div className={`rounded-xl border p-4 flex items-center justify-between gap-2 transition ${s.live ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm' : 'border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/40'}`}>
              <div className="min-w-0">
                <div className={`font-medium truncate ${s.live ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>{serviceLabel(s.service, category)}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {s.live ? `${s.count.toLocaleString()} resource${s.count === 1 ? '' : 's'}` : `${s.typeCount} type${s.typeCount === 1 ? '' : 's'} catalogued`}
                </div>
              </div>
              {s.live ? <span className="text-slate-300 dark:text-slate-600 shrink-0">→</span> : <span className="shrink-0 text-[9px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">Soon</span>}
            </div>
          );
          return s.live ? (
            <Link key={s.service} to={{ pathname: `/resources/${category}/${s.service}`, search: location.search }}>{card}</Link>
          ) : (
            <div key={s.service} title="No live discovery scanner for this service yet" className="cursor-default">{card}</div>
          );
        })}
        {services.length === 0 && (
          <div className="col-span-full">
            {connections.length === 0 ? (
              <EmptyState
                icon="cloud"
                title={`No ${category} services yet`}
                description="Connect an AWS account, GCP project, or Azure subscription to start discovering resources — this list fills in automatically after your first sync."
                action={{ label: 'Connect a cloud account', onClick: () => navigate('/cloud-accounts?tab=Onboarding') }}
              />
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">No services catalogued under {category}.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
