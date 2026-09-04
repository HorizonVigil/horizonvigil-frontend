import { useEffect, useMemo, useRef, useState } from 'react';
import { useOrg } from '../lib/orgContext';
import type { FolderRow, ProjectRow } from '../lib/api';
import { Icon } from './icons';

/**
 * The single org / folder / project scope selector, shown once in the
 * sidebar for every module (it replaced the always-expanded folder tree —
 * same navigation, far less chrome). The button shows the current scope
 * path; the dropdown switches organization and picks a folder or project to
 * scope the whole app to.
 */
export function ScopePicker() {
  const { orgs, currentOrg, folders, projects, scope, setCurrentOrg, setScope } = useOrg();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
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

  const q = search.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  const scopeLabel =
    scope?.type === 'org' || !scope
      ? currentOrg?.name ?? 'Select organization'
      : `${currentOrg?.name ?? ''} / ${scope.name}`;

  function pick(next: Parameters<typeof setScope>[0]) {
    setScope(next);
    setOpen(false);
    setSearch('');
  }

  const rowClass = (active: boolean) =>
    `flex items-center gap-1.5 w-full rounded-md px-2 py-1.5 text-sm text-left ${
      active
        ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  function renderFolder(folder: FolderRow, depth: number): React.ReactNode {
    const kids = childFolders.get(folder.id) ?? [];
    const projs = projectsByFolder.get(folder.id) ?? [];
    const selfMatches = matches(folder.name);
    const rendered = (
      <>
        {(selfMatches || q === '') && (
          <button key={folder.id} onClick={() => pick({ type: 'folder', id: folder.id, name: folder.name })} className={rowClass(scope?.type === 'folder' && scope.id === folder.id)} style={{ paddingLeft: 8 + depth * 14 }}>
            <Icon name="folder" size={13} className="text-slate-400 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </button>
        )}
        {kids.map((k) => renderFolder(k, depth + 1))}
        {projs.filter((p) => matches(p.name)).map((p) => (
          <button key={p.id} onClick={() => pick({ type: 'project', id: p.id, name: p.name })} className={rowClass(scope?.type === 'project' && scope.id === p.id)} style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="truncate">{p.name}</span>
          </button>
        ))}
      </>
    );
    return <div key={folder.id}>{rendered}</div>;
  }

  const rootFolders = childFolders.get(null) ?? [];
  const rootProjects = (projectsByFolder.get(null) ?? []).filter((p) => matches(p.name));

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
        <div className="absolute z-50 mt-1 w-[17rem] max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl">
          {orgs.length > 1 && (
            <div className="border-b border-slate-100 dark:border-slate-700 p-1.5">
              <div className="px-1.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Organization</div>
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setCurrentOrg(o); setOpen(false); }}
                  className={rowClass(o.id === currentOrg?.id)}
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
            <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-0.5">
              {currentOrg && (q === '' || matches(currentOrg.name)) && (
                <button onClick={() => pick({ type: 'org', id: currentOrg.id, name: currentOrg.name })} className={rowClass(!scope || scope.type === 'org')}>
                  <Icon name="building" size={13} className="text-slate-400 shrink-0" />
                  <span className="truncate">All of {currentOrg.name}</span>
                </button>
              )}
              {rootFolders.map((f) => renderFolder(f, 0))}
              {rootProjects.map((p) => (
                <button key={p.id} onClick={() => pick({ type: 'project', id: p.id, name: p.name })} className={rowClass(scope?.type === 'project' && scope.id === p.id)} style={{ paddingLeft: 22 }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
              {folders.length === 0 && projects.length === 0 && (
                <p className="px-2 py-3 text-xs text-slate-400">No folders or projects yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
