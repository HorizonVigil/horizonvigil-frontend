import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FilterBar } from '../components/FilterBar';
import { Breadcrumb } from '../components/Breadcrumb';
import { Badge } from '../components/Badge';
import { Icon } from '../components/icons';
import { useOrg } from '../lib/orgContext';
import { useConfirm } from '../components/ConfirmDialog';
import { useTabParam } from '../lib/useTabParam';
import { useSubmenuAccess } from '../lib/useCanSeeSubmenu';
import {
  api,
  type ActivityEntry,
  type BusinessUnit,
  type CostCenter,
  type HierarchyNode,
  type HierarchyFolder,
} from '../lib/api';

const TABS = ['Organizations', 'Folders', 'Projects', 'Environments', 'Business Units', 'Cost Centers', 'Tags', 'Ownership'] as const;
type Tab = typeof TABS[number];

export function OrganizationManagement() {
  const { currentOrg, folders, projects, refresh } = useOrg();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const canSeeTab = useSubmenuAccess('organization');
  const visibleTabs = TABS.filter(canSeeTab);
  const [tab, setTab] = useTabParam<Tab>(TABS, 'Organizations');
  useEffect(() => {
    if (!canSeeTab(tab) && visibleTabs.length > 0) setTab(visibleTabs[0]);
  }, [tab, canSeeTab, visibleTabs, setTab]);

  const [orgName, setOrgName] = useState('');
  const [orgSaved, setOrgSaved] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');
  const [newProjectFolder, setNewProjectFolder] = useState('');
  const [folderProjectError, setFolderProjectError] = useState<string | null>(null);

  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [newBuName, setNewBuName] = useState('');
  const [newBuCode, setNewBuCode] = useState('');
  const [buError, setBuError] = useState<string | null>(null);

  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [newCcName, setNewCcName] = useState('');
  const [newCcCode, setNewCcCode] = useState('');
  const [newCcBu, setNewCcBu] = useState('');
  const [ccError, setCcError] = useState<string | null>(null);

  const [environments, setEnvironments] = useState<{ environment: string; count: number }[]>([]);
  const [tags, setTags] = useState<{ key: string; resourceCount: number; values: { value: string; count: number }[] }[]>([]);
  const [ownershipTagKey, setOwnershipTagKey] = useState('');
  const [owners, setOwners] = useState<{ owner: string; resourceCount: number }[]>([]);

  const [hierarchy, setHierarchy] = useState<HierarchyNode | null>(null);
  const [auditLog, setAuditLog] = useState<ActivityEntry[]>([]);

  const [extrasLoading, setExtrasLoading] = useState(true);
  const [extrasRefreshing, setExtrasRefreshing] = useState(false);
  const [extrasError, setExtrasError] = useState<string | null>(null);
  const [ownershipLoading, setOwnershipLoading] = useState(false);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);

  const [savingOrg, setSavingOrg] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [buBusy, setBuBusy] = useState(false);
  const [ccBusy, setCcBusy] = useState(false);

  const extrasRequestRef = useRef(0);
  const ownershipRequestRef = useRef(0);

  useEffect(() => { if (currentOrg) setOrgName(currentOrg.name); }, [currentOrg]);

  const loadExtras = useCallback(async () => {
    const requestId = ++extrasRequestRef.current;
    const hasExistingData =
      businessUnits.length > 0 ||
      costCenters.length > 0 ||
      environments.length > 0 ||
      tags.length > 0 ||
      hierarchy !== null ||
      auditLog.length > 0;

    setExtrasError(null);
    setExtrasLoading(!hasExistingData);
    setExtrasRefreshing(hasExistingData);

    try {
      const [
        { businessUnits: bus },
        { costCenters: ccs },
        { environments: envs },
        { tags: t },
        hier,
        auditRes,
      ] = await Promise.all([
        api.getBusinessUnits(),
        api.getCostCenters(),
        api.getEnvironments(),
        api.getOrgTags(),
        api.getHierarchyExplorer(),
        api.getOrgHierarchyAuditLog({ page: 1, limit: 15 }),
      ]);

      if (requestId !== extrasRequestRef.current) return;

      setBusinessUnits(bus);
      setCostCenters(ccs);
      setEnvironments(envs);
      setTags(t);
      setHierarchy(hier);
      setAuditLog(auditRes.items);
    } catch (err) {
      if (requestId !== extrasRequestRef.current) return;

      setExtrasError(
        err instanceof Error
          ? err.message
          : 'Could not load organization management data.',
      );
    } finally {
      if (requestId === extrasRequestRef.current) {
        setExtrasLoading(false);
        setExtrasRefreshing(false);
      }
    }
  }, [
    businessUnits.length,
    costCenters.length,
    environments.length,
    tags.length,
    hierarchy,
    auditLog.length,
  ]);

  useEffect(() => { void loadExtras(); }, [loadExtras]);

  const loadOwnership = useCallback(async (tagKey: string) => {
    const requestId = ++ownershipRequestRef.current;

    setOwnershipError(null);
    setOwnershipLoading(true);

    try {
      const res = await api.getOwnership(tagKey || undefined);

      if (requestId !== ownershipRequestRef.current) return;

      setOwners(res.owners);
    } catch (err) {
      if (requestId !== ownershipRequestRef.current) return;

      setOwnershipError(
        err instanceof Error
          ? err.message
          : 'Could not load ownership data.',
      );
    } finally {
      if (requestId === ownershipRequestRef.current) {
        setOwnershipLoading(false);
      }
    }
  }, []);

  useEffect(() => { void loadOwnership(ownershipTagKey); }, [ownershipTagKey, loadOwnership]);

  async function handleSaveOrg(e: React.FormEvent) {
    e.preventDefault();

    const name = orgName.trim();

    if (!currentOrg || savingOrg) return;

    if (!name) {
      setOrgError('Organization name is required.');
      return;
    }

    if (name.length > 200) {
      setOrgError('Organization name must be 200 characters or fewer.');
      return;
    }

    setSavingOrg(true);
    setOrgError(null);

    try {
      await api.updateOrganization(currentOrg.id, { name });
      setOrgSaved(true);
      window.setTimeout(() => setOrgSaved(false), 2000);
      await refresh();
    } catch (err) {
      setOrgError(
        err instanceof Error
          ? err.message
          : 'Could not save organization details.',
      );
    } finally {
      setSavingOrg(false);
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();

    const name = newFolderName.trim();
    if (!name || folderBusy) return;

    if (name.length > 200) {
      setFolderProjectError('Folder name must be 200 characters or fewer.');
      return;
    }

    setFolderBusy(true);
    setFolderProjectError(null);

    try {
      await api.createFolder({
        name,
        parentFolderId: newFolderParent || undefined,
      });
      setNewFolderName('');
      setNewFolderParent('');
      await refresh();
      await loadExtras();
    } catch (err) {
      setFolderProjectError(
        err instanceof Error ? err.message : 'Could not create this folder.',
      );
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();

    const name = newProjectName.trim();
    const slug = newProjectSlug.trim().toLowerCase();

    if (!name || !slug || projectBusy) return;

    if (name.length > 200) {
      setFolderProjectError('Project name must be 200 characters or fewer.');
      return;
    }

    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(slug) || slug.length > 100) {
      setFolderProjectError(
        'Project slug must use lowercase letters, numbers, hyphens, or underscores.',
      );
      return;
    }

    setProjectBusy(true);
    setFolderProjectError(null);

    try {
      await api.createProject({
        name,
        slug,
        folderId: newProjectFolder || undefined,
      });
      setNewProjectName('');
      setNewProjectSlug('');
      setNewProjectFolder('');
      await refresh();
      await loadExtras();
    } catch (err) {
      setFolderProjectError(
        err instanceof Error ? err.message : 'Could not create this project.',
      );
    } finally {
      setProjectBusy(false);
    }
  }

  async function handleDeleteFolder(id: string) {
    if (folderBusy) return;

    if (
      !(await confirm(
        'Delete this folder? Nested folders/projects will also be removed.',
      ))
    ) {
      return;
    }

    setFolderBusy(true);
    setFolderProjectError(null);

    try {
      await api.deleteFolder(id);
      await refresh();
      await loadExtras();
    } catch (err) {
      setFolderProjectError(
        err instanceof Error ? err.message : 'Could not delete this folder.',
      );
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleDeleteProject(id: string) {
    if (projectBusy) return;

    if (
      !(await confirm(
        'Delete this project? Linked AWS accounts will be unassigned, not deleted.',
      ))
    ) {
      return;
    }

    setProjectBusy(true);
    setFolderProjectError(null);

    try {
      await api.deleteProject(id);
      await refresh();
      await loadExtras();
    } catch (err) {
      setFolderProjectError(
        err instanceof Error ? err.message : 'Could not delete this project.',
      );
    } finally {
      setProjectBusy(false);
    }
  }

  async function handleCreateBu(e: React.FormEvent) {
    e.preventDefault();

    const name = newBuName.trim();
    const code = newBuCode.trim();

    if (!name || buBusy) return;

    if (name.length > 200 || code.length > 50) {
      setBuError('Business unit name must be ≤200 characters and code ≤50 characters.');
      return;
    }

    setBuBusy(true);
    setBuError(null);

    try {
      await api.createBusinessUnit({
        name,
        code: code || undefined,
      });
      setNewBuName('');
      setNewBuCode('');
      await loadExtras();
    } catch (err) {
      setBuError(
        err instanceof Error ? err.message : 'Could not create this business unit.',
      );
    } finally {
      setBuBusy(false);
    }
  }

  async function handleDeleteBu(id: string) {
    if (buBusy) return;

    if (!(await confirm('Delete this business unit?'))) return;

    setBuBusy(true);
    setBuError(null);

    try {
      await api.deleteBusinessUnit(id);
      await loadExtras();
    } catch (err) {
      setBuError(
        err instanceof Error ? err.message : 'Could not delete this business unit.',
      );
    } finally {
      setBuBusy(false);
    }
  }

  async function handleCreateCc(e: React.FormEvent) {
    e.preventDefault();

    const name = newCcName.trim();
    const code = newCcCode.trim();

    if (!name || ccBusy) return;

    if (name.length > 200 || code.length > 50) {
      setCcError('Cost center name must be ≤200 characters and code ≤50 characters.');
      return;
    }

    setCcBusy(true);
    setCcError(null);

    try {
      await api.createCostCenter({
        name,
        code: code || undefined,
        businessUnitId: newCcBu || undefined,
      });
      setNewCcName('');
      setNewCcCode('');
      setNewCcBu('');
      await loadExtras();
    } catch (err) {
      setCcError(
        err instanceof Error ? err.message : 'Could not create this cost center.',
      );
    } finally {
      setCcBusy(false);
    }
  }

  async function handleDeleteCc(id: string) {
    if (ccBusy) return;

    if (!(await confirm('Delete this cost center?'))) return;

    setCcBusy(true);
    setCcError(null);

    try {
      await api.deleteCostCenter(id);
      await loadExtras();
    } catch (err) {
      setCcError(
        err instanceof Error ? err.message : 'Could not delete this cost center.',
      );
    } finally {
      setCcBusy(false);
    }
  }

  const folderNameById = useMemo(
    () => new Map(folders.map(folder => [folder.id, folder.name])),
    [folders],
  );

  const businessUnitNameById = useMemo(
    () =>
      new Map(
        businessUnits.map(businessUnit => [
          businessUnit.id,
          businessUnit.name,
        ]),
      ),
    [businessUnits],
  );

  const formatAuditDate = useCallback((value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? 'Invalid date'
      : date.toLocaleString();
  }, []);

  function renderHierarchyFolder(f: HierarchyFolder) {
    return (
      <li key={f.id} className="py-1">
        <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
          <Icon name="folder" size={14} className="text-slate-400" />
          {f.name}
        </div>
        <ul className="pl-5 border-l border-slate-200 dark:border-slate-800 ml-1.5">
          {f.projects.map(p => (
            <li key={p.id} className="py-1 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />{p.name} <span className="text-slate-400">({p.connectionCount} connections)</span>
            </li>
          ))}
          {f.children.map(child => renderHierarchyFolder(child))}
        </ul>
      </li>
    );
  }

  return (
    <div>
      <FilterBar title="Organization Management" breadcrumb={<Breadcrumb />} showAccountFilter={false} showRegionFilter={false} showDateFilter={false} />

      <div
        className="flex gap-1 mb-4 border-b border-slate-200 dark:border-slate-800 overflow-x-auto"
        role="tablist"
        aria-label="Organization management sections"
      >
        {visibleTabs.map(t => (
          <button
            type="button"
            key={t}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`organization-panel-${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            onClick={() => setTab(t)}
            className={`text-sm px-3 py-2 border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-brand-600 text-brand-600 dark:text-brand-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {extrasError && (
        <div
          role="alert"
          className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
            extrasLoading
              ? 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
              : 'border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300'
          }`}
        >
          <span className="break-words">
            {extrasError}
          </span>
          <button
            type="button"
            disabled={extrasRefreshing}
            onClick={() => void loadExtras()}
            className="shrink-0 font-medium hover:underline disabled:opacity-50"
          >
            {extrasRefreshing ? 'Refreshing…' : 'Retry'}
          </button>
        </div>
      )}

      {tab === 'Organizations' && (
        <div id="organization-panel-organizations" role="tabpanel" aria-label="Organizations">
          {currentOrg && (
            <form onSubmit={handleSaveOrg} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5 flex flex-wrap items-end gap-4 text-sm">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400 text-xs">Organization Name</span>
                <input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  maxLength={200}
                  aria-label="Organization name"
                  disabled={savingOrg}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white" />
              </label>
              <div><span className="text-slate-400 text-xs block">Plan</span><div className="font-medium text-slate-800 dark:text-slate-100 capitalize">{currentOrg.plan}</div></div>
              <div><span className="text-slate-400 text-xs block">Seats</span><div className="font-medium text-slate-800 dark:text-slate-100">{currentOrg.seats}</div></div>
              <div><span className="text-slate-400 text-xs block">Your Role</span><div className="font-medium text-slate-800 dark:text-slate-100 capitalize">{currentOrg.myRole}</div></div>
              <button
                type="submit"
                disabled={savingOrg}
                className="rounded-md bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm px-3 py-1.5"
              >
                {savingOrg ? 'Saving…' : 'Save'}
              </button>
              {orgSaved && <span className="text-xs text-emerald-500">Saved.</span>}
              {orgError && <span className="text-xs text-red-500">{orgError}</span>}
            </form>
          )}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Audit Log</h3>
            {ownershipError && (
            <div
              role="alert"
              className="mb-2 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
            >
              {ownershipError}
              <button
                type="button"
                onClick={() => void loadOwnership(ownershipTagKey)}
                className="ml-2 font-medium hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {ownershipLoading && (
            <p className="py-2 text-xs text-slate-400" aria-live="polite">
              Loading ownership…
            </p>
          )}

          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
              {auditLog.map(entry => (
                <li key={entry.id} className="py-2 text-sm flex justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-200">{entry.action.replace(/_/g, ' ').replace(/\./g, ' — ')} <span className="text-slate-400">by {entry.actor?.email ?? 'system'}</span></span>
                  <span className="text-xs text-slate-400 shrink-0">{formatAuditDate(entry.occurredAt)}</span>
                </li>
              ))}
              {auditLog.length === 0 && <li className="py-2 text-sm text-slate-400">No activity recorded yet.</li>}
            </ul>
          </div>
        </div>
      )}

      {tab === 'Folders' && (
        <div id="organization-panel-folders" role="tabpanel" aria-label="Folders">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Folders</h3>
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 mb-3">
              {folders.map(f => (
                <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Icon name="folder" size={14} className="text-slate-400" />
                    {f.name}
                  </span>
                  <button type="button" disabled={folderBusy} onClick={() => void handleDeleteFolder(f.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                </li>
              ))}
              {folders.length === 0 && <li className="py-2 text-sm text-slate-400">No folders yet.</li>}
            </ul>
            <form onSubmit={handleCreateFolder} className="flex gap-2 flex-wrap">
              <input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                maxLength={200}
                aria-label="Folder name"
                placeholder="Folder name"
                disabled={folderBusy}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white flex-1 min-w-[8rem]" />
              <select
                value={newFolderParent}
                onChange={e => setNewFolderParent(e.target.value)}
                aria-label="Parent folder"
                disabled={folderBusy}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white">
                <option value="">Top level</option>
                {folders.map(f => <option key={f.id} value={f.id}>Inside {f.name}</option>)}
              </select>
              <button type="submit" disabled={folderBusy} className="rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Add Folder</button>
            </form>
            {folderProjectError && <p className="text-sm text-red-500 mt-2">{folderProjectError}</p>}
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Hierarchy Explorer</h3>
            {hierarchy ? (
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {hierarchy.folders.map(f => renderHierarchyFolder(f))}
                {hierarchy.unfiledProjects.map(p => (
                  <li key={p.id} className="py-1 text-sm text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />{p.name} <span className="text-slate-400">({p.connectionCount} connections)</span>
                  </li>
                ))}
                {hierarchy.folders.length === 0 && hierarchy.unfiledProjects.length === 0 && <li className="py-2 text-sm text-slate-400">Nothing to show yet.</li>}
              </ul>
            ) : <p className="text-sm text-slate-400">Loading…</p>}
          </div>
        </div>
      )}

      {tab === 'Projects' && (
        <div id="organization-panel-projects" role="tabpanel" aria-label="Projects" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Projects</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 mb-3">
            {projects.map(p => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{p.name} <span className="text-xs text-slate-400">{(p.folder_id ? folderNameById.get(p.folder_id) : undefined) ?? 'Top level'}</span></span>
                <button type="button" disabled={projectBusy} onClick={() => void handleDeleteProject(p.id)} className="text-xs text-red-500 hover:underline">Delete</button>
              </li>
            ))}
            {projects.length === 0 && <li className="py-2 text-sm text-slate-400">No projects yet.</li>}
          </ul>
          <form onSubmit={handleCreateProject} className="flex gap-2 flex-wrap">
            <input
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              maxLength={200}
              aria-label="Project name"
              placeholder="Project name"
              disabled={projectBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white flex-1 min-w-[8rem]" />
            <input
              value={newProjectSlug}
              onChange={e => setNewProjectSlug(e.target.value)}
              maxLength={100}
              aria-label="Project slug"
              placeholder="slug"
              disabled={projectBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-28" />
            <select
              value={newProjectFolder}
              onChange={e => setNewProjectFolder(e.target.value)}
              aria-label="Project folder"
              disabled={projectBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white">
              <option value="">Top level</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button type="submit" disabled={projectBusy} className="rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              {projectBusy ? 'Working…' : 'Add Project'}
            </button>
          </form>
          {folderProjectError && <p className="text-sm text-red-500 mt-2">{folderProjectError}</p>}
        </div>
      )}

      {tab === 'Environments' && (
        <div id="organization-panel-environments" role="tabpanel" aria-label="Environments" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Environments</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {environments.map(e => (
              <li key={e.environment} className="flex items-center justify-between py-2 text-sm">
                <Badge tone="neutral">{e.environment}</Badge>
                <span className="text-slate-500 dark:text-slate-400">{e.count} resources</span>
              </li>
            ))}
            {environments.length === 0 && <li className="py-2 text-sm text-slate-400">No resources scanned yet.</li>}
          </ul>
        </div>
      )}

      {tab === 'Business Units' && (
        <div id="organization-panel-business-units" role="tabpanel" aria-label="Business Units" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Business Units</h3>
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2">Name</th><th className="py-2">Code</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {businessUnits.map(bu => (
                <tr key={bu.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-2 text-slate-700 dark:text-slate-200">{bu.name}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{bu.code ?? '—'}</td>
                  <td className="py-2"><button type="button" disabled={buBusy} onClick={() => void handleDeleteBu(bu.id)} className="text-xs text-red-500 hover:underline">Delete</button></td>
                </tr>
              ))}
              {businessUnits.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-sm text-slate-400">No business units yet.</td></tr>}
            </tbody>
          </table>
          <form onSubmit={handleCreateBu} className="flex gap-2 flex-wrap">
            <input
              value={newBuName}
              onChange={e => setNewBuName(e.target.value)}
              maxLength={200}
              aria-label="Business unit name"
              placeholder="Name"
              disabled={buBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white flex-1 min-w-[8rem]" />
            <input
              value={newBuCode}
              onChange={e => setNewBuCode(e.target.value)}
              maxLength={50}
              aria-label="Business unit code"
              placeholder="Code (optional)"
              disabled={buBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-32" />
            <button type="submit" disabled={buBusy} className="rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              {buBusy ? 'Working…' : 'Add'}
            </button>
          </form>
          {buError && <p className="text-sm text-red-500 mt-2">{buError}</p>}
        </div>
      )}

      {tab === 'Cost Centers' && (
        <div id="organization-panel-cost-centers" role="tabpanel" aria-label="Cost Centers" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Cost Centers</h3>
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-slate-500 dark:text-slate-400">
                <th className="py-2">Name</th><th className="py-2">Code</th><th className="py-2">Business Unit</th><th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {costCenters.map(cc => (
                <tr key={cc.id} className="border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                  <td className="py-2 text-slate-700 dark:text-slate-200">{cc.name}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{cc.code ?? '—'}</td>
                  <td className="py-2 text-slate-500 dark:text-slate-400">{(cc.business_unit_id ? businessUnitNameById.get(cc.business_unit_id) : undefined) ?? '—'}</td>
                  <td className="py-2"><button type="button" disabled={ccBusy} onClick={() => void handleDeleteCc(cc.id)} className="text-xs text-red-500 hover:underline">Delete</button></td>
                </tr>
              ))}
              {costCenters.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-sm text-slate-400">No cost centers yet.</td></tr>}
            </tbody>
          </table>
          <form onSubmit={handleCreateCc} className="flex gap-2 flex-wrap">
            <input
              value={newCcName}
              onChange={e => setNewCcName(e.target.value)}
              maxLength={200}
              aria-label="Cost center name"
              placeholder="Name"
              disabled={ccBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white flex-1 min-w-[8rem]" />
            <input
              value={newCcCode}
              onChange={e => setNewCcCode(e.target.value)}
              maxLength={50}
              aria-label="Cost center code"
              placeholder="Code (optional)"
              disabled={ccBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white w-28" />
            <select
              value={newCcBu}
              onChange={e => setNewCcBu(e.target.value)}
              aria-label="Business unit"
              disabled={ccBusy}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white">
              <option value="">No business unit</option>
              {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
            <button type="submit" disabled={ccBusy} className="rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-sm px-3 py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              {ccBusy ? 'Working…' : 'Add'}
            </button>
          </form>
          {ccError && <p className="text-sm text-red-500 mt-2">{ccError}</p>}
        </div>
      )}

      {tab === 'Tags' && (
        <div id="organization-panel-tags" role="tabpanel" aria-label="Tags" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Organization Tags</h3>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
            {tags.map(t => (
              <li key={t.key} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{t.key}</span>
                  <span className="text-xs text-slate-400">{t.resourceCount} resource{t.resourceCount === 1 ? '' : 's'}</span>
                </div>
                <span className="text-xs text-slate-400">{t.values.slice(0, 4).map(v => v.value).join(', ')}{t.values.length > 4 ? '…' : ''}</span>
              </li>
            ))}
            {tags.length === 0 && <li className="py-2 text-sm text-slate-400">No tags found yet.</li>}
          </ul>
        </div>
      )}

      {tab === 'Ownership' && (
        <div id="organization-panel-ownership" role="tabpanel" aria-label="Ownership" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-3">Ownership</h3>
          <select
            value={ownershipTagKey}
            onChange={e => setOwnershipTagKey(e.target.value)}
            aria-label="Ownership tag key"
            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-900 dark:text-white w-full max-w-xs mb-2">
            <option value="">owner (default)</option>
            {tags.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
          </select>
          <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {owners.map(o => (
              <li key={o.owner} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-700 dark:text-slate-200">{o.owner}</span>
                <span className="text-xs text-slate-400">{o.resourceCount} resource{o.resourceCount === 1 ? '' : 's'}</span>
              </li>
            ))}
            {owners.length === 0 && <li className="py-2 text-sm text-slate-400">No ownership data yet.</li>}
          </ul>
        </div>
      )}
      {confirmDialog}
    </div>
  );
}