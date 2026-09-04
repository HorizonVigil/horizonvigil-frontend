import { useEffect, useMemo, useRef, useState } from 'react';
import { useOrg } from '../lib/orgContext';
import type { FolderRow, ProjectRow } from '../lib/api';
import { Icon } from './icons';

/**
 * The single org / folder / project scope selector, shown once in TopBar
 * for every module. The button shows the current scope path; the dropdown
 * switches organization and picks a folder or project to scope the whole
 * app to.
 *
 * Folders are collapsed by default and expand one level at a time via their
 * own chevron — an org with 100+ folders/projects would otherwise render
 * its entire tree open on every render. A folder's row also shows its
 * total (recursive) project count so it's scannable without expanding.
 * Searching bypasses collapse state: it auto-expands and shows only the
 * branches that contain a match, everything else is hidden rather than
 * dumped flat.
 */
export function ScopePicker() {
  const { orgs, currentOrg, folders, projects, scope, setCurrentOrg, setScope } = useOrg();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const childFolders = useMemo(() => {
    const m = new Map<string | null, FolderRow[]>();
    for (const f of folders) {
      const k = f.parent_folder_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(f);
    }
    return m;
  }, [folders]);

  const projectsByFolder = useMemo(() => {
    const m = new Map<string | null, ProjectRow[]>();
    for (const p of projects) {
      const k = p.folder_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return m;
  }, [projects]);

  const parentOf = useMemo(() => new Map(folders.map((f) => [f.id, f.parent_folder_id])), [folders]);
  const folderOfProject = useMemo(() => new Map(projects.map((p) => [p.id, p.folder_id])), [projects]);

  // Total projects nested anywhere under a folder — lets you tell a big
  // branch from an empty one without expanding it.
  const descendantProjectCount = useMemo(() => {
    const memo = new Map<string, number>();
    const visiting = new Set<string>();
    function count(folderId: string): number {
      if (memo.has(folderId)) return memo.get(folderId)!;
      if (visiting.has(folderId)) return 0; // malformed cyclic parent chain — don't recurse forever
      visiting.add(folderId);
      let n = (projectsByFolder.get(folderId) ?? []).length;
      for (const kid of childFolders.get(folderId) ?? []) n += count(kid.id);
      visiting.delete(folderId);
      memo.set(folderId, n);
      return n;
    }
    for (const f of folders) count(f.id);
    return memo;
  }, [folders, childFolders, projectsByFolder]);

  // Auto-expand the path down to the current scope whenever the dropdown
  // opens, so re-opening it shows you where you are instead of everything
  // collapsed back to the roots.
  useEffect(() => {
    if (!open || !scope) return;
    const path = new Set<string>();
    let folderId = scope.type === 'folder' ? scope.id : scope.type === 'project' ? folderOfProject.get(scope.id) ?? null : null;
    while (folderId && !path.has(folderId)) {
      path.add(folderId);
      folderId = parentOf.get(folderId) ?? null;
    }
    if (path.size > 0) setExpanded((prev) => new Set([...prev, ...path]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = search.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(q);

  // Whether a folder (recursively) contains a name match — drives which
  // branches even render while searching.
  const folderHasMatch = useMemo(() => {
    if (!q) return null;
    const memo = new Map<string, boolean>();
    const visiting = new Set<string>();
    function has(folderId: string): boolean {
      if (memo.has(folderId)) return memo.get(folderId)!;
      if (visiting.has(folderId)) return false; // malformed cyclic parent chain
      visiting.add(folderId);
      const folder = folders.find((f) => f.id === folderId);
      let result = Boolean(folder && matches(folder.name));
      if (!result) result = (projectsByFolder.get(folderId) ?? []).some((p) => matches(p.name));
      if (!result) result = (childFolders.get(folderId) ?? []).some((k) => has(k.id));
      visiting.delete(folderId);
      memo.set(folderId, result);
      return result;
    }
    for (const f of folders) has(f.id);
    return memo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, folders, childFolders, projectsByFolder]);

  const scopeLabel =
    scope?.type === 'org' || !scope
      ? currentOrg?.name ?? 'Select organization'
      : `${currentOrg?.name ?? ''} / ${scope.name}`;

  function pick(next: Parameters<typeof setScope>[0]) {
    setScope(next);
    setOpen(false);
    setSearch('');
  }

  function toggle(folderId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  }

  const rowClass = (active: boolean) =>
    `flex items-center gap-1.5 flex-1 min-w-0 rounded-md px-1.5 py-1.5 text-sm text-left ${
      active
        ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  function renderFolder(folder: FolderRow, depth: number): React.ReactNode {
    if (q && !folderHasMatch?.get(folder.id)) return null;

    const kids = childFolders.get(folder.id) ?? [];
    const projs = (projectsByFolder.get(folder.id) ?? []).filter((p) => !q || matches(p.name));
    const hasChildren = kids.length > 0 || (projectsByFolder.get(folder.id) ?? []).length > 0;
    const isOpen = Boolean(q) || expanded.has(folder.id);
    const total = descendantProjectCount.get(folder.id) ?? 0;

    return (
      <div key={folder.id}>
        <div className="flex items-center gap-0.5" style={{ paddingLeft: depth * 14 }}>
          <button
            type="button"
            onClick={() => toggle(folder.id)}
            disabled={!hasChildren}
            className="w-5 h-6 shrink-0 flex items-center justify-center text-slate-400 dark:text-slate-500 disabled:opacity-0"
            aria-label={isOpen ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          >
            <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={12} />
          </button>
          <button onClick={() => pick({ type: 'folder', id: folder.id, name: folder.name })} className={rowClass(scope?.type === 'folder' && scope.id === folder.id)}>
            <Icon name="folder" size={13} className="text-slate-400 shrink-0" />
            <span className="truncate">{folder.name}</span>
            {total > 0 && <span className="ml-auto shrink-0 text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{total}</span>}
          </button>
        </div>
        {isOpen && (kids.length > 0 || projs.length > 0) && (
          <div>
            {kids.map((k) => renderFolder(k, depth + 1))}
            {projs.map((p) => (
              <div key={p.id} className="flex items-center gap-0.5" style={{ paddingLeft: (depth + 1) * 14 }}>
                <span className="w-5 shrink-0" />
                <button onClick={() => pick({ type: 'project', id: p.id, name: p.name })} className={rowClass(scope?.type === 'project' && scope.id === p.id)}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const rootFolders = childFolders.get(null) ?? [];
  const rootProjects = (projectsByFolder.get(null) ?? []).filter((p) => !q || matches(p.name));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 text-sm rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <span className="truncate flex items-center gap-1.5">
          <Icon name="building" size={14} className="text-slate-400 shrink-0" />
          {scopeLabel}
        </span>
        <Icon name="chevron-down" size={14} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[18rem] max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl">
          {orgs.length > 1 && (
            <div className="border-b border-slate-100 dark:border-slate-700 p-1.5">
              <div className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Organization</div>
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setCurrentOrg(o); setOpen(false); }}
                  className={`${rowClass(o.id === currentOrg?.id)} w-full`}
                >
                  <Icon name="building" size={13} className="text-slate-400 shrink-0" />
                  <span className="truncate">{o.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="p-1.5">
            <div className="relative mb-1.5">
              <Icon name="search" size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search folders & projects…"
                className="w-full text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 pl-7 pr-2 py-1.5 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
              />
            </div>
            <div className="max-h-[60vh] overflow-y-auto flex flex-col gap-0.5">
              {currentOrg && (!q || matches(currentOrg.name)) && (
                <button onClick={() => pick({ type: 'org', id: currentOrg.id, name: currentOrg.name })} className={`${rowClass(!scope || scope.type === 'org')} w-full`}>
                  <Icon name="building" size={13} className="text-slate-400 shrink-0" />
                  <span className="truncate">All of {currentOrg.name}</span>
                </button>
              )}
              {rootFolders.map((f) => renderFolder(f, 0))}
              {rootProjects.map((p) => (
                <div key={p.id} className="flex items-center gap-0.5">
                  <span className="w-5 shrink-0" />
                  <button onClick={() => pick({ type: 'project', id: p.id, name: p.name })} className={rowClass(scope?.type === 'project' && scope.id === p.id)}>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </button>
                </div>
              ))}
              {folders.length === 0 && projects.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">No folders or projects yet.</p>
              )}
              {q && rootFolders.every((f) => !folderHasMatch?.get(f.id)) && rootProjects.length === 0 && folders.length + projects.length > 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">No matches for "{search}".</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
