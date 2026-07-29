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
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

function toCsv<T>(columns: Column<T>[], rows: T[]): string {
  const header = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const lines = rows.map(row => columns.map(c => {
    const val = c.sortValue ? c.sortValue(row) : '';
    return `"${String(val).replace(/"/g, '""')}"`;
  }).join(','));
  return [header, ...lines].join('\n');
}

export function DataTable<T>({ columns, rows, rowKey, pageSize = 20, onRowClick, emptyMessage = 'No results.' }: DataTableProps<T>) {
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set(columns.filter(c => c.defaultHidden).map(c => c.key)));
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const visibleColumns = columns.filter(c => !hiddenCols.has(c.key));

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find(c => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b);
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
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
        <span className="text-xs text-slate-500 dark:text-slate-400">{sortedRows.length.toLocaleString()} rows</span>
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
            {pageRows.map(row => (
              <tr key={rowKey(row)} className={`group border-b border-slate-100 dark:border-slate-800/60 last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`} onClick={() => onRowClick?.(row)}>
                {visibleColumns.map(c => (
                  <td key={c.key} className={`px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200 ${c.sticky ? 'sticky left-0 z-[1] bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50' : ''}`}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={visibleColumns.length} className="px-3 py-8 text-center text-slate-400 dark:text-slate-500">{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Prev</button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
