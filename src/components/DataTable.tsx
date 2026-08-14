import { useMemo, useState } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  defaultHidden?: boolean;
  /** Keeps this column pinned to the left edge while the rest of a wide table scrolls horizontally — use on the one column (usually Name) a reader needs as a constant reference point. */
  sticky?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  pageSize?: number;
  /** Page sizes offered in the pager's selector. Defaults to [10, 20, 50, 100]. */
  pageSizeOptions?: number[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** Opt-in checkbox column + selection state, for bulk actions. Omit for every table that doesn't need it — this changes nothing for existing callers. */
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const header = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const lines = rows.map(row => columns.map(c => {
    const val = c.sortValue ? c.sortValue(row) : '';
    return `"${String(val).replace(/"/g, '""')}"`;
  }).join(','));
  return [header, ...lines].join('\n');
}

/** Page numbers with an ellipsis for anything beyond a small window around the current page — avoids rendering hundreds of page buttons for a large result set. */
function pageWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages = new Set([0, total - 1, current, current - 1, current + 1]);
  const sorted = [...pages].filter(p => p >= 0 && p < total).sort((a, b) => a - b);
  const out: (number | 'ellipsis')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('ellipsis');
    out.push(sorted[i]);
  }
  return out;
}

export function DataTable<T>({
  columns, rows, rowKey, pageSize: initialPageSize = 20, pageSizeOptions = [10, 20, 50, 100],
  onRowClick, emptyMessage = 'No results.', selectable = false, selectedKeys, onSelectionChange,
}: DataTableProps<T>) {
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(columns.filter(c => c.defaultHidden).map(c => c.key)));
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [query, setQuery] = useState('');

  const visibleColumns = columns.filter(c => !hiddenCols.has(c.key));
  // Reuses each column's existing sortValue as its searchable projection —
  // every column already worth sorting on (name, status, region, ...) is
  // exactly what a reader expects a search box to match against, so this
  // needs no separate per-page config. Columns without sortValue (e.g. an
  // actions column) are simply not searched.
  const searchableColumns = useMemo(() => columns.filter(c => c.sortValue), [columns]);

  const searchedRows = useMemo(() => {
    if (!query.trim() || searchableColumns.length === 0) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter(row => searchableColumns.some(c => String(c.sortValue!(row)).toLowerCase().includes(q)));
  }, [rows, query, searchableColumns]);

  const sortedRows = useMemo(() => {
    if (!sortKey) return searchedRows;
    const col = columns.find(c => c.key === sortKey);
    if (!col?.sortValue) return searchedRows;
    const copy = [...searchedRows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [searchedRows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  // Clamped rather than stored — if an upstream filter shrinks `rows` while
  // sitting on page 5, this snaps back to a real page instead of rendering
  // an empty table that looks broken.
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = sortedRows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const rangeStart = sortedRows.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min(sortedRows.length, (safePage + 1) * pageSize);

  const allOnPageSelected = selectable && pageRows.length > 0 && pageRows.every(r => selectedKeys?.has(rowKey(r)));

  function updateQuery(next: string) {
    setQuery(next);
    setPage(0);
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleRowSelection(key: string) {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys ?? []);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSelectionChange(next);
  }

  function togglePageSelection() {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys ?? []);
    if (allOnPageSelected) pageRows.forEach(r => next.delete(rowKey(r)));
    else pageRows.forEach(r => next.add(rowKey(r)));
    onSelectionChange(next);
  }

  function exportCsv() {
    const csv = toCsv(visibleColumns, sortedRows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'export.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{sortedRows.length.toLocaleString()} rows</span>
          {searchableColumns.length > 0 && (
            <input
              value={query}
              onChange={e => updateQuery(e.target.value)}
              placeholder="Search…"
              className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-200 w-40 focus:w-56 transition-[width]"
            />
          )}
        </div>
        <div className="flex items-center gap-2 relative">
          <button onClick={() => setShowColumnMenu(v => !v)} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Columns</button>
          <button onClick={exportCsv} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Export CSV</button>
          {showColumnMenu && (
            <div className="absolute right-0 top-8 z-10 w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-2 flex flex-col gap-1">
              {columns.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs px-1 py-0.5 text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={!hiddenCols.has(c.key)} onChange={() => setHiddenCols(prev => {
                    const next = new Set(prev);
                    if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
                    return next;
                  })} />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              {selectable && (
                <th className="w-8 px-3 py-2">
                  <input type="checkbox" checked={allOnPageSelected} onChange={togglePageSelection} aria-label="Select all rows on this page" />
                </th>
              )}
              {visibleColumns.map(c => (
                <th key={c.key} className={`text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2 whitespace-nowrap select-none ${c.sticky ? 'sticky left-0 z-10 bg-white dark:bg-slate-900' : ''}`}>
                  <button className="flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-100" onClick={() => c.sortValue && toggleSort(c.key)} disabled={!c.sortValue}>
                    {c.header}
                    {sortKey === c.key && <span>{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => {
              const key = rowKey(row);
              return (
                <tr key={key} className={`group border-b border-slate-100 dark:border-slate-800/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`} onClick={() => onRowClick?.(row)}>
                  {selectable && (
                    <td className="w-8 px-3 py-2" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedKeys?.has(key) ?? false} onChange={() => toggleRowSelection(key)} aria-label="Select row" />
                    </td>
                  )}
                  {visibleColumns.map(c => (
                    <td key={c.key} className={`px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200 ${c.sticky ? 'sticky left-0 z-[1] bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50' : ''}`}>{c.render(row)}</td>
                  ))}
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr><td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="px-3 py-8 text-center text-slate-400 dark:text-slate-500">{query.trim() && rows.length > 0 ? 'No rows match your search.' : emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {sortedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>Showing {rangeStart}–{rangeEnd} of {sortedRows.length.toLocaleString()}</span>
            <label className="flex items-center gap-1.5">
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-slate-600 dark:text-slate-300"
              >
                {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>/ page</span>
            </label>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={safePage === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Prev</button>
              {pageWindow(safePage, totalPages).map((p, i) =>
                p === 'ellipsis'
                  ? <span key={`e${i}`} className="px-1.5">…</span>
                  : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      aria-current={p === safePage ? 'page' : undefined}
                      className={`min-w-[26px] px-2 py-1 rounded-md border tabular-nums ${p === safePage ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      {p + 1}
                    </button>
                  )
              )}
              <button disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
