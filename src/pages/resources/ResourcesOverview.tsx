import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FilterBar } from '../../components/FilterBar';
import { Breadcrumb } from '../../components/Breadcrumb';
import { useTheme } from '../../lib/theme';
import { categoryColor } from '../../components/charts/palette';
import { api, type ResourceCatalogEntry } from '../../lib/api';
import { CategoryIcon } from '../Resources';

const CATEGORIES = ['Compute', 'Storage', 'Database', 'Networking', 'Security', 'Containers', 'Analytics', 'Management', 'Others'];

/** Resources landing — category-first, like AWS Console's service picker,
 * rather than one flat table with dropdown filters. Drills into
 * ResourcesCategory (services within a category) then Resources.tsx itself
 * (a specific service's workspace). "View all resources" stays one click
 * away at /resources/all for when category-first isn't what you want. */
export function ResourcesOverview() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [catalog, setCatalog] = useState<ResourceCatalogEntry[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    void api.getResourceCatalog().then(r => setCatalog(r.items));
    void api.getResourceExplorer().then(r => setByCategory(Object.fromEntries(r.categories.map(c => [c.category, c.total]))));
  }, []);

  const categoryMeta = useMemo(() => {
    const byCat = new Map<string, { services: Set<string>; live: Set<string> }>();
    for (const c of CATEGORIES) byCat.set(c, { services: new Set(), live: new Set() });
    for (const entry of catalog) {
      const bucket = byCat.get(entry.category);
      if (!bucket) continue;
      bucket.services.add(entry.service);
      if (entry.scanner_status === 'live') bucket.live.add(entry.service);
    }
    return byCat;
  }, [catalog]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) navigate(`/resources/all?search=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div>
      <FilterBar title="Resources" breadcrumb={<Breadcrumb />} showAccountFilter={false} />

      <form onSubmit={submitSearch} className="mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search across every resource, in every category…"
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-slate-700 dark:text-slate-200"
        />
      </form>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">Browse by Category</h3>
        <Link to="/resources/all" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">View all resources, unfiltered →</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CATEGORIES.map(cat => {
          const meta = categoryMeta.get(cat)!;
          const color = categoryColor(cat, isDark);
          const count = byCategory[cat] ?? 0;
          return (
            <Link key={cat} to={`/resources/${cat}`} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-3 hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-sm transition">
              <span className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}1a` }}>
                <CategoryIcon category={cat} color={color} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 dark:text-slate-100">{cat}</div>
                <div className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {count.toLocaleString()} resource{count === 1 ? '' : 's'} · {meta.live.size} of {meta.services.size} services live
                </div>
              </div>
              <span className="text-slate-300 dark:text-slate-600">→</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
