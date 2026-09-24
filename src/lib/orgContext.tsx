import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  type FolderRow,
  type MenuPermissionLevel,
  type OrganizationRow,
  type ProjectRow,
} from './api';
import { useAuth } from './auth';

export type ScopeType = 'org' | 'folder' | 'project';

export interface Scope {
  type: ScopeType;
  id: string;
  name: string;
}

export interface ResourceGrants {
  restricted: boolean;
  connectionIds: string[];
}

interface OrgContextType {
  orgs: OrganizationRow[];
  currentOrg: OrganizationRow | null;
  folders: FolderRow[];
  projects: ProjectRow[];
  scope: Scope | null;
  /**
   * Effective per-menu permission level. `null` means the permission state
   * has not loaded for the current organization yet.
   */
  menuPermissions: Record<string, MenuPermissionLevel> | null;
  /**
   * Effective connection access for the current user.
   *
   * `restricted: false` means the caller is unrestricted within the current
   * organization. `restricted: true` means only `connectionIds` are visible.
   *
   * This is an application hint for scope-aware UI. The backend/API remains
   * the authoritative authorization boundary.
   */
  resourceGrants: ResourceGrants | null;
  isLoading: boolean;
  setCurrentOrg: (org: OrganizationRow) => void;
  setScope: (scope: Scope | null) => void;
  refresh: () => Promise<void>;
  createOrg: (name: string) => Promise<void>;
}

const OrgContext = createContext<OrgContextType | null>(null);

function normalizeNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeOrg(org: OrganizationRow): OrganizationRow {
  return {
    ...org,
    id: normalizeNonEmptyString(org.id, 'organization id'),
    name: normalizeNonEmptyString(org.name, 'organization name'),
  };
}

function normalizeScope(scope: Scope | null): Scope | null {
  if (!scope) return null;

  return {
    type: scope.type,
    id: normalizeNonEmptyString(scope.id, 'scope id'),
    name: normalizeNonEmptyString(scope.name, 'scope name'),
  };
}

function normalizeResourceGrants(
  grants: Partial<ResourceGrants> | null | undefined,
): ResourceGrants {
  const connectionIds = Array.isArray(grants?.connectionIds)
    ? Array.from(
        new Set(
          grants.connectionIds.filter(
            (id): id is string =>
              typeof id === 'string' && id.trim().length > 0,
          ),
        ),
      )
    : [];

  return {
    restricted: grants?.restricted === true,
    connectionIds,
  };
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [orgs, setOrgs] = useState<OrganizationRow[]>([]);
  const [currentOrg, setCurrentOrgState] =
    useState<OrganizationRow | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [scope, setScopeState] = useState<Scope | null>(null);
  const [menuPermissions, setMenuPermissions] =
    useState<Record<string, MenuPermissionLevel> | null>(null);
  const [resourceGrants, setResourceGrants] =
    useState<ResourceGrants | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Prevents an older refresh from overwriting state after authentication
   * changes, organization switches, or a newer refresh starts.
   */
  const refreshGeneration = useRef(0);

  /**
   * Mirror the selected scope into the API client. The server remains the
   * authorization boundary and resolves the permitted connection set itself.
   */
  const setScope = useCallback((next: Scope | null) => {
    const normalized = normalizeScope(next);

    setScopeState(normalized);
    api.setActiveScope(
      normalized
        ? {
            type: normalized.type,
            id: normalized.id,
          }
        : null,
    );
  }, []);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;

    if (!isAuthenticated) {
      api.setCurrentOrgId(null);
      api.setActiveScope(null);

      if (generation !== refreshGeneration.current) return;

      setOrgs([]);
      setCurrentOrgState(null);
      setFolders([]);
      setProjects([]);
      setMenuPermissions(null);
      setResourceGrants(null);
      setScopeState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      /**
       * This bootstrap call intentionally does not require X-Org-Id.
       * Every organization-scoped call below happens only after selecting a
       * valid organization and setting X-Org-Id.
       */
      const { organizations: fetchedOrganizations } =
        await api.getMyOrganizations();

      const fetchedOrgs = fetchedOrganizations
        .filter(
          (org): org is OrganizationRow =>
            Boolean(org) &&
            typeof org.id === 'string' &&
            typeof org.name === 'string',
        )
        .map(normalizeOrg);

      if (generation !== refreshGeneration.current) return;

      setOrgs(fetchedOrgs);

      const storedOrgId = api.getCurrentOrgId();
      const active =
        fetchedOrgs.find((org) => org.id === storedOrgId) ??
        fetchedOrgs[0] ??
        null;

      if (!active) {
        api.setCurrentOrgId(null);
        api.setActiveScope(null);

        setCurrentOrgState(null);
        setFolders([]);
        setProjects([]);
        setMenuPermissions(null);
        setResourceGrants(null);
        setScopeState(null);
        return;
      }

      /**
       * Establish the organization header before issuing parallel
       * organization-scoped requests.
       */
      api.setCurrentOrgId(active.id);
      setCurrentOrgState(active);

      const results = await Promise.allSettled([
        api.getFolders(),
        api.getProjects(),
        api.getEffectiveMenuPermissions(),
        api.getEffectiveResourceGrants(),
      ]);

      if (generation !== refreshGeneration.current) return;

      const [foldersResult, projectsResult, permissionsResult, grantsResult] =
        results;

      /**
       * Folders/projects/permissions are independent resources. A failure in
       * one should not silently erase valid data from the others.
       *
       * We intentionally retain the previous behavior of treating resource
       * grants as best-effort, but do NOT treat grant failure as "unrestricted":
       * fail-closed in the UI is safer than accidentally exposing restricted
       * connections. Backend authorization remains authoritative regardless.
       */
      if (foldersResult.status === 'fulfilled') {
        setFolders(Array.isArray(foldersResult.value.folders) ? foldersResult.value.folders : []);
      } else {
        setFolders([]);
      }

      if (projectsResult.status === 'fulfilled') {
        setProjects(
          Array.isArray(projectsResult.value.projects)
            ? projectsResult.value.projects
            : [],
        );
      } else {
        setProjects([]);
      }

      if (permissionsResult.status === 'fulfilled') {
        setMenuPermissions(
          permissionsResult.value?.permissions ?? null,
        );
      } else {
        setMenuPermissions(null);
      }

      if (grantsResult.status === 'fulfilled') {
        setResourceGrants(
          normalizeResourceGrants(grantsResult.value),
        );
      } else {
        /**
         * Unknown grants are represented as `null`, not unrestricted.
         * Callers must not interpret a failed permission lookup as access.
         */
        setResourceGrants(null);
      }

      setScopeState({
        type: 'org',
        id: active.id,
        name: active.name,
      });
      api.setActiveScope({
        type: 'org',
        id: active.id,
      });
    } catch (error) {
      /**
       * Authentication/bootstrap failures must not leave stale organization
       * state active. Preserve the error for console diagnostics without
       * exposing sensitive response details through the UI.
       */
      if (generation !== refreshGeneration.current) return;

      api.setCurrentOrgId(null);
      api.setActiveScope(null);

      setOrgs([]);
      setCurrentOrgState(null);
      setFolders([]);
      setProjects([]);
      setMenuPermissions(null);
      setResourceGrants(null);
      setScopeState(null);

      console.error('Failed to bootstrap organization context.', error);
    } finally {
      if (generation === refreshGeneration.current) {
        setIsLoading(false);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();

    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  const setCurrentOrg = useCallback(
    (org: OrganizationRow) => {
      const normalized = normalizeOrg(org);
      const generation = ++refreshGeneration.current;

      api.setCurrentOrgId(normalized.id);
      api.setActiveScope({
        type: 'org',
        id: normalized.id,
      });

      setCurrentOrgState(normalized);
      setFolders([]);
      setProjects([]);
      setMenuPermissions(null);
      setResourceGrants(null);
      setScopeState({
        type: 'org',
        id: normalized.id,
        name: normalized.name,
      });
      setIsLoading(true);

      /**
       * Fetch fresh organization-scoped data. Do not call refresh() here with
       * a stale callback while a newer switch is in flight.
       */
      void (async () => {
        try {
          const results = await Promise.allSettled([
            api.getFolders(),
            api.getProjects(),
            api.getEffectiveMenuPermissions(),
            api.getEffectiveResourceGrants(),
          ]);

          if (generation !== refreshGeneration.current) return;

          const [foldersResult, projectsResult, permissionsResult, grantsResult] =
            results;

          setFolders(
            foldersResult.status === 'fulfilled' &&
              Array.isArray(foldersResult.value.folders)
              ? foldersResult.value.folders
              : [],
          );

          setProjects(
            projectsResult.status === 'fulfilled' &&
              Array.isArray(projectsResult.value.projects)
              ? projectsResult.value.projects
              : [],
          );

          setMenuPermissions(
            permissionsResult.status === 'fulfilled'
              ? permissionsResult.value?.permissions ?? null
              : null,
          );

          setResourceGrants(
            grantsResult.status === 'fulfilled'
              ? normalizeResourceGrants(grantsResult.value)
              : null,
          );
        } catch (error) {
          if (generation !== refreshGeneration.current) return;

          setFolders([]);
          setProjects([]);
          setMenuPermissions(null);
          setResourceGrants(null);

          console.error('Failed to switch organization context.', error);
        } finally {
          if (generation === refreshGeneration.current) {
            setIsLoading(false);
          }
        }
      })();
    },
    [],
  );

  const createOrg = useCallback(async (name: string) => {
    const normalizedName = normalizeNonEmptyString(name, 'organization name');
    const organization = normalizeOrg(
      await api.createOrganization(normalizedName),
    );

    setOrgs((previous) => {
      const exists = previous.some((org) => org.id === organization.id);

      return exists
        ? previous.map((org) =>
            org.id === organization.id ? organization : org,
          )
        : [...previous, organization];
    });

    /**
     * Keep createOrg independent from the current refresh promise. Selecting
     * the new organization is treated as a new generation and fetches all
     * organization-scoped bootstrap resources cleanly.
     */
    setCurrentOrg(organization);
  }, [setCurrentOrg]);

  const contextValue = useMemo<OrgContextType>(
    () => ({
      orgs,
      currentOrg,
      folders,
      projects,
      scope,
      menuPermissions,
      resourceGrants,
      isLoading,
      setCurrentOrg,
      setScope,
      refresh,
      createOrg,
    }),
    [
      orgs,
      currentOrg,
      folders,
      projects,
      scope,
      menuPermissions,
      resourceGrants,
      isLoading,
      setCurrentOrg,
      setScope,
      refresh,
      createOrg,
    ],
  );

  return (
    <OrgContext.Provider value={contextValue}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgContextType {
  const context = useContext(OrgContext);

  if (!context) {
    throw new Error('useOrg must be used within OrgProvider');
  }

  return context;
}
