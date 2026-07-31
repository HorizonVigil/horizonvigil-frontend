import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useOrg } from '../lib/orgContext';
import { useAuth } from '../lib/auth';
import { findActiveModule, isChildActive } from '../lib/navConfig';

/**
 * This domain's OWN sidebar — scoped to whichever module AppRail says is
 * active, nothing else. It used to render all 15 modules' full trees at
 * once (an accordion you had to expand/collapse to find anything); now it
 * only ever shows one module's sub-nav, the way a real separate app would.
 * Switching domains happens in AppRail, not here.
 */
export function Sidebar() {
  const { orgs, currentOrg, folders, projects, scope, setCurrentOrg, setScope } = useOrg();
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const activeModule = useMemo(() => findActiveModule(location.pathname), [location.pathname]);

  const projectCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) if (p.folder_id) counts.set(p.folder_id, (counts.get(p.folder_id) ?? 0) + 1);
    return counts;
  }, [projects]);

  const filteredFolders = search ? folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : folders;
  const filteredProjects = search ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : projects;

  const rootFolders = filteredFolders.filter(f => !f.parent_folder_id);
  const rootProjects = filteredProjects.filter(p => !p.folder_id);

  function toggleFolder(id: string) {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderFolder(folder: typeof folders[number]) {
    const childFolders = filteredFolders.filter(f => f.parent_folder_id === folder.id);
    const childProjects = filteredProjects.filter(p => p.folder_id === folder.id);
    const isCollapsed = collapsedFolders.has(folder.id);
    const isActive = scope?.type === 'folder' && scope.id === folder.id;
    return (
      <li key={folder.id}>
        <div className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-sm cursor-pointer ${isActive ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <button onClick={() => toggleFolder(folder.id)} className="w-4 text-slate-400 dark:text-slate-500">{isCollapsed ? '▸' : '▾'}</button>
          <span className="truncate flex-1" onClick={() => setScope({ type: 'folder', id: folder.id, name: folder.name })}>📁 {folder.name}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">{projectCountByFolder.get(folder.id) ?? 0}</span>
        </div>
        {!isCollapsed && (childFolders.length > 0 || childProjects.length > 0) && (
          <ul className="ml-4 border-l border-slate-200 dark:border-slate-800 pl-2 flex flex-col gap-0.5 mt-0.5">
            {childFolders.map(renderFolder)}
            {childProjects.map(renderProject)}
          </ul>
        )}
      </li>
    );
  }

  function renderProject(project: typeof projects[number]) {
    const isActive = scope?.type === 'project' && scope.id === project.id;
    return (
      <li key={project.id}>
        <button onClick={() => setScope({ type: 'project', id: project.id, name: project.name })} className={`flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-sm truncate ${isActive ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="truncate">{project.name}</span>
        </button>
      </li>
    );
  }

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <button onClick={() => setOrgMenuOpen(v => !v)} className="w-full flex items-center justify-between text-sm rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            <span className="truncate">{currentOrg?.name ?? 'Select organization'}</span>
            <span className="text-slate-400">▾</span>
          </button>
          {orgMenuOpen && (
            <ul className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1">
              {orgs.map(o => (
                <li key={o.id}>
                  <button onClick={() => { setCurrentOrg(o); setOrgMenuOpen(false); }} className="w-full text-left px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
                    {o.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* This module's own header — the "you are inside a separate app now" cue.
          Switching to a different app happens in AppRail, not here. */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <span className="text-lg" aria-hidden="true">{activeModule.icon}</span>
        <span className="font-semibold text-slate-900 dark:text-white truncate">{activeModule.label}</span>
      </div>

      <nav className="px-2 py-2 flex flex-col gap-0.5 border-b border-slate-200 dark:border-slate-800 max-h-[38vh] overflow-y-auto">
        {activeModule.children.map(child => (
          <div key={child.label}>
            {child.action === 'open-chat' ? (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('cloudops:open-chat'))}
                className="w-full text-left truncate rounded-md px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {child.label}
              </button>
            ) : child.real && child.to ? (
              <NavLink
                to={child.to}
                // NavLink's own isActive only looks at pathname — most siblings
                // in a module now share one pathname with different ?tab=
                // values, so highlighting is computed manually via isChildActive
                // (pathname + tab query param) instead of the isActive callback.
                className={`block truncate rounded-md px-2 py-1.5 text-sm ${isChildActive(child, activeModule.children, location.pathname, location.search) ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {child.label}
              </NavLink>
            ) : (
              <div className="flex items-center justify-between gap-2 truncate rounded-md px-2 py-1.5 text-sm cursor-default" title="Not built yet">
                <span className="truncate text-slate-400 dark:text-slate-600">{child.label}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-600">Soon</span>
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search folders & projects…"
          className="w-full text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {currentOrg && (
            <li>
              <button onClick={() => setScope({ type: 'org', id: currentOrg.id, name: currentOrg.name })} className={`flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-sm ${scope?.type === 'org' ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                🏢 <span className="truncate">{currentOrg.name}</span>
              </button>
            </li>
          )}
          {rootFolders.map(renderFolder)}
          {rootProjects.map(renderProject)}
        </ul>
      </div>

      <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-800 text-xs">
        <div className="truncate text-slate-500 dark:text-slate-400">{user?.email}</div>
        <button onClick={() => void signOut()} className="text-brand-600 dark:text-brand-400 hover:underline mt-1">Sign out</button>
      </div>
    </aside>
  );
}
