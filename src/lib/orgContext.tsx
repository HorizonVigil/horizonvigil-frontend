import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, type OrganizationRow, type FolderRow, type ProjectRow, type MenuPermissionLevel } from './api';
import { useAuth } from './auth';

export type ScopeType = 'org' | 'folder' | 'project';
export interface Scope { type: ScopeType; id: string; name: string }

interface OrgContextType {
  orgs: OrganizationRow[];
  currentOrg: OrganizationRow | null;
  folders: FolderRow[];
  projects: ProjectRow[];
  scope: Scope | null;
  /** Effective per-menu permission level (explicit override or role-derived default) — see rbac.ts's getEffectiveMenuPermissions. Null while loading; navConfig's canSee treats null as "not yet known" and falls back to role-only, same as before this existed. */
  menuPermissions: Record<string, MenuPermissionLevel> | null;
  isLoading: boolean;
  setCurrentOrg: (org: OrganizationRow) => void;
  setScope: (scope: Scope | null) => void;
  refresh: () => Promise<void>;
  createOrg: (name: string) => Promise<void>;
}

const OrgContext = createContext<OrgContextType | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<OrganizationRow | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [scope, setScope] = useState<Scope | null>(null);
  const [menuPermissions, setMenuPermissions] = useState<Record<string, MenuPermissionLevel> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      // getMyOrganizations is the one bootstrap call that needs no X-Org-Id yet —
      // everything after this picks one org and every subsequent call is scoped to it.
      const { organizations: fetchedOrgs } = await api.getMyOrganizations();
      setOrgs(fetchedOrgs);
      const storedOrgId = api.getCurrentOrgId();
      const active = fetchedOrgs.find(o => o.id === storedOrgId) ?? fetchedOrgs[0] ?? null;
      if (active) {
        api.setCurrentOrgId(active.id);
        setCurrentOrgState(active);
        const [{ folders: f }, { projects: p }, { permissions }] = await Promise.all([
          api.getFolders(), api.getProjects(), api.getEffectiveMenuPermissions(),
        ]);
        setFolders(f);
        setProjects(p);
        setMenuPermissions(permissions);
        setScope({ type: 'org', id: active.id, name: active.name });
      } else {
        api.setCurrentOrgId(null);
        setCurrentOrgState(null);
        setFolders([]);
        setProjects([]);
        setMenuPermissions(null);
        setScope(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setCurrentOrg = useCallback((org: OrganizationRow) => {
    api.setCurrentOrgId(org.id);
    setCurrentOrgState(org);
    setScope({ type: 'org', id: org.id, name: org.name });
    void refresh();
  }, [refresh]);

  const createOrg = useCallback(async (name: string) => {
    const org = await api.createOrganization(name);
    setOrgs(prev => [...prev, org]);
    setCurrentOrg(org);
  }, [setCurrentOrg]);

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, folders, projects, scope, menuPermissions, isLoading, setCurrentOrg, setScope, refresh, createOrg }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
