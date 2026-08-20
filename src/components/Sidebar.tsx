import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useOrg } from '../lib/orgContext';
import { useAuth } from '../lib/auth';
import { findActiveModule, isChildActive, canSeeChild, canSeeModule, type Role } from '../lib/navConfig';
import { Icon, NAV_ICON_MAP } from './icons';

interface SidebarProps {
  /** Below `lg` (1024px) the sidebar is an off-canvas drawer, closed by
   * default — there's no width left to show it inline once AppRail's 64px
   * and this sidebar's 256px are both accounted for on a 768-1024px
   * viewport. `open`/`onClose` only matter below that breakpoint; at `lg`
   * and up the sidebar is always visible regardless of this prop. */
  open: boolean;
  onClose: () => void;
}

/**
 * This domain's OWN sidebar — scoped to whichever module AppRail says is
 * active, nothing else. It used to render all 15 modules' full trees at
 * once (an accordion you had to expand/collapse to find anything); now it
 * only ever shows one module's sub-nav, the way a real separate app would.
 * Switching domains happens in AppRail, not here.
 */
export function Sidebar({ open, onClose }: SidebarProps) {
  const { orgs, currentOrg, folders, projects, scope, setCurrentOrg, setScope, menuPermissions } = useOrg();
  const { signOut, user } = useAuth();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const role = (currentOrg?.myRole as Role) ?? 'owner';

  // Below `lg` the drawer should get out of the way the moment a nav link is
  // actually followed (matches the standard off-canvas-drawer convention) --
  // harmless above `lg`, where `open` is ignored by the responsive classes
  // on the <aside> below anyway.
  useEffect(() => { onClose(); }, [location.pathname, onClose]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const activeModule = useMemo(() => findActiveModule(location.pathname), [location.pathname]);
  const filteredChildren = useMemo(() => {
    if (!activeModule) return [];
    // findActiveModule matches on the URL alone, regardless of whether this
    // user can actually see the module -- landing on a denied route (e.g.
    // typing /reports directly) must not leak that module's submenu list
    // into the sidebar even though ProtectedRoute correctly blocks the main
    // content with AccessDenied.
    if (!canSeeModule(activeModule, role, menuPermissions)) return [];
    return activeModule.children.filter(child => canSeeChild(child, role, activeModule.icon, menuPermissions));
  }, [activeModule, role, menuPermissions]);

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
          <button onClick={() => toggleFolder(folder.id)} className="w-4 text-slate-400 dark:text-slate-500 flex justify-center">
            <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={12} />
          </button>
          <button type="button" className="truncate flex-1 flex items-center gap-1.5 text-left" onClick={() => setScope({ type: 'folder', id: folder.id, name: folder.name })}>
            <Icon name="folder" size={14} className="text-slate-400 dark:text-slate-500 shrink-0" />
            {folder.name}
          </button>
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
    <>
      {/* Backdrop — below `lg` only, and only while the drawer is open.
          Clicking it closes the drawer, same as Escape. */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={`w-64 shrink-0 h-screen flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900
          fixed top-0 z-40 transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:z-auto lg:translate-x-0 lg:transition-none lg:sticky lg:top-0`}
      >
        <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 lg:hidden mb-3">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Menu</span>
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close menu">
              <Icon name="x" size={16} />
            </button>
          </div>
          <div className="relative">
            <button onClick={() => setOrgMenuOpen(v => !v)} className="w-full flex items-center justify-between text-sm rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
              <span className="truncate flex items-center gap-1.5">
                <Icon name="building" size={14} className="text-slate-400 shrink-0" />
                {currentOrg?.name ?? 'Select organization'}
              </span>
              <Icon name="chevron-down" size={14} className="text-slate-400" />
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
        <span className="text-slate-500 dark:text-slate-400" aria-hidden="true">
          <Icon name={NAV_ICON_MAP[activeModule.label] ?? 'overview'} size={16} />
        </span>
        <span className="font-semibold text-slate-900 dark:text-white truncate">{activeModule.label}</span>
      </div>

      <nav className="px-2 py-2 flex flex-col gap-0.5 border-b border-slate-200 dark:border-slate-800 max-h-[38vh] overflow-y-auto">
        {filteredChildren.map(child => (
          <div key={child.label}>
            {child.action === 'open-chat' ? (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('horizonvigil:open-chat'))}
                className="w-full text-left truncate rounded-md px-2 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {child.label}
              </button>
            ) : child.real && child.to ? (
              <NavLink
                to={child.to}
                className={`block truncate rounded-md px-2 py-1.5 text-sm ${isChildActive(child, activeModule.children, location.pathname, location.search, location.hash) ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-medium' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {child.label}
              </NavLink>
            ) : (
              <div className="flex items-center justify-between gap-2 truncate rounded-md px-2 py-1.5 text-sm cursor-default" title="Planned capability">
                <span className="truncate text-slate-400 dark:text-slate-600">{child.label}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-600">Planned</span>
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search folders & projects…"
            className="w-full text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-7 pr-2 py-1.5 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {currentOrg && (
            <li>
              <button onClick={() => setScope({ type: 'org', id: currentOrg.id, name: currentOrg.name })} className={`flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-sm ${scope?.type === 'org' ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                <Icon name="building" size={14} className="text-slate-400 shrink-0" />
                <span className="truncate">{currentOrg.name}</span>
              </button>
            </li>
          )}
          {rootFolders.map(renderFolder)}
          {rootProjects.map(renderProject)}
        </ul>
      </div>

      <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-800 text-xs">
        <div className="truncate text-slate-500 dark:text-slate-400">{user?.email}</div>
        <button onClick={() => void signOut()} className="text-brand-600 dark:text-brand-400 hover:underline mt-1 flex items-center gap-1">
          <Icon name="log-out" size={12} />
          Sign out
        </button>
      </div>
    </aside>
    </>
  );
}