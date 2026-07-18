import { supabase } from './supabase';

const SERVICE_URLS: Record<string, string> = {
  org: import.meta.env.VITE_ORG_API_URL || 'https://cloudops360-1-org-api.workers.dev',
  cloud: import.meta.env.VITE_CLOUD_API_URL || 'https://cloudops360-1-cloud-api.workers.dev',
};

const CURRENT_ORG_STORAGE_KEY = 'cloudops360_current_org_id';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

class ApiClient {
  private currentOrgId: string | null = localStorage.getItem(CURRENT_ORG_STORAGE_KEY);

  setCurrentOrgId(orgId: string | null) {
    this.currentOrgId = orgId;
    if (orgId) localStorage.setItem(CURRENT_ORG_STORAGE_KEY, orgId);
    else localStorage.removeItem(CURRENT_ORG_STORAGE_KEY);
  }
  getCurrentOrgId(): string | null {
    return this.currentOrgId;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    if (this.currentOrgId) headers['X-Org-Id'] = this.currentOrgId;
    return headers;
  }

  private async request<T>(service: string, path: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = SERVICE_URLS[service];
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await this.authHeaders()),
      ...((options.headers as Record<string, string>) || {}),
    };
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(response.status, (error as { error?: string }).error || 'Request failed', error);
    }
    return response.json() as Promise<T>;
  }

  private get<T>(service: string, path: string) { return this.request<T>(service, path, { method: 'GET' }); }
  private post<T>(service: string, path: string, body?: unknown) { return this.request<T>(service, path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); }
  private put<T>(service: string, path: string, body?: unknown) { return this.request<T>(service, path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }); }
  private delete<T>(service: string, path: string) { return this.request<T>(service, path, { method: 'DELETE' }); }

  // ── org-api: Organizations / Folders / Projects ──────────────────────────

  getOrgs() { return this.get<{ ok: boolean; orgs: Organization[] }>('org', '/api/orgs'); }
  createOrg(name: string) { return this.post<{ ok: boolean; org: Organization }>('org', '/api/orgs', { name }); }

  getFolders(orgId: string) { return this.get<{ ok: boolean; folders: Folder[] }>('org', `/api/orgs/${orgId}/folders`); }
  createFolder(orgId: string, name: string, parentFolderId?: string) {
    return this.post<{ ok: boolean; folder: Folder }>('org', `/api/orgs/${orgId}/folders`, { name, parentFolderId });
  }
  deleteFolder(id: string) { return this.delete<{ ok: boolean }>('org', `/api/folders/${id}`); }

  getProjects(orgId: string) { return this.get<{ ok: boolean; projects: Project[] }>('org', `/api/orgs/${orgId}/projects`); }
  createProject(orgId: string, name: string, folderId?: string) {
    return this.post<{ ok: boolean; project: Project }>('org', `/api/orgs/${orgId}/projects`, { name, folderId });
  }
  deleteProject(id: string) { return this.delete<{ ok: boolean }>('org', `/api/projects/${id}`); }

  // ── org-api: Users, Groups & audit ─────────────────────────────────────

  getMembers(orgId: string) { return this.get<{ ok: boolean; members: Member[]; pendingInvites: PendingInvite[] }>('org', `/api/orgs/${orgId}/members`); }
  inviteMember(orgId: string, email: string, role: Role) {
    return this.post<{ ok: boolean; alreadyRegistered: boolean }>('org', `/api/orgs/${orgId}/invite`, { email, role });
  }
  updateRoleGrant(id: string, role: Role) { return this.put<{ ok: boolean }>('org', `/api/role-grants/${id}`, { role }); }
  deleteRoleGrant(id: string) { return this.delete<{ ok: boolean }>('org', `/api/role-grants/${id}`); }

  getGroups(orgId: string) { return this.get<{ ok: boolean; groups: Group[] }>('org', `/api/orgs/${orgId}/groups`); }
  createGroup(orgId: string, name: string) { return this.post<{ ok: boolean; group: Group }>('org', `/api/orgs/${orgId}/groups`, { name }); }
  deleteGroup(id: string) { return this.delete<{ ok: boolean }>('org', `/api/groups/${id}`); }
  addGroupMember(groupId: string, userId: string) { return this.post<{ ok: boolean }>('org', `/api/groups/${groupId}/members`, { userId }); }
  removeGroupMember(groupId: string, userId: string) { return this.delete<{ ok: boolean }>('org', `/api/groups/${groupId}/members/${userId}`); }

  getAuditLog(orgId: string) { return this.get<{ ok: boolean; entries: AuditLogEntry[] }>('org', `/api/orgs/${orgId}/audit-log`); }

  // ── cloud-api: AWS connections + discovery ────────────────────────────

  getPlatformStatus() { return this.get<{ ok: boolean; encryptionConfigured: boolean }>('cloud', '/api/platform-status'); }

  getConnections(projectId?: string) {
    const qs = projectId ? `?project_id=${projectId}` : '';
    return this.get<{ ok: boolean; connections: CloudConnection[] }>('cloud', `/api/connections${qs}`);
  }
  createConnection(data: {
    connectionMethod: 'access_key' | 'cross_account_role';
    awsAccountId: string; accessKeyId?: string; secretAccessKey?: string;
    roleArn?: string; externalId?: string; defaultRegion?: string;
    projectId?: string; connectionName?: string; environment?: string;
  }) {
    return this.post<{ ok: boolean; connection: CloudConnection }>('cloud', '/api/connections', data);
  }
  testConnection(id: string) { return this.post<{ ok: boolean; success: boolean; detail: string }>('cloud', `/api/connections/${id}/test`); }
  updateConnection(id: string, data: { environment?: string; connectionName?: string; projectId?: string }) {
    return this.put<{ ok: boolean }>('cloud', `/api/connections/${id}`, data);
  }
  deleteConnection(id: string) { return this.delete<{ ok: boolean }>('cloud', `/api/connections/${id}`); }

  // Stepped discovery — one scanner per request, so a free-tier Cloudflare Worker
  // never has to do enough work in one invocation to get killed by the platform.
  // See discovery.ts's module comment for why. Drive with runDiscoverySteps() below.
  planDiscovery(id: string) { return this.post<{ ok: boolean; runStartedAt: string; region: string; steps: string[] }>('cloud', `/api/connections/${id}/discover?mode=plan`); }
  discoverStep(id: string, stepId: string, runStartedAt: string) {
    return this.post<{ ok: boolean; stepId: string; resourceCount: number; created: number; error?: string }>(
      'cloud', `/api/connections/${id}/discover?mode=step&step=${encodeURIComponent(stepId)}&runStartedAt=${encodeURIComponent(runStartedAt)}`,
    );
  }
  finalizeDiscovery(id: string, runStartedAt: string) {
    return this.post<{ ok: boolean; scanned: number; created: number; deleted: number; errors: string[] }>(
      'cloud', `/api/connections/${id}/discover?mode=finalize&runStartedAt=${encodeURIComponent(runStartedAt)}`,
    );
  }
  /** Runs the full plan -> step*N -> finalize sequence, reporting progress via onProgress. */
  async runDiscoverySteps(id: string, onProgress?: (done: number, total: number, stepId: string) => void) {
    const plan = await this.planDiscovery(id);
    for (let i = 0; i < plan.steps.length; i++) {
      onProgress?.(i, plan.steps.length, plan.steps[i]);
      await this.discoverStep(id, plan.steps[i], plan.runStartedAt);
    }
    onProgress?.(plan.steps.length, plan.steps.length, 'finalizing');
    return this.finalizeDiscovery(id, plan.runStartedAt);
  }

  syncConnectionCost(id: string) { return this.post<{ ok: boolean; daysSynced: number; rowsUpserted: number; error?: string }>('cloud', `/api/connections/${id}/sync-cost`); }
  generateRecommendations(id: string) { return this.post<{ ok: boolean; created: number }>('cloud', `/api/connections/${id}/generate-recommendations`); }

  // ── cloud-api: Resources ────────────────────────────────────────────────

  getResources(params: { category?: string; service?: string; region?: string; status?: string; resourceTypeKey?: string; search?: string; connectionId?: string; limit?: number; offset?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.service) qs.set('service', params.service);
    if (params.region) qs.set('region', params.region);
    if (params.status) qs.set('status', params.status);
    if (params.resourceTypeKey) qs.set('resource_type_key', params.resourceTypeKey);
    if (params.search) qs.set('search', params.search);
    if (params.connectionId) qs.set('connection_id', params.connectionId);
    qs.set('limit', String(params.limit ?? 100));
    qs.set('offset', String(params.offset ?? 0));
    return this.get<{ ok: boolean; resources: CloudResource[]; total: number }>('cloud', `/api/resources?${qs.toString()}`);
  }
  getResource(id: string) { return this.get<{ ok: boolean; resource: CloudResource }>('cloud', `/api/resources/${id}`); }
  getResourceStats() { return this.get<{ ok: boolean; total: number; byCategory: Record<string, number>; byRegion: Record<string, number>; byStatus: Record<string, number>; defaultCount: number }>('cloud', '/api/resources/stats'); }
  getResourceTrend(days = 30) { return this.get<{ ok: boolean; points: { date: string; created: number; deleted: number; net: number }[] }>('cloud', `/api/resources/trend?days=${days}`); }
  getResourceCatalog() { return this.get<{ ok: boolean; catalog: ResourceCatalogEntry[]; categories: string[] }>('cloud', '/api/resource-catalog'); }

  // ── cloud-api: Cost ──────────────────────────────────────────────────────

  getCostSummary(days = 30) {
    return this.get<{ ok: boolean; mtdCost: number; forecastCost: number; avgDailyCost: number; byService: { service: string; cost: number }[]; byAccount: { accountId: string; cost: number }[]; byRegion: { region: string; cost: number }[]; daily: { date: string; cost: number }[] }>('cloud', `/api/cost/summary?days=${days}`);
  }
  getCostAnomalies() { return this.get<{ ok: boolean; anomalies: CostAnomaly[] }>('cloud', '/api/cost/anomalies'); }
  getCostRecommendations(status?: string) { return this.get<{ ok: boolean; recommendations: CostRecommendation[] }>('cloud', `/api/cost/recommendations${status ? `?status=${status}` : ''}`); }
  updateCostRecommendation(id: string, status: 'applied' | 'dismissed') { return this.put<{ ok: boolean }>('cloud', `/api/cost/recommendations/${id}`, { status }); }
}

export const api = new ApiClient();

// ── Types ────────────────────────────────────────────────────────────────

export type Role = 'owner' | 'admin' | 'editor' | 'viewer' | 'billing_admin';

export interface Organization { id: string; name: string; slug: string; createdBy: string; createdAt: string; plan: string; seats: number; myRole?: Role }
export interface Folder { id: string; orgId: string; parentFolderId: string | null; name: string; monthlyBudget: number | null; requiredTags: string[]; allowedRegions: string[]; createdAt: string }
export interface Project { id: string; orgId: string; folderId: string | null; name: string; slug: string; monthlyBudget: number | null; createdAt: string }
export interface Member { userId: string; email: string; fullName: string | null; role: Role; roleGrantId: string }
export interface PendingInvite { id: string; email: string; role: Role; invitedAt: string }
export interface Group { id: string; orgId: string; name: string; createdAt: string; members: { userId: string; email: string; fullName: string | null }[] }
export interface AuditLogEntry { id: string; orgId: string; actorId: string | null; actorEmail?: string; action: string; targetType: string | null; targetId: string | null; metadata: Record<string, unknown>; createdAt: string }

export type Environment = 'production' | 'staging' | 'dev' | 'sandbox' | 'qa' | 'security' | 'dr' | 'legacy';

export interface CloudConnection {
  id: string; orgId: string; projectId: string | null; connectionMethod: 'access_key' | 'cross_account_role';
  awsAccountId: string; connectionName: string | null; maskedAccessKey: string | null; roleArn: string | null;
  defaultRegion: string; status: 'pending' | 'connected' | 'error' | 'disconnected' | 'expired'; environment: Environment;
  supportPlan: string | null;
  resourceSummary?: { totalResources?: number; categoryCounts?: Record<string, number>; servicesScanned?: number; servicesTotal?: string; regionsScanned?: string[]; errors?: string[]; scannedAt?: string } | null;
  lastDiscoveryAt: string | null; lastFullScanAt: string | null; lastSyncAt: string | null; keyRotatedAt: string | null;
  keyRotationDueAt: string | null; errorMessage: string | null; createdAt: string;
}

export type ResourceCategory = 'Compute' | 'Storage' | 'Database' | 'Networking' | 'Security' | 'Containers' | 'Analytics' | 'Management' | 'Others';

export interface ResourceCatalogEntry {
  key: string; service: string; resourceType: string; displayName: string; category: ResourceCategory;
  scannerStatus: 'live' | 'planned'; isDefaultCapable: boolean; consoleUrlTemplate?: string;
}

export interface CloudResource {
  id: string; connectionId: string; accountId: string; resourceTypeKey: string; displayName: string;
  resourceId: string; resourceName: string | null; region: string | null; category: string; service: string;
  state: string | null; status: string; isDefault: boolean; costMonthly: number | null;
  tags: Record<string, string>; metadata: Record<string, unknown>; relationships: Record<string, unknown>;
  firstSeenAt: string; lastSeenAt: string; deletedAt: string | null; consoleUrl?: string;
}

export interface CostAnomaly { id: string; connection_id: string; service: string; usage_date: string; expected_cost: number; actual_cost: number; percent_change: number; dollar_impact: number; status: string }
export interface CostRecommendation { id: string; connection_id: string; resource_id: string | null; category: string; issue: string; recommended_action: string; potential_monthly_savings: number; priority: 'high' | 'medium' | 'low'; status: 'open' | 'applied' | 'dismissed'; created_at: string; cloud_resources?: { resource_name: string | null; resource_type_key: string } }
