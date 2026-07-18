import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, type Organization, type Folder, type Project } from './api';
import { useAuth } from './auth';

export type ScopeType = 'org' | 'folder' | 'project';
export interface Scope { type: ScopeType; id: string; name: string }

interface OrgContextType {
  orgs: Organization[];
  currentOrg: Organization | null;
  folders: Folder[];
  projects: Project[];
  scope: Scope | null;
  isLoading: boolean;
  setCurrentOrg: (org: Organization) => void;
  setScope: (scope: Scope | null) => void;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<Scope | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const { orgs: fetchedOrgs } = await api.getOrgs();
      setOrgs(fetchedOrgs);
      const storedOrgId = api.getCurrentOrgId();
      const active = fetchedOrgs.find(o => o.id === storedOrgId) ?? fetchedOrgs[0] ?? null;
      if (active) {
        api.setCurrentOrgId(active.id);
        setCurrentOrgState(active);
        const [{ folders: f }, { projects: p }] = await Promise.all([api.getFolders(active.id), api.getProjects(active.id)]);
        setFolders(f);
        setProjects(p);
        setScope({ type: 'org', id: active.id, name: active.name });
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void refresh(); }, [refresh]);

  const setCurrentOrg = useCallback((org: Organization) => {
    api.setCurrentOrgId(org.id);
    setCurrentOrgState(org);
    setScope({ type: 'org', id: org.id, name: org.name });
    void refresh();
  }, [refresh]);

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, folders, projects, scope, isLoading, setCurrentOrg, setScope, refresh }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
