import { useEffect, useMemo, useRef, useState } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  defaultHidden?: boolean;
  /** Keeps this column pinned to the left edge while the rest of a wide table scrolls horizontally — use on the one column (usually Name) a reader needs as a constant reference point. */
  sticky?: boolean;
}

/**
 * Opt-in server-driven mode: `rows` passed to DataTable is just the current
 * page (already filtered/sorted/paginated by the caller's own API call) —
 * DataTable renders it as-is instead of slicing its own copy of a big
 * client-side array. Every callback is how DataTable hands control back to
 * the page that owns the real fetch.
 *
 * `onSortChange`/`onSearchChange` are optional because not every backend
 * list endpoint accepts `sort`/`search` query params yet (see api.ts) — when
 * omitted, DataTable simply disables that affordance (no dead click that
 * silently no-ops, no search box that quietly only searches the current
 * page) rather than falling back to a client-side operation that would only
 * ever see the one page already in memory.
 */
export interface ServerMode {
  /** 1-indexed, matching api.ts's `page` query param. */
  page: number;
  pageSize: number;
  /** Total row count across every page, from the API response's `pagination.total`. */
  total: number;
  sortKey?: string | null;
  sortDir?: 'asc' | 'desc';
  search?: string;
  /** Shows a lightweight "Loading…" cue in the footer without blanking the table between page fetches. */
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void;
  onSearchChange?: (query: string) => void;
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
  /** See ServerMode's doc comment. Omit entirely for the original all-client behavior — every existing caller keeps working unchanged. */
  server?: ServerMode;
}

/**
 * A cell whose first character is =/+/-/@ (or a tab/CR, which Excel treats
 * the same way) is parsed as a formula by Excel/Sheets/Numbers on open, not
 * as literal text -- CSV injection, real code execution risk in the
 * opening app if the cell's content is attacker-influenceable (e.g. a
 * cloud resource name or tag another org member set). Prefixing with a
 * single quote forces spreadsheet apps to treat it as text; the quote
 * itself isn't rendered. Every value flowing into a CSV export in this app
 * should go through this, not just the tables that happen to render
 * user-supplied strings today -- what ends up in a given column changes
 * over time and this is cheap to apply everywhere.
 */
export function csvCellSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const header = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const lines = rows.map(row => columns.map(c => {
    const val = c.sortValue ? c.sortValue(row) : '';
    return `"${csvCellSafe(String(val)).replace(/"/g, '""')}"`;
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
  onRowClick, emptyMessage = 'No results.', selectable = false, selectedKeys, onSelectionChange, server,
}: DataTableProps<T>) {
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(columns.filter(c => c.defaultHidden).map(c => c.key)));
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [query, setQuery] = useState('');

  // Server mode's search box is debounced locally so every keystroke doesn't
  // fire a request — the parent only hears about it 350ms after typing stops.
  const [serverSearchText, setServerSearchText] = useState(server?.search ?? '');
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setServerSearchText(server?.search ?? ''); }, [server?.search]);
  useEffect(() => () => { if (searchDebounce.current) clearTimeout(searchDebounce.current); }, []);

  function handleServerSearchChange(next: string) {
    setServerSearchText(next);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => server?.onSearchChange?.(next), 350);
  }

  // Belt-and-suspenders beyond onChange/onInput: some automation/extension
  // tooling sets an <input>'s value via the DOM without dispatching any
  // event React's delegated listeners see at all (not even a raw 'input'
  // event) — in that specific case there's no event handler on earth that
  // fires, because none exists to catch. Polling the live DOM value directly
  // is the only thing that's correct regardless of how the value got there
  // (typing, paste, autofill, or scripted assignment).
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      const live = searchInputRef.current?.value;
      if (live === undefined) return;
      if (server) { if (live !== serverSearchText) handleServerSearchChange(live); }
      else if (live !== query) updateQuery(live);
    }, 400);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, serverSearchText, query]);

  const visibleColumns = columns.filter(c => !hiddenCols.has(c.key));
  // Reuses each column's existing sortValue as its searchable projection —
  // every column already worth sorting on (name, status, region, ...) is
  // exactly what a reader expects a search box to match against, so this
  // needs no separate per-page config. Columns without sortValue (e.g. an
  // actions column) are simply not searched.
  const searchableColumns = useMemo(() => columns.filter(c => c.sortValue), [columns]);
  const showSearchBox = searchableColumns.length > 0 && (!server || !!server.onSearchChange);

  // In server mode `rows` is already the current page, pre-filtered and
  // pre-sorted server-side — `query`/`sortKey` stay at their initial no-op
  // values below (nothing here ever calls their setters in server mode), so
  // this pipeline is a harmless passthrough rather than a second, wrong
  // client-side filter/sort layered on top of the server's.
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

  const totalCount = server ? server.total : sortedRows.length;
  const effectivePageSize = server ? server.pageSize : pageSize;
  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(effectivePageSize, 1)));
  // Clamped rather than stored — if an upstream filter shrinks `rows` while
  // sitting on page 5, this snaps back to a real page instead of rendering
  // an empty table that looks broken. 0-indexed internally either way; server
  // mode's `page` is 1-indexed (matching api.ts), converted at this boundary.
  const safePage = server ? Math.min(server.page - 1, totalPages - 1) : Math.min(page, totalPages - 1);
  const rangeStart = totalCount === 0 ? 0 : safePage * effectivePageSize + 1;
  const rangeEnd = Math.min(totalCount, (safePage + 1) * effectivePageSize);
  // Server mode's `rows` is already just the current page from the API;
  // client mode has the full filtered/sorted set in memory and must slice
  // it itself here — this was missing, so every client-mode table (the vast
  // majority of tables in this app) rendered every filtered/sorted row
  // regardless of which page was selected, with the pager UI just lying
  // about what was actually on screen.
  const pageRows = server ? rows : sortedRows.slice(safePage * effectivePageSize, (safePage + 1) * effectivePageSize);

  const effectiveSortKey = server ? (server.sortKey ?? null) : sortKey;
  const effectiveSortDir = server ? (server.sortDir ?? 'asc') : sortDir;

  const allOnPageSelected = selectable && pageRows.length > 0 && pageRows.every(r => selectedKeys?.has(rowKey(r)));

  function updateQuery(next: string) {
    setQuery(next);
    setPage(0);
  }

  function toggleSort(key: string) {
    if (server) {
      if (!server.onSortChange) return;
      const dir = server.sortKey === key && server.sortDir === 'asc' ? 'desc' : 'asc';
      server.onSortChange(key, dir);
      return;
    }
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
    // Server mode only has the current page in memory — exports that page,
    // not the full remote result set.
    const csv = toCsv(visibleColumns, pageRows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'export.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function goToPage(zeroIndexedPage: number) {
    if (server) server.onPageChange(zeroIndexedPage + 1);
    else setPage(zeroIndexedPage);
  }

  function changePageSize(next: number) {
    if (server) server.onPageSizeChange(next);
    else { setPageSize(next); setPage(0); }
  }

  const currentSearchText = server ? serverSearchText : query;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {totalCount.toLocaleString()} rows
            {server?.loading && <span className="ml-1.5 text-slate-400 dark:text-slate-500">· loading…</span>}
          </span>
          {showSearchBox && (
            <input
              value={currentSearchText}
              onChange={e => (server ? handleServerSearchChange(e.target.value) : updateQuery(e.target.value))}
              // Belt-and-suspenders alongside onChange: a value set via
              // script/autofill/some automation tools fires a native
              // `input` event without the `change` React normally listens
              // for on a controlled text field, which would otherwise leave
              // `query` stale while the DOM shows the typed text.
              onInput={e => (server ? handleServerSearchChange(e.currentTarget.value) : updateQuery(e.currentTarget.value))}
              ref={searchInputRef}
              placeholder="Search…"
              className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-slate-700 dark:text-slate-200 w-40 focus:w-56 transition-[width]"
            />
          )}
        </div>
        <div className="flex items-center gap-2 relative">
          <button onClick={() => setShowColumnMenu(v => !v)} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Columns</button>
          <button onClick={exportCsv} className="text-xs px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" title={server ? 'Exports only the currently loaded page' : undefined}>Export CSV</button>
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
              {visibleColumns.map(c => {
                const sortDisabled = !c.sortValue || (!!server && !server.onSortChange);
                return (
                  <th key={c.key} className={`text-left font-medium text-slate-500 dark:text-slate-400 px-3 py-2 whitespace-nowrap select-none ${c.sticky ? 'sticky left-0 z-10 bg-white dark:bg-slate-900' : ''}`}>
                    <button className="flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-100 disabled:hover:text-slate-500 dark:disabled:hover:text-slate-400" onClick={() => c.sortValue && toggleSort(c.key)} disabled={sortDisabled}>
                      {c.header}
                      {effectiveSortKey === c.key && <span>{effectiveSortDir === 'asc' ? '▲' : '▼'}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  className={`group border-b border-slate-100 dark:border-slate-800/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 focus-visible:-outline-offset-2' : ''}`}
                  onClick={() => onRowClick?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e => {
                    // Only when the row itself is focused, not a nested
                    // interactive child (e.g. the selection checkbox) —
                    // otherwise Space would both toggle the checkbox via
                    // its native behavior *and* trigger the row action.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onRowClick(row);
                    }
                  }) : undefined}
                >
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
              <tr><td colSpan={visibleColumns.length + (selectable ? 1 : 0)} className="px-3 py-8 text-center text-slate-400 dark:text-slate-500">{currentSearchText.trim() ? (server ? 'No rows match your search.' : (rows.length > 0 ? 'No rows match your search.' : emptyMessage)) : emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span>Showing {rangeStart}–{rangeEnd} of {totalCount.toLocaleString()}</span>
            <label className="flex items-center gap-1.5">
              <select
                value={effectivePageSize}
                onChange={e => changePageSize(Number(e.target.value))}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-slate-600 dark:text-slate-300"
              >
                {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>/ page</span>
            </label>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button disabled={safePage === 0} onClick={() => goToPage(safePage - 1)} aria-label="Previous page" className="min-h-[36px] px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Prev</button>
              {pageWindow(safePage, totalPages).map((p, i) =>
                p === 'ellipsis'
                  ? <span key={`e${i}`} className="px-1.5">…</span>
                  : (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      aria-current={p === safePage ? 'page' : undefined}
                      aria-label={`Page ${p + 1}`}
                      className={`min-w-[36px] min-h-[36px] px-2.5 py-2 rounded-md border tabular-nums ${p === safePage ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      {p + 1}
                    </button>
                  )
              )}
              <button disabled={safePage >= totalPages - 1} onClick={() => goToPage(safePage + 1)} aria-label="Next page" className="min-h-[36px] px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
