import type { ResourceFilters } from '../lib/useResourceFilters';

/** The search/category/region/status row for a Resources tab, paired with useResourceFilters -- see that hook's own doc comment for why this was extracted. */
export function ResourceFilterBar({ filters, totalCount }: { filters: ResourceFilters; totalCount: number }) {
  const { search, setSearch, category, setCategory, region, setRegion, status, setStatus, categories, regions, statuses, filtered, hasActiveFilters, clearFilters } = filters;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Search</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or type…" className="text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-700 dark:text-slate-200 w-52" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Category</span>
        <select value={category} onChange={e => setCategory(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${category ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Region</span>
        <select value={region} onChange={e => setRegion(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${region ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
          <option value="">All Regions</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400">Status</span>
        <select value={status} onChange={e => setStatus(e.target.value)} className={`text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 ${status ? 'border-brand-400 dark:border-brand-500 ring-1 ring-brand-200 dark:ring-brand-800' : 'border-slate-200 dark:border-slate-700'}`}>
          <option value="">All Statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      {hasActiveFilters && (
        <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:underline pb-2">Clear filters</button>
      )}
      <span className="text-xs text-slate-400 pb-2 ml-auto">{filtered.length.toLocaleString()} of {totalCount.toLocaleString()} loaded</span>
    </div>
  );
}
