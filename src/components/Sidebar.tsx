import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useOrg } from '../lib/orgContext';
import { useAuth } from '../lib/auth';

const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', icon: '◈' },
  { to: '/aws-accounts', label: 'AWS Accounts', icon: '☁' },
  { to: '/resources', label: 'Resources', icon: '▦' },
  { to: '/cost-management', label: 'Cost Management', icon: '$' },
  { to: '/cost-optimization', label: 'Cost Optimization', icon: '↓$' },
  { to: '/vulnerability-management', label: 'Vulnerability Management', icon: '⚠' },
  { to: '/clusters', label: 'EKS / ECS Clusters', icon: '⬡' },
  { to: '/monitoring', label: 'Monitoring', icon: '∿' },
  { to: '/alerts', label: 'Alerts', icon: '🔔' },
  { to: '/reports', label: 'Reports', icon: '▤' },
  { to: '/integrations', label: 'Integrations', icon: '⇄' },
  { to: '/users-groups', label: 'Users & Groups', icon: '◔' },
  { to: '/organization', label: 'Organization Management', icon: '⚙' },
  { to: '/settings', label: 'Settings', icon: '●' },
];

export function Sidebar() {
  const { orgs, currentOrg, folders, projects, scope, setCurrentOrg, setScope } = useOrg();
  const { signOut, user } = useAuth();
  const [search, setSearch] = useState('');
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const projectCountByFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) if (p.folderId) counts.set(p.folderId, (counts.get(p.folderId) ?? 0) + 1);
    return counts;
  }, [projects]);

  const filteredFolders = search ? folders.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : folders;
  const filteredProjects = search ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())) : projects;

  const rootFolders = filteredFolders.filter(f => !f.parentFolderId);
  const rootProjects = filteredProjects.filter(p => !p.folderId);

  function toggleFolder(id: string) {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function renderFolder(folder: typeof folders[number]) {
    const childFolders = filteredFolders.filter(f => f.parentFolderId === folder.id);
    const childProjects = filteredProjects.filter(p => p.folderId === folder.id);
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
        <div className="font-semibold text-slate-900 dark:text-white">CloudOps360</div>
        <div className="relative mt-2">
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

      <nav className="px-2 py-3 flex flex-col gap-0.5 border-b border-slate-200 dark:border-slate-800">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          >
            <span className="w-4 text-center">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </NavLink>
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
