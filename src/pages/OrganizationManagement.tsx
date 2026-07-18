import { useState } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { useOrg } from '../lib/orgContext';
import { api } from '../lib/api';
import { useEffect } from 'react';
import type { AuditLogEntry } from '../lib/api';

export function OrganizationManagement() {
  const { currentOrg, folders, projects, refresh } = useOrg();
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectFolder, setNewProjectFolder] = useState('');
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    if (currentOrg) void api.getAuditLog(currentOrg.id).then(r => setAuditLog(r.entries));
  }, [currentOrg]);

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !newFolderName.trim()) return;
    await api.createFolder(currentOrg.id, newFolderName.trim(), newFolderParent || undefined);
    setNewFolderName('');
    await refresh();
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !newProjectName.trim()) return;
    await api.createProject(currentOrg.id, newProjectName.trim(), newProjectFolder || undefined);
    setNewProjectName('');
    await refresh();
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm('Delete this folder? Nested folders/projects will also be removed.')) return;
    await api.deleteFolder(id);
    await refresh();
  }

  async function handleDeleteProject(id: string) {
    if (!confirm('Delete this project? Linked AWS accounts will be unassigned, not deleted.')) return;
    await api.deleteProject(id);
    await refresh();
  }

  return (
    <div>
      <FilterBar title="Organization Management" breadcrumb={<Breadcrumb />} />

      {currentOrg && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5 flex flex-wrap gap-6 text-sm">
          <div><span className="text-slate-400">Organization</span><div className="font-medium text-slate-800 dark:text-slate-100">{currentOrg.name}</div></div>
          <div><span className="text-slate-400">Plan</span><div className="font-medium text-slate-800 dark:text-slate-100 capitalize">{currentOrg.plan}</div></div>
          <div><span className="text-slate-400">Seats</span><div className="font-medium text-slate-800 dark:text-slate-100">{currentOrg.seats}</div></div>
          <div><span className="text-slate-400">Your Role</span><div className="font-medium text-slate-800 dark:text-slate-100 capitalize">{currentOrg.myRole}</div></div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Folders</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 mb-3">
            {folders.map(f => (
              <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">📁 {f.name}</span>
                <button onClick={() => void handleDeleteFolder(f.id)} className="text-xs text-red-500 hover:underline">Delete</button>
              </li>
            ))}
            {folders.length === 0 && <li className="py-2 text-sm text-slate-400">No folders yet.</li>}
          </ul>
          <form onSubmit={handleCreateFolder} className="flex gap-2 flex-wrap">
            <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white flex-1 min-w-[8rem]" />
            <select value={newFolderParent} onChange={e => setNewFolderParent(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white">
              <option value="">Top level</option>
              {folders.map(f => <option key={f.id} value={f.id}>Inside {f.name}</option>)}
            </select>
            <button type="submit" className="rounded-md border border-slate-200 dark:border-slate-700 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Add Folder</button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Projects</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 mb-3">
            {projects.map(p => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{p.name} <span className="text-xs text-slate-400">{folders.find(f => f.id === p.folderId)?.name ?? 'Top level'}</span></span>
                <button onClick={() => void handleDeleteProject(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
              </li>
            ))}
            {projects.length === 0 && <li className="py-2 text-sm text-slate-400">No projects yet.</li>}
          </ul>
          <form onSubmit={handleCreateProject} className="flex gap-2 flex-wrap">
            <input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Project name" className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white flex-1 min-w-[8rem]" />
            <select value={newProjectFolder} onChange={e => setNewProjectFolder(e.target.value)} className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white">
              <option value="">Top level</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button type="submit" className="rounded-md border border-slate-200 dark:border-slate-700 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Add Project</button>
          </form>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Audit Log</h3>
        <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
          {auditLog.map(entry => (
            <li key={entry.id} className="py-2 text-sm flex justify-between gap-3">
              <span className="text-slate-700 dark:text-slate-200">{entry.action} <span className="text-slate-400">by {entry.actorEmail ?? 'system'}</span></span>
              <span className="text-xs text-slate-400 shrink-0">{new Date(entry.createdAt).toLocaleString()}</span>
            </li>
          ))}
          {auditLog.length === 0 && <li className="py-2 text-sm text-slate-400">No activity recorded yet.</li>}
        </ul>
      </div>
    </div>
  );
}
