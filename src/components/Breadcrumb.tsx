import { useOrg } from '../lib/orgContext';

/** Reflects the current position in the Organization › Folder › Project tree — spec §3. */
export function Breadcrumb() {
  const { currentOrg, folders, projects, scope } = useOrg();
  const parts: string[] = ['Organizations'];
  if (currentOrg) parts.push(currentOrg.name);

  if (scope?.type === 'folder') {
    const folder = folders.find(f => f.id === scope.id);
    if (folder) parts.push(folder.name);
  } else if (scope?.type === 'project') {
    const project = projects.find(p => p.id === scope.id);
    if (project) {
      if (project.folderId) {
        const folder = folders.find(f => f.id === project.folderId);
        if (folder) parts.push(folder.name);
      }
      parts.push(project.name);
    }
  }

  return (
    <nav className="text-xs text-slate-400 dark:text-slate-500" aria-label="Breadcrumb">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1">›</span>}
          <span className={i === parts.length - 1 ? 'text-slate-500 dark:text-slate-400' : ''}>{p}</span>
        </span>
      ))}
    </nav>
  );
}
