import { supabase } from './supabase';

// Every one of the 15 domain Workers deploys as cloudops360-1-<domain>-api.<subdomain>
// — subdomain is not sensitive (it's public in every Workers URL), so it's a safe default.
const SUBDOMAIN = import.meta.env.VITE_WORKERS_SUBDOMAIN || 'thequietmind18.workers.dev';

type Service =
  | 'overview' | 'awsAccounts' | 'gcpAccounts' | 'resources' | 'customDashboards' | 'costManagement'
  | 'costOptimization' | 'vulnerabilityManagement' | 'containers' | 'monitoring' | 'alerts'
  | 'reports' | 'users' | 'organizationManagement' | 'automation' | 'settings' | 'billing' | 'aiCopilot';

export { isBillingEnabled } from './featureFlags';

const SERVICE_URLS: Record<Service, string> = {
  overview: import.meta.env.VITE_OVERVIEW_API_URL || `https://cloudops360-1-overview-api.${SUBDOMAIN}`,
  awsAccounts: import.meta.env.VITE_AWS_ACCOUNTS_API_URL || `https://cloudops360-1-aws-accounts-api.${SUBDOMAIN}`,
  gcpAccounts: import.meta.env.VITE_GCP_ACCOUNTS_API_URL || `https://cloudops360-1-gcp-accounts-api.${SUBDOMAIN}`,
  resources: import.meta.env.VITE_RESOURCES_API_URL || `https://cloudops360-1-resources-api.${SUBDOMAIN}`,
  customDashboards: import.meta.env.VITE_CUSTOM_DASHBOARDS_API_URL || `https://cloudops360-1-custom-dashboards-api.${SUBDOMAIN}`,
  costManagement: import.meta.env.VITE_COST_MANAGEMENT_API_URL || `https://cloudops360-1-cost-management-api.${SUBDOMAIN}`,
  costOptimization: import.meta.env.VITE_COST_OPTIMIZATION_API_URL || `https://cloudops360-1-cost-optimization-api.${SUBDOMAIN}`,
  vulnerabilityManagement: import.meta.env.VITE_VULNERABILITY_MANAGEMENT_API_URL || `https://cloudops360-1-vulnerability-management-api.${SUBDOMAIN}`,
  containers: import.meta.env.VITE_CONTAINERS_API_URL || `https://cloudops360-1-containers-api.${SUBDOMAIN}`,
  monitoring: import.meta.env.VITE_MONITORING_API_URL || `https://cloudops360-1-monitoring-api.${SUBDOMAIN}`,
  alerts: import.meta.env.VITE_ALERTS_API_URL || `https://cloudops360-1-alerts-api.${SUBDOMAIN}`,
  reports: import.meta.env.VITE_REPORTS_API_URL || `https://cloudops360-1-reports-api.${SUBDOMAIN}`,
  users: import.meta.env.VITE_USERS_API_URL || `https://cloudops360-1-users-api.${SUBDOMAIN}`,
  organizationManagement: import.meta.env.VITE_ORGANIZATION_MANAGEMENT_API_URL || `https://cloudops360-1-organization-management-api.${SUBDOMAIN}`,
  automation: import.meta.env.VITE_AUTOMATION_API_URL || `https://cloudops360-1-automation-api.${SUBDOMAIN}`,
  settings: import.meta.env.VITE_SETTINGS_API_URL || `https://cloudops360-1-settings-api.${SUBDOMAIN}`,
  billing: import.meta.env.VITE_BILLING_API_URL || '',
  aiCopilot: import.meta.env.VITE_AI_COPILOT_API_URL || '',
};

/** The two services that expose the identical account-connect + stepped-discovery contract — see getDiscoverySteps/runDiscoveryStep/finalizeDiscovery/testAccount below. */
export type CloudAccountService = 'awsAccounts' | 'gcpAccounts';
function accountsPathPrefix(service: CloudAccountService): string {
  return service === 'gcpAccounts' ? '/api/gcp-accounts' : '/api/aws-accounts';
}

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

const HTTP_ERROR_MESSAGES: Record<number, string> = {
  401: 'Your session has expired — please sign in again.',
  403: "You don't have permission to do that.",
  404: "That couldn't be found — it may have been moved or deleted.",
  429: 'Too many requests — please wait a moment and try again.',
  500: 'Something went wrong on our end. Please try again.',
  503: 'This service is temporarily unavailable — please try again shortly.',
};

/**
 * Maps a caught error to a short, user-facing message instead of whatever
 * raw string the backend returned (a stack trace fragment, a Postgres
 * constraint name, "Forbidden") for the handful of HTTP statuses common
 * enough to deserve a friendly, consistent message everywhere they show up.
 * Anything else -- an ApiError with an unrecognized status, or a non-ApiError
 * throw -- falls back to the error's own message, and a non-Error throw
 * falls back to `fallback`. Generalizes the 403-detection AdminBilling.tsx
 * used to do inline; use this in any page's catch block instead.
 */
export function friendlyErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof ApiError) return HTTP_ERROR_MESSAGES[err.status] ?? err.message ?? fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

export interface Pagination { page: number; limit: number; total: number; totalPages: number }
export interface Paginated<T> { items: T[]; pagination: Pagination }
export interface NotIntegrated { items: []; notIntegrated: true; reason: string }

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
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

  /** Every one of the 15 services replies with either { ok: true, data } or { ok: false, error }. This unwraps it, or throws ApiError. */
  private async request<T>(service: Service, path: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = SERVICE_URLS[service];
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(await this.authHeaders()),
      ...((options.headers as Record<string, string>) || {}),
    };
    const response = await fetch(url, { ...options, headers });
    const body = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: string } | null;
    if (!response.ok || !body?.ok) {
      throw new ApiError(response.status, body?.error || response.statusText || 'Request failed', body);
    }
    return body.data as T;
  }

  private get<T>(service: Service, path: string) { return this.request<T>(service, path, { method: 'GET' }); }
  private post<T>(service: Service, path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>(service, path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined, headers });
  }
  /** Generates a fresh Idempotency-Key per call — pass the SAME key across a retry (e.g. store it in component state across a failed attempt) if you want the backend to actually dedupe; a brand new key every call defeats the point. */
  private postIdempotent<T>(service: Service, path: string, body: unknown, idempotencyKey: string) {
    return this.post<T>(service, path, body, { 'Idempotency-Key': idempotencyKey });
  }
  private put<T>(service: Service, path: string, body?: unknown) { return this.request<T>(service, path, { method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }); }
  private patch<T>(service: Service, path: string, body?: unknown) { return this.request<T>(service, path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }); }
  private delete<T>(service: Service, path: string) { return this.request<T>(service, path, { method: 'DELETE' }); }

  /** For the two endpoints that return a raw file instead of the {ok,data} envelope (CSV export, report download). */
  private async downloadRaw(service: Service, path: string, fallbackFilename: string): Promise<{ blob: Blob; filename: string }> {
    const baseUrl = SERVICE_URLS[service];
    const response = await fetch(`${baseUrl}${path}`, { headers: await this.authHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new ApiError(response.status, error.error || 'Download failed', error);
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    return { blob: await response.blob(), filename: match?.[1] ?? fallbackFilename };
  }

  // ── overview-api ─────────────────────────────────────────────────────────

  getOverviewDashboard(params: { region?: string } = {}) { return this.get<OverviewDashboard>('overview', `/api/overview/dashboard${qs(params)}`); }
  getOverviewResources(connectionIds?: string[]) { return this.get<{ total: number; byCategory: Record<string, number> }>('overview', `/api/overview/resources${qs({ connection_ids: connectionIds?.join(',') })}`); }
  getOverviewCost(connectionIds?: string[]) { return this.get<{ monthToDate: number; currency: string }>('overview', `/api/overview/cost${qs({ connection_ids: connectionIds?.join(',') })}`); }
  getOverviewSecurity(connectionIds?: string[]) { return this.get<{ openFindings: number; bySeverity: Record<string, number> }>('overview', `/api/overview/security${qs({ connection_ids: connectionIds?.join(',') })}`); }
  getOverviewMonitoring(connectionIds?: string[]) { return this.get<{ totalAlarms: number; inAlarm: number }>('overview', `/api/overview/monitoring${qs({ connection_ids: connectionIds?.join(',') })}`); }
  getRecentActivity(page = 1, limit = 8, from?: string) { return this.get<Paginated<ActivityEntry>>('overview', `/api/overview/activity${qs({ page, limit, from })}`); }
  getFavorites() { return this.get<{ favorites: Favorite[] }>('overview', '/api/overview/favorites'); }
  addFavorite(data: { type: string; label: string; path: string }) { return this.post<{ favorite: Favorite }>('overview', '/api/overview/favorites', data); }
  removeFavorite(id: string) { return this.delete<{ removed: string }>('overview', `/api/overview/favorites/${id}`); }
  getQuickActions() { return this.get<{ actions: QuickAction[] }>('overview', '/api/overview/quick-actions'); }

  // ── aws-accounts-api ─────────────────────────────────────────────────────

  getAccounts(params: { status?: string; environment?: string; connectionMethod?: string; region?: string; search?: string; sort?: string; sortDir?: 'asc' | 'desc'; page?: number; limit?: number } = {}) {
    return this.get<Paginated<CloudConnection>>('awsAccounts', `/api/aws-accounts/accounts${qs(params)}`);
  }
  getAccount(id: string) { return this.get<CloudConnection>('awsAccounts', `/api/aws-accounts/accounts/${id}`); }
  createAccount(data: {
    connectionName: string; connectionMethod: 'access_key' | 'cross_account_role'; awsAccountId: string;
    accessKeyId?: string; secretAccessKey?: string; roleArn?: string; externalId?: string;
    defaultRegion?: string; environment?: string; scanRegions?: string[]; projectId?: string;
  }) {
    return this.post<CloudConnection>('awsAccounts', '/api/aws-accounts/accounts', data);
  }
  updateAccount(id: string, data: { connectionName?: string; environment?: string; projectId?: string | null; defaultRegion?: string; scanRegions?: string[]; supportPlan?: string | null }) {
    return this.put<CloudConnection>('awsAccounts', `/api/aws-accounts/accounts/${id}`, data);
  }
  disconnectAccount(id: string) { return this.delete<{ disconnected: string }>('awsAccounts', `/api/aws-accounts/accounts/${id}`); }
  deleteAccountPermanently(id: string) { return this.delete<{ deleted: string }>('awsAccounts', `/api/aws-accounts/accounts/${id}/permanently`); }
  updateAccountCredentials(id: string, data: { accessKeyId: string; secretAccessKey: string }) {
    return this.put<CloudConnection>('awsAccounts', `/api/aws-accounts/accounts/${id}/credentials`, data);
  }
  updateAccountRole(id: string, data: { roleArn: string; externalId: string }) {
    return this.put<CloudConnection>('awsAccounts', `/api/aws-accounts/accounts/${id}/role`, data);
  }
  testAccount(id: string, service: CloudAccountService = 'awsAccounts') {
    return this.post<{ credentialsPresent: boolean; liveValidation: false; message: string }>(service, `${accountsPathPrefix(service)}/accounts/${id}/test`);
  }

  // Real resource discovery — one request per step, kept small enough to fit
  // Cloudflare's free-tier CPU/subrequest budget per invocation. Shared
  // between AWS and GCP (both aws-accounts-api and gcp-accounts-api expose
  // the identical steps/run-step/finalize contract) via the `service` param
  // — syncContext.tsx's polling loop is provider-agnostic because of this.
  getDiscoverySteps(id: string, service: CloudAccountService = 'awsAccounts') {
    return this.get<{ steps: string[]; regions: string[]; scannerCount: number }>(service, `${accountsPathPrefix(service)}/accounts/${id}/discovery/steps`);
  }
  runDiscoveryStep(id: string, stepId: string, service: CloudAccountService = 'awsAccounts') {
    return this.post<{ stepId: string; resourceCount: number; created: number; error?: string; errorSeverity?: 'error' | 'info' }>(service, `${accountsPathPrefix(service)}/accounts/${id}/discovery/run-step`, { stepId });
  }
  finalizeDiscovery(id: string, runStartedAt: string, stepErrors: { message: string; severity: 'error' | 'info' }[], service: CloudAccountService = 'awsAccounts', totalSteps = 0) {
    return this.post<{ totalResources: number; deleted: number; categoryCounts: Record<string, number>; errors: { message: string; severity: 'error' | 'info' }[] }>(service, `${accountsPathPrefix(service)}/accounts/${id}/discovery/finalize`, { runStartedAt, stepErrors, totalSteps });
  }

  // ── gcp-accounts-api ─────────────────────────────────────────────────────
  // GCP Phase 1: Compute Engine, Cloud Storage, Cloud SQL, GKE. Kept as its
  // own separate method set (not merged into the AWS ones above) — the
  // "Cloud Accounts" rename is a rename, not a unification; see navConfig.ts.

  getGcpAccounts(params: { status?: string; environment?: string; connectionMethod?: string; search?: string; sort?: string; sortDir?: 'asc' | 'desc'; page?: number; limit?: number } = {}) {
    return this.get<Paginated<GcpConnection>>('gcpAccounts', `/api/gcp-accounts/accounts${qs(params)}`);
  }
  getGcpAccount(id: string) { return this.get<GcpConnection>('gcpAccounts', `/api/gcp-accounts/accounts/${id}`); }
  createGcpAccount(data: {
    connectionName: string; connectionMethod: 'service_account_key' | 'service_account_impersonation'; gcpProjectId: string;
    serviceAccountKeyJson?: string; impersonatedServiceAccount?: string;
    defaultRegion?: string; environment?: string; scanRegions?: string[]; projectId?: string;
  }) {
    return this.post<GcpConnection>('gcpAccounts', '/api/gcp-accounts/accounts', data);
  }
  updateGcpAccount(id: string, data: { connectionName?: string; environment?: string; projectId?: string | null; defaultRegion?: string; scanRegions?: string[] }) {
    return this.put<GcpConnection>('gcpAccounts', `/api/gcp-accounts/accounts/${id}`, data);
  }
  disconnectGcpAccount(id: string) { return this.delete<{ disconnected: string }>('gcpAccounts', `/api/gcp-accounts/accounts/${id}`); }
  deleteGcpAccountPermanently(id: string) { return this.delete<{ deleted: string }>('gcpAccounts', `/api/gcp-accounts/accounts/${id}/permanently`); }
  updateGcpAccountCredentials(id: string, data: { serviceAccountKeyJson: string }) {
    return this.put<GcpConnection>('gcpAccounts', `/api/gcp-accounts/accounts/${id}/credentials`, data);
  }

  getAwsAccountsDashboard() {
    return this.get<AwsAccountsDashboard>('awsAccounts', '/api/aws-accounts/dashboard');
  }
  getAccountsSyncStatus() { return this.get<{ accounts: AccountSummary[] }>('awsAccounts', '/api/aws-accounts/sync-status'); }
  getAccountsHealth() { return this.get<{ healthy: number; unhealthy: number; total: number; accounts: AccountSummary[] }>('awsAccounts', '/api/aws-accounts/health'); }
  getAwsOrganizations() { return this.get<{ awsAccounts: { awsAccountId: string; connections: { aws_account_id: string; connection_name: string; environment: string; status: string }[] }[] }>('awsAccounts', '/api/aws-accounts/organizations'); }

  // Real AWS permission/connection validation (sts:GetCallerIdentity + IAM/Organizations/CloudWatch/CloudTrail/Tagging/Cost Explorer probes)
  validateAccountPermissions(id: string) {
    return this.post<{ status: 'succeeded' | 'failed'; identity: IdentitySummary | null; checks: PermissionCheckResult[] }>('awsAccounts', `/api/aws-accounts/accounts/${id}/permissions/validate`);
  }
  getAccountPermissions(id: string) {
    return this.get<{ run: ValidationRun | null; checks: PermissionCheckResult[] }>('awsAccounts', `/api/aws-accounts/accounts/${id}/permissions`);
  }
  getAccountSyncHistory(id: string) { return this.get<{ runs: ValidationRun[] }>('awsAccounts', `/api/aws-accounts/accounts/${id}/sync-history`); }
  getAwsAccountsPermissionsSummary() { return this.get<{ accounts: AccountPermissionSummary[] }>('awsAccounts', '/api/aws-accounts/permissions'); }

  getAwsAccountsRegions() { return this.get<{ regions: { region: string; resourceCount: number; accountsEnabled: number; accountsWithResources: number }[] }>('awsAccounts', '/api/aws-accounts/regions'); }
  getAccountRegions(id: string) { return this.get<{ regions: { region: string; isDefault: boolean; resourceCount: number; lastScan: string | null }[] }>('awsAccounts', `/api/aws-accounts/accounts/${id}/regions`); }

  getAccountCost(id: string) { return this.get<{ monthToDate: number; byService: Record<string, number> }>('awsAccounts', `/api/aws-accounts/accounts/${id}/cost`); }
  syncAccountCost(id: string) { return this.post<{ synced: number; start: string; end: string }>('awsAccounts', `/api/aws-accounts/accounts/${id}/cost/sync`); }
  getAwsAccountsCostSummary() { return this.get<{ topCostAccounts: { connectionId: string; connectionName: string; monthToDate: number }[]; totalMonthToDate: number }>('awsAccounts', '/api/aws-accounts/cost-summary'); }

  getAccountRecommendations(id: string) { return this.get<{ recommendations: CostRecommendation[] }>('awsAccounts', `/api/aws-accounts/accounts/${id}/recommendations`); }
  getAwsAccountsRecommendationsSummary() { return this.get<{ openRecommendations: number; totalPotentialMonthlySavings: number }>('awsAccounts', '/api/aws-accounts/recommendations'); }

  getAccountActivity(id: string, params: { action?: string; actorId?: string; from?: string; to?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<ActivityEntry>>('awsAccounts', `/api/aws-accounts/accounts/${id}/activity${qs(params)}`); }
  getAwsAccountsActivity(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<ActivityEntry>>('awsAccounts', `/api/aws-accounts/activity${qs(params)}`); }
  getAccountCloudTrailEvents(id: string, params: { region?: string; attributeKey?: string; attributeValue?: string; from?: string; to?: string; nextToken?: string } = {}) {
    return this.get<{ events: CloudTrailEvent[]; nextToken: string | null; region: string }>('awsAccounts', `/api/aws-accounts/accounts/${id}/cloudtrail-events${qs(params)}`);
  }

  async downloadAwsAccountsReport(kind: 'account-summary' | 'health' | 'permissions' | 'sync' | 'cost') {
    return this.downloadRaw('awsAccounts', `/api/aws-accounts/reports/${kind}`, `aws-accounts-${kind}.csv`);
  }
  getCrossAccountRoles() { return this.get<{ roles: CrossAccountRole[] }>('awsAccounts', '/api/aws-accounts/cross-account-roles'); }
  getAccountCredentials(id: string) {
    return this.get<{ connectionMethod: string; maskedAccessKey: string | null; keyRotatedAt: string | null; rotationDueInDays: number | null; roleArn: string | null; externalId: string | null }>('awsAccounts', `/api/aws-accounts/credentials/${id}`);
  }

  // Safe Automated Remediation — real AWS mutation calls (StopInstances/StartInstances/ReleaseAddress/DeleteVolume/DeleteSnapshot/DeregisterImage/ModifyInstanceAttribute) using the connection's own credentials, gated by request -> approve -> dry-run -> execute.
  listRemediation(params: { status?: string; connectionId?: string } = {}) { return this.get<{ items: RemediationRequest[] }>('awsAccounts', `/api/aws-accounts/remediation${qs(params)}`); }
  requestRemediation(data: { connectionId: string; resourceId: string; actionType: RemediationActionType; recommendationId?: string; targetConfig?: { targetInstanceType?: string } }) {
    return this.post<RemediationRequest>('awsAccounts', '/api/aws-accounts/remediation/request', data);
  }
  approveRemediation(id: string) { return this.post<RemediationRequest>('awsAccounts', `/api/aws-accounts/remediation/${id}/approve`); }
  rejectRemediation(id: string) { return this.post<RemediationRequest>('awsAccounts', `/api/aws-accounts/remediation/${id}/reject`); }
  dryRunRemediation(id: string) { return this.post<RemediationRequest>('awsAccounts', `/api/aws-accounts/remediation/${id}/dry-run`); }
  executeRemediation(id: string) { return this.post<RemediationRequest>('awsAccounts', `/api/aws-accounts/remediation/${id}/execute`); }
  /** Polled by the caller (Automation's Remediation tab) while a resize_instance request sits in 'awaiting_stop' — AWS's StopInstances is async, so this re-checks live state each call and only finishes (ModifyInstanceAttribute + StartInstances) once the instance is actually stopped. */
  finishResizeRemediation(id: string) { return this.post<RemediationRequest>('awsAccounts', `/api/aws-accounts/remediation/${id}/finish-resize`); }
  rollbackRemediation(id: string) { return this.post<RemediationRequest>('awsAccounts', `/api/aws-accounts/remediation/${id}/rollback`); }

  // GCP's own Safe Automated Remediation — same remediation_requests table (provider='gcp'), same request -> approve -> dry-run -> execute lifecycle, currently stop_instance/start_instance only (see gcp-accounts-api/src/routes/remediation.ts).
  listGcpRemediation(params: { status?: string; connectionId?: string } = {}) { return this.get<{ items: RemediationRequest[] }>('gcpAccounts', `/api/gcp-accounts/remediation${qs(params)}`); }
  requestGcpRemediation(data: { connectionId: string; resourceId: string; actionType: 'stop_instance' | 'start_instance'; recommendationId?: string }) {
    return this.post<RemediationRequest>('gcpAccounts', '/api/gcp-accounts/remediation/request', data);
  }
  approveGcpRemediation(id: string) { return this.post<RemediationRequest>('gcpAccounts', `/api/gcp-accounts/remediation/${id}/approve`); }
  rejectGcpRemediation(id: string) { return this.post<RemediationRequest>('gcpAccounts', `/api/gcp-accounts/remediation/${id}/reject`); }
  dryRunGcpRemediation(id: string) { return this.post<RemediationRequest>('gcpAccounts', `/api/gcp-accounts/remediation/${id}/dry-run`); }
  executeGcpRemediation(id: string) { return this.post<RemediationRequest>('gcpAccounts', `/api/gcp-accounts/remediation/${id}/execute`); }

  // Cost & Usage Report (CUR) ingestion — real per-resource cost, populating resource_costs for the existing Cost Allocation/Chargeback/Showback pages in cost-management-api.
  discoverCur(id: string) { return this.post<{ reportName: string; bucket: string; prefix: string; region: string }>('awsAccounts', `/api/aws-accounts/accounts/${id}/cur/discover`); }
  getCurManifest(id: string) { return this.get<{ billingPeriod: string; reportKeys: string[] }>('awsAccounts', `/api/aws-accounts/accounts/${id}/cur/manifest`); }
  ingestCurStep(id: string, reportKey: string, skipRows: number) {
    return this.post<{ rowsProcessed: number; rowsIngestedThisBatch: number; done: boolean }>('awsAccounts', `/api/aws-accounts/accounts/${id}/cur/ingest-step`, { reportKey, skipRows });
  }
  finalizeCur(id: string) { return this.post<{ syncedAt: string }>('awsAccounts', `/api/aws-accounts/accounts/${id}/cur/finalize`); }

  // ── resources-api ────────────────────────────────────────────────────────

  getResourcesDashboard(params: { region?: string; days?: number; connectionId?: string } = {}) {
    return this.get<{ total: number; byCategory: Record<string, number>; byStatus: Record<string, number>; byRegion: Record<string, number>; trendDays: number; trend30d: { date: string; created: number; deleted: number }[] }>('resources', `/api/resources/dashboard${qs(params)}`);
  }
  getResourceInventory(params: { connectionId?: string; category?: string; service?: string; region?: string; status?: string; search?: string; includeDeleted?: boolean; page?: number; limit?: number } = {}) {
    return this.get<Paginated<CloudResource>>('resources', `/api/resources/inventory${qs(params)}`);
  }
  getResource(id: string) { return this.get<CloudResource>('resources', `/api/resources/inventory/${id}`); }
  getResourceExplorer(params: { connectionId?: string; region?: string } = {}) { return this.get<{ total: number; categories: { category: string; total: number; services: { service: string; count: number }[] }[] }>('resources', `/api/resources/explorer${qs(params)}`); }
  getResourceExplorerCategory(category: string, params: { page?: number; limit?: number } = {}) {
    return this.get<Paginated<CloudResource>>('resources', `/api/resources/explorer/${encodeURIComponent(category)}${qs(params)}`);
  }
  getResourceExplorerService(category: string, service: string, params: { page?: number; limit?: number } = {}) {
    return this.get<Paginated<CloudResource>>('resources', `/api/resources/explorer/${encodeURIComponent(category)}/${encodeURIComponent(service)}${qs(params)}`);
  }
  searchResources(q: string, connectionId?: string) { return this.get<{ query: string; items: CloudResource[]; capped?: boolean }>('resources', `/api/resources/search${qs({ q, connectionId })}`); }
  getResourceRelationships(id: string) { return this.get<{ resource: { id: string; resourceId: string; resourceName: string | null }; relationships: unknown }>('resources', `/api/resources/${id}/relationships`); }
  getDependencyGraph(resourceId: string) {
    return this.get<{ nodes: { id: string; resourceId: string; label: string | null; resourceTypeKey: string; category: string }[]; edges: { from: string; to: string; relation: string }[]; hops: number }>('resources', `/api/resources/dependency-graph${qs({ resourceId })}`);
  }
  getResourceTags(connectionId?: string) { return this.get<{ scannedResources: number; distinctKeys: number; keys: { key: string; resourceCount: number; sampleValues: string[] }[] }>('resources', `/api/resources/tags${connectionId ? `?connectionId=${encodeURIComponent(connectionId)}` : ''}`); }
  getResourceTimeline(params: { eventType?: string; from?: string; to?: string; connectionId?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<ResourceLifecycleEvent>>('resources', `/api/resources/timeline${qs(params)}`);
  }
  bulkTagResources(data: { resourceIds: string[]; operation: 'add_tag' | 'remove_tag'; tagKey: string; tagValue?: string }) {
    return this.post<{ operation: string; requestedCount: number; matchedCount: number; updatedCount: number; skipped: string[] }>('resources', '/api/resources/bulk-operations', data);
  }
  getResourceCatalog(params: { category?: string; scannerStatus?: string; provider?: 'aws' | 'gcp' } = {}) {
    return this.get<{ items: ResourceCatalogEntry[] }>('resources', `/api/resources/catalog${qs(params)}`);
  }

  // ── containers-api ───────────────────────────────────────────────────────

  getContainersDashboard() { return this.get<{ total: number; ecsCount: number; eksCount: number; types: { key: string; displayName: string; count: number }[]; catalogTypeCount: number }>('containers', '/api/containers/dashboard'); }
  getEcsClusters(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/ecs/clusters${qs(params)}`); }
  getEcsServices(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/ecs/services${qs(params)}`); }
  getEcsTasks(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/ecs/tasks${qs(params)}`); }
  getEksClusters(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/clusters${qs(params)}`); }
  getEksNodegroups(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/nodes${qs(params)}`); }
  getEksNodes(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/k8s-nodes${qs(params)}`); }
  getEksNamespaces(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/namespaces${qs(params)}`); }
  getEksDeployments(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/deployments${qs(params)}`); }
  getEksPods(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/pods${qs(params)}`); }
  getEksHelmReleases() { return this.get<NotIntegrated>('containers', '/api/containers/eks/helm-releases'); }
  getEksAccessEntries(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/access-entries${qs(params)}`); }
  getEksAuthMappings(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/auth-mappings${qs(params)}`); }
  getEksAddons(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/eks/addons${qs(params)}`); }

  getGcpCloudRun(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/gcp/cloud-run${qs(params)}`); }
  getGcpArtifactRegistryRepos(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/gcp/artifact-registry/repositories${qs(params)}`); }
  getGcpArtifactRegistryImages(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/gcp/artifact-registry/images${qs(params)}`); }
  getGkeClusters(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/gcp/gke/clusters${qs(params)}`); }
  getGkePods(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/gcp/gke/pods${qs(params)}`); }
  getGkeDeployments(params: ContainerListParams = {}) { return this.get<Paginated<CloudResource> & { matchedTypeKeys: string[] }>('containers', `/api/containers/gcp/gke/deployments${qs(params)}`); }

  // ── monitoring-api ───────────────────────────────────────────────────────

  getMonitoringDashboard() {
    return this.get<{ alarms: { total: number; byState: Record<string, number>; note?: string }; resourceHealth: { total: number; byState: Record<string, number>; byStatus: Record<string, number> } }>('monitoring', '/api/monitoring/dashboard');
  }
  getAlarms(params: { connectionId?: string; state?: string; region?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<MonitoringAlarm>>('monitoring', `/api/monitoring/alarms${qs(params)}`);
  }
  getMonitoringHealth() {
    return this.get<{ total: number; overallByState: Record<string, number>; overallByStatus: Record<string, number>; connections: { connectionId: string; connectionName: string; total: number; byState: Record<string, number>; byStatus: Record<string, number> }[] }>('monitoring', '/api/monitoring/health');
  }
  getMetrics(params: { resourceId?: string; metricName?: string; namespace?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<ResourceMetric>>('monitoring', `/api/monitoring/metrics${qs(params)}`);
  }
  getLogs() { return this.get<NotIntegrated>('monitoring', '/api/monitoring/logs'); }
  getTraces() { return this.get<NotIntegrated>('monitoring', '/api/monitoring/traces'); }
  getServiceMap() { return this.get<NotIntegrated>('monitoring', '/api/monitoring/service-map'); }
  getPerformance() { return this.get<NotIntegrated>('monitoring', '/api/monitoring/performance'); }
  getCloudWatchDashboards() { return this.get<NotIntegrated>('monitoring', '/api/monitoring/cloudwatch/dashboards'); }

  // ── cost-management-api ──────────────────────────────────────────────────

  getCostAllocation(params: { tagKey?: string; from?: string; to?: string } = {}) { return this.get<CostAllocation>('costManagement', `/api/cost-management/allocation${qs(params)}`); }
  getChargeback(params: { tagKey?: string; from?: string; to?: string } = {}) { return this.get<CostAllocation & { currency: string; period: { from?: string; to?: string } }>('costManagement', `/api/cost-management/chargeback${qs(params)}`); }
  getShowback(params: { tagKey?: string; from?: string; to?: string } = {}) { return this.get<CostAllocation & { billable: false; period: { from?: string; to?: string } }>('costManagement', `/api/cost-management/showback${qs(params)}`); }
  getCostAnalytics(params: { from?: string; to?: string; region?: string; connectionIds?: string[] } = {}) {
    return this.get<{ range: { from: string; to: string }; totalCost: number; byService: Record<string, number>; byAccount: Record<string, number>; byRegion: Record<string, number> }>('costManagement', `/api/cost-management/analytics${qs({ from: params.from, to: params.to, region: params.region, connection_ids: params.connectionIds?.join(',') })}`);
  }
  getBudgets(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<Budget>>('costManagement', `/api/cost-management/budgets${qs(params)}`); }
  createBudget(data: { scopeType: BudgetScopeType; scopeId: string; name: string; monthlyLimit: number; alertThresholds?: number[] }) {
    return this.post<Budget>('costManagement', '/api/cost-management/budgets', data);
  }
  updateBudget(id: string, data: { name?: string; monthlyLimit?: number; alertThresholds?: number[]; scopeType?: BudgetScopeType; scopeId?: string }) {
    return this.put<Budget>('costManagement', `/api/cost-management/budgets/${id}`, data);
  }
  deleteBudget(id: string) { return this.delete<{ deleted: string }>('costManagement', `/api/cost-management/budgets/${id}`); }
  getCostExplorer(params: { connectionId?: string; from?: string; to?: string; service?: string; region?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<CostSnapshot>>('costManagement', `/api/cost-management/explorer${qs(params)}`);
  }
  getCostForecast(params: { region?: string } = {}) {
    return this.get<{ method: string; mtdSpend: number; dailyRate: number; daysElapsed: number; daysInMonth: number; projectedTotal: number; currency: string }>('costManagement', `/api/cost-management/forecast${qs(params)}`);
  }
  async downloadCostReportCsv(params: { from?: string; to?: string } = {}) {
    return this.downloadRaw('costManagement', `/api/cost-management/reports/export${qs({ format: 'csv', ...params })}`, 'cost-report.csv');
  }

  // ── cost-optimization-api ────────────────────────────────────────────────

  getCostOptimizationDashboard() { return this.get<{ openRecommendations: number; totalPotentialMonthlySavings: number; openAnomalies: number }>('costOptimization', '/api/cost-optimization/dashboard'); }
  getSavingsOpportunities(params: RecommendationListParams = {}) { return this.get<Paginated<CostRecommendation>>('costOptimization', `/api/cost-optimization/savings-opportunities${qs(params)}`); }
  getRightsizing(params: RecommendationListParams = {}) { return this.get<Paginated<CostRecommendation>>('costOptimization', `/api/cost-optimization/rightsizing${qs(params)}`); }
  getIdleResources(params: RecommendationListParams = {}) { return this.get<Paginated<CostRecommendation>>('costOptimization', `/api/cost-optimization/idle-resources${qs(params)}`); }
  getReservedInstances(params: RecommendationListParams = {}) { return this.get<Paginated<CostRecommendation>>('costOptimization', `/api/cost-optimization/reserved-instances${qs(params)}`); }
  getSavingsPlans(params: RecommendationListParams = {}) { return this.get<Paginated<CostRecommendation>>('costOptimization', `/api/cost-optimization/savings-plans${qs(params)}`); }
  getOptimizationHistory(params: RecommendationListParams = {}) { return this.get<Paginated<CostRecommendation>>('costOptimization', `/api/cost-optimization/optimization-history${qs(params)}`); }
  updateSavingsOpportunity(id: string, status: 'applied' | 'dismissed') { return this.patch<CostRecommendation>('costOptimization', `/api/cost-optimization/savings-opportunities/${id}`, { status }); }
  /** Skips a recommendation from the "open" views for a stated reason/duration without dismissing it outright — it re-surfaces on its own once excluded_until passes (or never, for a permanent exclusion). */
  excludeSavingsOpportunity(id: string, data: { reason: ExclusionReason; justification?: string; duration: ExclusionDuration; until?: string }) {
    return this.patch<CostRecommendation>('costOptimization', `/api/cost-optimization/savings-opportunities/${id}/exclude`, data);
  }
  unexcludeSavingsOpportunity(id: string) { return this.patch<CostRecommendation>('costOptimization', `/api/cost-optimization/savings-opportunities/${id}/unexclude`); }
  /** Assigns (optional) and/or emails (best-effort — see emailSent in the response) an owner about this recommendation. */
  notifyOwner(id: string, data: { recipientUserId?: string; additionalEmails?: string[] }) {
    return this.patch<CostRecommendation & { emailSent: boolean; emailError: string | null }>('costOptimization', `/api/cost-optimization/savings-opportunities/${id}/notify-owner`, data);
  }
  /** Real end-to-end: reads the actual file from the connected repo, finds the current instance_type/instanceType by exact literal match, commits the change on a new branch, opens a real PR. Fails honestly (400) if the match isn't found exactly once — see lib/github.ts's openResizeAutoPr server-side. */
  openAutoPr(id: string, data: { installationRowId: string; repoFullName: string; filePath: string }) {
    return this.patch<{ prUrl: string }>('costOptimization', `/api/cost-optimization/savings-opportunities/${id}/auto-pr`, data);
  }
  // Re-derives idle/unattached recommendations from cloud_resources — called automatically after a Discover Resources scan finishes (see syncContext.tsx).
  generateRecommendations(connectionId?: string) {
    return this.post<{ connectionsScanned: number; flagged: number; cleared: number }>('costOptimization', '/api/cost-optimization/generate', connectionId ? { connectionId } : {});
  }
  getCostAnomalies(params: { connectionId?: string; status?: string; service?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<CostAnomaly>>('costOptimization', `/api/cost-optimization/anomalies${qs(params)}`);
  }
  updateCostAnomaly(id: string, status: 'acknowledged' | 'resolved') { return this.patch<CostAnomaly>('costOptimization', `/api/cost-optimization/anomalies/${id}`, { status }); }
  // Re-runs day-over-day spike detection over cost_snapshots — called automatically after a cost sync completes (see AwsAccountDetail.tsx's syncCost).
  detectCostAnomalies(connectionId?: string) {
    return this.post<{ connectionsScanned: number; flagged: number }>('costOptimization', '/api/cost-optimization/anomalies/detect', connectionId ? { connectionId } : {});
  }

  // GitHub App integration for the Guided Fix "Auto-PR" workflow — real installation-token exchange server-side; this client only ever sees the installation id/repo names, never a token.
  getGitInstallations() { return this.get<{ items: GitInstallation[] }>('costOptimization', '/api/cost-optimization/git/installations'); }
  connectGitInstallation(installationId: number) { return this.post<GitInstallation>('costOptimization', '/api/cost-optimization/git/installations', { installationId }); }
  disconnectGitInstallation(id: string) { return this.delete<{ removed: string }>('costOptimization', `/api/cost-optimization/git/installations/${id}`); }
  getInstallationRepos(installationRowId: string) { return this.get<{ items: GitRepo[] }>('costOptimization', `/api/cost-optimization/git/installations/${installationRowId}/repos`); }

  // ── vulnerability-management-api ────────────────────────────────────────

  getVulnerabilityDashboard() {
    return this.get<{
      openFindings: number; bySeverity: Record<string, number>; riskScore: number;
      compliance: { benchmarksEvaluated: number; averagePassRate: number };
      // Scoped to AWS-native findings (vulnerability_findings) only -- does
      // NOT include cloudops360-scanner-* results, a separate database with
      // no connection to this one. See the Scanners tab's own banner.
      topAssets: Array<{ resource: string; label: string; findingCount: number }>;
      bySource: Array<{ source: string; label: string; count: number }>;
      remediation: { open: number; resolved: number; suppressed: number };
    }>('vulnerabilityManagement', '/api/vulnerability-management/dashboard');
  }
  getFindings(params: { severity?: string; status?: string; finding_source?: string; region?: string; connection_id?: string; search?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<VulnerabilityFinding>>('vulnerabilityManagement', `/api/vulnerability-management/findings${qs(params)}`);
  }
  getFinding(id: string) { return this.get<VulnerabilityFinding>('vulnerabilityManagement', `/api/vulnerability-management/findings/${id}`); }
  updateFindingStatus(id: string, status: 'open' | 'resolved' | 'suppressed', reason?: string) {
    return this.patch<VulnerabilityFinding>('vulnerabilityManagement', `/api/vulnerability-management/findings/${id}`, reason ? { status, reason } : { status });
  }
  /** Additive beyond the original single-finding action -- same PATCH semantics, up to 200 ids per call, one audit log entry per finding server-side. */
  bulkUpdateFindingStatus(ids: string[], status: 'open' | 'resolved' | 'suppressed', reason?: string) {
    return this.patch<{ requestedCount: number; updatedCount: number; items: VulnerabilityFinding[] }>('vulnerabilityManagement', '/api/vulnerability-management/findings/bulk-status', reason ? { ids, status, reason } : { ids, status });
  }
  getFindingsBySource(source: 'security-hub' | 'guardduty' | 'inspector' | 'iam-access-analyzer' | 'aws-config' | 'trusted-advisor', params: { page?: number; limit?: number } = {}) {
    return this.get<Paginated<VulnerabilityFinding>>('vulnerabilityManagement', `/api/vulnerability-management/${source}${qs(params)}`);
  }
  getComplianceBenchmarks(params: { framework?: string; connection_id?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<ComplianceBenchmark>>('vulnerabilityManagement', `/api/vulnerability-management/compliance${qs(params)}`);
  }

  // Proxies to the cloudops360-scanner-* microservices (separate
  // cloudscape-security GCP project) via vulnerability-management-api's
  // own scanner client -- see that service's scannerClient.ts. Scan/finding
  // data lives in the scanner platform's own Postgres, fetched live here,
  // not mirrored into this app's own findings table.
  getScannerStatuses() {
    return this.get<{ scanners: Array<{ scanner: string; reachable: boolean; error?: string }> }>('vulnerabilityManagement', '/api/vulnerability-management/scanners');
  }
  startScan(scanner: string, body: { scan_type: string; target: { type: string; uri: string }; options?: Record<string, unknown>; asset_id?: string; provider?: string }) {
    return this.post<{ scan_id?: string; status?: string; error?: string }>('vulnerabilityManagement', `/api/vulnerability-management/scanners/${scanner}/scans`, body);
  }
  getScanStatus(scanner: string, scanId: string) {
    return this.get<ScanRecord>('vulnerabilityManagement', `/api/vulnerability-management/scanners/${scanner}/scans/${scanId}`);
  }
  getScanResults(scanner: string, scanId: string, params: { severity?: string; status?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<ScannerFinding>>('vulnerabilityManagement', `/api/vulnerability-management/scanners/${scanner}/scans/${scanId}/results${qs(params)}`);
  }

  // ── alerts-api ───────────────────────────────────────────────────────────

  getActiveAlerts(params: { severity?: string; connection_id?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<AlertRow>>('alerts', `/api/alerts/active${qs(params)}`); }
  getAlertHistory(params: { status?: string; severity?: string; connection_id?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<AlertRow>>('alerts', `/api/alerts/history${qs(params)}`); }
  updateAlertStatus(id: string, status: 'open' | 'acknowledged' | 'in_progress' | 'resolved') { return this.patch<AlertRow>('alerts', `/api/alerts/alerts/${id}`, { status }); }

  getAlertRules(params: { enabled?: boolean; page?: number; limit?: number } = {}) { return this.get<Paginated<AlertRule>>('alerts', `/api/alerts/rules${qs(params)}`); }
  createAlertRule(data: { name: string; condition?: unknown; severity?: string; notificationChannels?: unknown[]; enabled?: boolean }) { return this.post<AlertRule>('alerts', '/api/alerts/rules', data); }
  updateAlertRule(id: string, data: Partial<{ name: string; condition: unknown; severity: string; notificationChannels: unknown[]; enabled: boolean }>) { return this.put<AlertRule>('alerts', `/api/alerts/rules/${id}`, data); }
  deleteAlertRule(id: string) { return this.delete<{ deleted: string }>('alerts', `/api/alerts/rules/${id}`); }

  getNotificationChannels(params: { channel_type?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<NotificationChannel>>('alerts', `/api/alerts/channels${qs(params)}`); }
  createNotificationChannel(data: { channelType: string; name: string; config?: unknown; enabled?: boolean }) { return this.post<NotificationChannel>('alerts', '/api/alerts/channels', data); }
  updateNotificationChannel(id: string, data: Partial<{ name: string; channelType: string; config: unknown; enabled: boolean }>) { return this.put<NotificationChannel>('alerts', `/api/alerts/channels/${id}`, data); }
  deleteNotificationChannel(id: string) { return this.delete<{ deleted: string }>('alerts', `/api/alerts/channels/${id}`); }

  getEscalationPolicies(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<EscalationPolicy>>('alerts', `/api/alerts/escalation-policies${qs(params)}`); }
  createEscalationPolicy(data: { name: string; steps?: unknown[] }) { return this.post<EscalationPolicy>('alerts', '/api/alerts/escalation-policies', data); }
  updateEscalationPolicy(id: string, data: Partial<{ name: string; steps: unknown[] }>) { return this.put<EscalationPolicy>('alerts', `/api/alerts/escalation-policies/${id}`, data); }
  deleteEscalationPolicy(id: string) { return this.delete<{ deleted: string }>('alerts', `/api/alerts/escalation-policies/${id}`); }

  getMaintenanceWindows(params: { connection_id?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<MaintenanceWindow>>('alerts', `/api/alerts/maintenance-windows${qs(params)}`); }
  createMaintenanceWindow(data: { name: string; connectionId?: string; startsAt: string; endsAt: string; recurrence?: unknown }) { return this.post<MaintenanceWindow>('alerts', '/api/alerts/maintenance-windows', data); }
  updateMaintenanceWindow(id: string, data: Partial<{ name: string; connectionId: string; startsAt: string; endsAt: string; recurrence: unknown }>) { return this.put<MaintenanceWindow>('alerts', `/api/alerts/maintenance-windows/${id}`, data); }
  deleteMaintenanceWindow(id: string) { return this.delete<{ deleted: string }>('alerts', `/api/alerts/maintenance-windows/${id}`); }

  // ── reports-api ──────────────────────────────────────────────────────────

  getReports(params: { category?: string; status?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<ReportRow>>('reports', `/api/reports/reports${qs(params)}`); }
  getReport(id: string) { return this.get<ReportRow>('reports', `/api/reports/reports/${id}`); }
  createReport(data: { category: 'cost' | 'security' | 'resource' | 'operational' | 'compliance' | 'savings'; name: string; format?: 'pdf' | 'csv'; scope?: { connectionIds?: string[]; dateFrom?: string; dateTo?: string } }) {
    return this.post<ReportRow>('reports', '/api/reports/reports', data);
  }
  async downloadReport(id: string): Promise<{ blob: Blob; filename: string }> {
    return this.downloadRaw('reports', `/api/reports/reports/${id}/download`, `report-${id}`);
  }
  getScheduledReports(params: { category?: string; enabled?: boolean; page?: number; limit?: number } = {}) { return this.get<Paginated<ScheduledReport>>('reports', `/api/reports/scheduled${qs(params)}`); }
  createScheduledReport(data: { name: string; reportCategory: string; scope?: unknown; cadence: string; recipients?: string[]; format?: string; nextRunAt?: string; enabled?: boolean }) {
    return this.post<ScheduledReport>('reports', '/api/reports/scheduled', data);
  }
  updateScheduledReport(id: string, data: Partial<{ name: string; reportCategory: string; scope: unknown; cadence: string; recipients: string[]; format: string; nextRunAt: string; enabled: boolean }>) {
    return this.put<ScheduledReport>('reports', `/api/reports/scheduled/${id}`, data);
  }
  deleteScheduledReport(id: string) { return this.delete<{ deleted: string }>('reports', `/api/reports/scheduled/${id}`); }
  getExportCenter(params: { category?: string; status?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<ReportRow>>('reports', `/api/reports/export-center${qs(params)}`); }

  // ── users-api ────────────────────────────────────────────────────────────

  getMembers() { return this.get<{ members: Member[]; pendingInvites: PendingInvite[] }>('users', '/api/users/members'); }
  inviteMember(email: string, role: Role) { return this.post<PendingInviteRow & { emailSent: boolean }>('users', '/api/users/invite', { email, role }); }
  getInvitePreview(token: string) { return this.get<{ orgName: string; inviterName: string; role: Role; email: string }>('users', `/api/users/invites/${token}`); }
  acceptInvite(token: string) { return this.post<{ orgId: string; role: Role }>('users', `/api/users/invites/${token}/accept`); }
  updateRoleGrant(id: string, role: Role) { return this.put<{ id: string; role: Role }>('users', `/api/users/role-grants/${id}`, { role }); }
  deleteRoleGrant(id: string) { return this.delete<{ removed: string }>('users', `/api/users/role-grants/${id}`); }
  transferOwnership(newOwnerUserId: string) { return this.post<{ newOwnerUserId: string; previousOwnerRole: Role }>('users', '/api/users/transfer-ownership', { newOwnerUserId }); }

  getGroups() { return this.get<{ groups: UserGroup[] }>('users', '/api/users/groups'); }
  createGroup(name: string) { return this.post<{ id: string; org_id: string; name: string }>('users', '/api/users/groups', { name }); }
  deleteGroup(id: string) { return this.delete<{ removed: string }>('users', `/api/users/groups/${id}`); }
  addGroupMember(groupId: string, userId: string) { return this.post<{ groupId: string; userId: string }>('users', `/api/users/groups/${groupId}/members`, { userId }); }
  removeGroupMember(groupId: string, userId: string) { return this.delete<{ removed: string }>('users', `/api/users/groups/${groupId}/members/${userId}`); }

  getRoles() { return this.get<{ roles: { role: Role; description: string }[] }>('users', '/api/users/roles'); }
  getMyPermissions() { return this.get<{ role: Role; description: string; effectivePermissions: { role: Role; description: string } }>('users', '/api/users/permissions'); }

  getEffectiveMenuPermissions(userId?: string) {
    return this.get<{ userId: string; permissions: Record<string, MenuPermissionLevel> }>('users', `/api/users/menu-permissions/effective${qs({ userId })}`);
  }
  getMenuPermissionOverrides(params: { userId?: string; groupId?: string }) {
    return this.get<{ items: MenuPermissionRow[] }>('users', `/api/users/menu-permissions${qs(params)}`);
  }
  setMenuPermission(data: ({ userId: string; groupId?: never } | { userId?: never; groupId: string }) & { menuKey: string; level: MenuPermissionLevel }) {
    return this.put<MenuPermissionRow>('users', '/api/users/menu-permissions', data);
  }
  deleteMenuPermission(id: string) {
    return this.delete<{ deleted: boolean }>('users', `/api/users/menu-permissions/${id}`);
  }

  getEffectiveResourceGrants(userId?: string) {
    return this.get<{ userId: string; restricted: boolean; connectionIds: string[] }>('users', `/api/users/resource-grants/effective${qs({ userId })}`);
  }
  getResourceGrants(userId: string) {
    return this.get<{ items: ResourceGrantRow[] }>('users', `/api/users/resource-grants${qs({ userId })}`);
  }
  setResourceGrant(userId: string, connectionId: string) {
    return this.put<ResourceGrantRow>('users', '/api/users/resource-grants', { userId, connectionId });
  }
  deleteResourceGrant(id: string) {
    return this.delete<{ deleted: boolean }>('users', `/api/users/resource-grants/${id}`);
  }

  getApiKeys() { return this.get<{ apiKeys: ApiKeySummary[] }>('users', '/api/users/api-keys'); }
  createApiKey(name: string) { return this.post<{ apiKey: string; id: string; name: string; keyPrefix: string; note: string }>('users', '/api/users/api-keys', { name }); }
  revokeApiKey(id: string) { return this.delete<ApiKeySummary>('users', `/api/users/api-keys/${id}`); }

  getUserAuditLog(params: { action?: string; from?: string; to?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<ActivityEntry>>('users', `/api/users/audit-logs${qs(params)}`); }

  // ── organization-management-api ─────────────────────────────────────────

  /** No X-Org-Id required — the bootstrap route that discovers which org(s) the caller belongs to before one is selected. */
  getMyOrganizations() { return this.get<{ organizations: OrganizationRow[] }>('organizationManagement', '/api/organization-management/my-organizations'); }
  /** No X-Org-Id required — creates a brand-new org and grants the caller 'owner' on it. */
  createOrganization(name: string) { return this.post<OrganizationRow>('organizationManagement', '/api/organization-management/organizations', { name }); }
  getOrganization() { return this.get<OrganizationRow>('organizationManagement', '/api/organization-management/organizations'); }
  updateOrganization(id: string, data: Partial<{ name: string; branding: Record<string, unknown>; mfaRequired: boolean; ipAllowlist: string[] }>) {
    return this.put<OrganizationRow>('organizationManagement', `/api/organization-management/organizations/${id}`, data);
  }

  getFolders() { return this.get<{ folders: FolderRow[] }>('organizationManagement', '/api/organization-management/folders'); }
  createFolder(data: { name: string; parentFolderId?: string; monthlyBudget?: number; requiredTags?: string[]; allowedRegions?: string[]; businessUnitId?: string; costCenterId?: string }) {
    return this.post<FolderRow>('organizationManagement', '/api/organization-management/folders', data);
  }
  updateFolder(id: string, data: Partial<{ name: string; parentFolderId: string | null; monthlyBudget: number; requiredTags: string[]; allowedRegions: string[]; businessUnitId: string | null; costCenterId: string | null }>) {
    return this.put<FolderRow>('organizationManagement', `/api/organization-management/folders/${id}`, data);
  }
  deleteFolder(id: string) { return this.delete<{ removed: string }>('organizationManagement', `/api/organization-management/folders/${id}`); }

  getProjects(folderId?: string) { return this.get<{ projects: ProjectRow[] }>('organizationManagement', `/api/organization-management/projects${qs({ folderId })}`); }
  createProject(data: { name: string; slug: string; folderId?: string; monthlyBudget?: number; businessUnitId?: string; costCenterId?: string }) {
    return this.post<ProjectRow>('organizationManagement', '/api/organization-management/projects', data);
  }
  updateProject(id: string, data: Partial<{ name: string; slug: string; folderId: string | null; monthlyBudget: number; businessUnitId: string | null; costCenterId: string | null }>) {
    return this.put<ProjectRow>('organizationManagement', `/api/organization-management/projects/${id}`, data);
  }
  deleteProject(id: string) { return this.delete<{ removed: string }>('organizationManagement', `/api/organization-management/projects/${id}`); }

  getBusinessUnits() { return this.get<{ businessUnits: BusinessUnit[] }>('organizationManagement', '/api/organization-management/business-units'); }
  createBusinessUnit(data: { name: string; code?: string }) { return this.post<BusinessUnit>('organizationManagement', '/api/organization-management/business-units', data); }
  updateBusinessUnit(id: string, data: Partial<{ name: string; code: string }>) { return this.put<BusinessUnit>('organizationManagement', `/api/organization-management/business-units/${id}`, data); }
  deleteBusinessUnit(id: string) { return this.delete<{ removed: string }>('organizationManagement', `/api/organization-management/business-units/${id}`); }

  getCostCenters() { return this.get<{ costCenters: CostCenter[] }>('organizationManagement', '/api/organization-management/cost-centers'); }
  createCostCenter(data: { name: string; code?: string; businessUnitId?: string }) { return this.post<CostCenter>('organizationManagement', '/api/organization-management/cost-centers', data); }
  updateCostCenter(id: string, data: Partial<{ name: string; code: string; businessUnitId: string }>) { return this.put<CostCenter>('organizationManagement', `/api/organization-management/cost-centers/${id}`, data); }
  deleteCostCenter(id: string) { return this.delete<{ removed: string }>('organizationManagement', `/api/organization-management/cost-centers/${id}`); }

  getEnvironments() { return this.get<{ environments: { environment: string; count: number }[] }>('organizationManagement', '/api/organization-management/environments'); }
  getOrgTags() { return this.get<{ tags: { key: string; resourceCount: number; values: { value: string; count: number }[] }[] }>('organizationManagement', '/api/organization-management/tags'); }
  getOwnership(tagKey?: string) { return this.get<{ tagKey: string; owners: { owner: string; resourceCount: number }[] }>('organizationManagement', `/api/organization-management/ownership${qs({ tagKey })}`); }
  getHierarchyExplorer() { return this.get<HierarchyNode>('organizationManagement', '/api/organization-management/hierarchy-explorer'); }
  getOrgHierarchyAuditLog(params: { targetType?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<ActivityEntry>>('organizationManagement', `/api/organization-management/audit-log${qs(params)}`); }

  // ── custom-dashboards-api ────────────────────────────────────────────────

  getMyDashboards(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<CustomDashboard>>('customDashboards', `/api/custom-dashboards/my-dashboards${qs(params)}`); }
  getSharedDashboards(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<CustomDashboard>>('customDashboards', `/api/custom-dashboards/shared-dashboards${qs(params)}`); }
  getDashboardTemplates(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<CustomDashboard>>('customDashboards', `/api/custom-dashboards/templates${qs(params)}`); }
  createDashboard(data: { name: string; description?: string; widgets?: unknown[] }) { return this.post<CustomDashboard>('customDashboards', '/api/custom-dashboards/dashboards', data); }
  getDashboard(id: string) { return this.get<CustomDashboard>('customDashboards', `/api/custom-dashboards/dashboards/${id}`); }
  updateDashboard(id: string, data: Partial<{ name: string; description: string; widgets: unknown[] }>) { return this.put<CustomDashboard>('customDashboards', `/api/custom-dashboards/dashboards/${id}`, data); }
  deleteDashboard(id: string) { return this.delete<{ deleted: string }>('customDashboards', `/api/custom-dashboards/dashboards/${id}`); }
  shareDashboard(id: string, share: boolean) { return this.post<CustomDashboard>('customDashboards', `/api/custom-dashboards/dashboards/${id}/share`, { share }); }
  useTemplate(id: string) { return this.post<CustomDashboard>('customDashboards', `/api/custom-dashboards/templates/${id}/use`); }
  saveAsTemplate(id: string) { return this.post<CustomDashboard>('customDashboards', `/api/custom-dashboards/dashboards/${id}/save-as-template`); }
  getWidgetLibrary(category?: string) { return this.get<{ widgets: DashboardWidgetCatalogEntry[] }>('customDashboards', `/api/custom-dashboards/widget-library${qs({ category })}`); }

  // ── automation-api ───────────────────────────────────────────────────────

  getRunbooks(params: { category?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<Runbook>>('automation', `/api/automation/runbooks${qs(params)}`); }
  createRunbook(data: { name: string; description?: string; category?: string; steps?: unknown[] }) { return this.post<Runbook>('automation', '/api/automation/runbooks', data); }
  updateRunbook(id: string, data: Partial<{ name: string; description: string; category: string; steps: unknown[] }>) { return this.put<Runbook>('automation', `/api/automation/runbooks/${id}`, data); }
  deleteRunbook(id: string) { return this.delete<{ deleted: string }>('automation', `/api/automation/runbooks/${id}`); }
  executeRunbook(id: string) { return this.post<AutomationExecution>('automation', `/api/automation/runbooks/${id}/execute`); }

  getWorkflows(params: { enabled?: boolean; page?: number; limit?: number } = {}) { return this.get<Paginated<Workflow>>('automation', `/api/automation/workflows${qs(params)}`); }
  createWorkflow(data: { name: string; description?: string; trigger?: unknown; steps?: unknown[]; enabled?: boolean }) { return this.post<Workflow>('automation', '/api/automation/workflows', data); }
  updateWorkflow(id: string, data: Partial<{ name: string; description: string; trigger: unknown; steps: unknown[]; enabled: boolean }>) { return this.put<Workflow>('automation', `/api/automation/workflows/${id}`, data); }
  deleteWorkflow(id: string) { return this.delete<{ deleted: string }>('automation', `/api/automation/workflows/${id}`); }
  executeWorkflow(id: string) { return this.post<AutomationExecution>('automation', `/api/automation/workflows/${id}/execute`); }

  getScheduledJobs(params: { jobType?: string; enabled?: boolean; page?: number; limit?: number } = {}) { return this.get<Paginated<ScheduledJob>>('automation', `/api/automation/scheduled-jobs${qs(params)}`); }
  createScheduledJob(data: { name: string; jobType: string; scheduleCron: string; target?: unknown; enabled?: boolean }) { return this.post<ScheduledJob>('automation', '/api/automation/scheduled-jobs', data); }
  updateScheduledJob(id: string, data: Partial<{ name: string; jobType: string; scheduleCron: string; target: unknown; enabled: boolean }>) { return this.put<ScheduledJob>('automation', `/api/automation/scheduled-jobs/${id}`, data); }
  deleteScheduledJob(id: string) { return this.delete<{ deleted: string }>('automation', `/api/automation/scheduled-jobs/${id}`); }

  getRemediationHistory(params: { status?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<AutomationExecution>>('automation', `/api/automation/remediation${qs(params)}`); }
  getExecutionHistory(params: { automationType?: string; status?: string; from?: string; to?: string; page?: number; limit?: number } = {}) {
    return this.get<Paginated<AutomationExecution>>('automation', `/api/automation/execution-history${qs(params)}`);
  }

  getWebhooks(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<Webhook>>('automation', `/api/automation/webhooks${qs(params)}`); }
  createWebhook(data: { name: string; url: string; events?: string[]; platform?: 'generic' | 'slack' }) { return this.post<{ webhook: Webhook; secret: string }>('automation', '/api/automation/webhooks', data); }
  updateWebhook(id: string, data: Partial<{ name: string; url: string; events: string[]; platform: 'generic' | 'slack'; enabled: boolean }>) { return this.put<Webhook>('automation', `/api/automation/webhooks/${id}`, data); }
  deleteWebhook(id: string) { return this.delete<{ deleted: string }>('automation', `/api/automation/webhooks/${id}`); }
  triggerTestWebhook(id: string) { return this.post<{ delivered: boolean; httpStatus?: number; error?: string; payload: unknown }>('automation', `/api/automation/webhooks/${id}/trigger-test`); }

  getAutomationIntegrations(params: { category?: string; page?: number; limit?: number } = {}) { return this.get<Paginated<Integration>>('automation', `/api/automation/integrations${qs(params)}`); }
  updateAutomationIntegration(id: string, data: { status?: string; config?: unknown; accountRegion?: string }) { return this.put<Integration & { verified: false; note?: string }>('automation', `/api/automation/integrations/${id}`, data); }

  // Jira — email + API token (both created by the user in their own Atlassian account, no OAuth app needed); every write real-verifies against Jira before being marked connected.
  getJiraIntegration() { return this.get<{ connected: boolean; config?: { siteUrl: string; email: string; defaultProjectKey: string | null; defaultIssueType: string; autoFileEvents: string[] } }>('automation', '/api/automation/integrations/jira'); }
  configureJira(data: { siteUrl: string; email: string; apiToken: string; defaultProjectKey?: string; defaultIssueType?: string; autoFileEvents?: string[] }) {
    return this.put<{ verified: true; verifiedAs?: string }>('automation', '/api/automation/integrations/jira', data);
  }
  testJiraConnection() { return this.post<{ verified: boolean; verifiedAs?: string }>('automation', '/api/automation/integrations/jira/test'); }
  createJiraIssue(data: { summary: string; description?: string; projectKey?: string; issueType?: string }) {
    return this.post<{ key: string; url: string }>('automation', '/api/automation/integrations/jira/create-issue', data);
  }

  // ── settings-api ─────────────────────────────────────────────────────────

  getAwsIntegrationsSummary() { return this.get<{ connections: { id: string; connection_name: string; status: string; environment: string; connection_method: string }[] }>('settings', '/api/settings/aws-integrations'); }
  getLicense() { return this.get<{ plan: string; seats: number; seatsUsed: number; planLimits: { connections: number | string; users: number | string } | null; seatsEnforced: true; connectionLimitEnforced: false }>('settings', '/api/settings/license'); }
  getSettingsCredentials() { return this.get<{ credentials: { connectionId: string; connectionName: string; connectionMethod: string; maskedAccessKey: string | null; keyRotatedAt: string | null; rotationDueInDays: number | null; rotationOverdue: boolean }[] }>('settings', '/api/settings/credentials'); }
  getNotificationSettings() { return this.get<Record<string, unknown>>('settings', '/api/settings/notifications'); }
  updateNotificationSettings(data: Record<string, unknown>) { return this.put<Record<string, unknown>>('settings', '/api/settings/notifications', data); }
  getSystemSettings() { return this.get<Record<string, unknown>>('settings', '/api/settings/system-settings'); }
  updateSystemSettings(data: Record<string, unknown>) { return this.put<Record<string, unknown>>('settings', '/api/settings/system-settings', data); }
  getRecommendationRules() { return this.get<Partial<RecommendationRules>>('settings', '/api/settings/recommendation-rules'); }
  updateRecommendationRules(data: RecommendationRules) { return this.put<RecommendationRules>('settings', '/api/settings/recommendation-rules', data); }
  getBranding() { return this.get<Record<string, unknown>>('settings', '/api/settings/branding'); }
  updateBranding(data: Record<string, unknown>) { return this.put<Record<string, unknown>>('settings', '/api/settings/branding', data); }
  getRbac() { return this.get<{ roleGrants: { id: string; user_id: string; role: Role; created_at: string; profiles: { email: string; full_name: string | null } | null }[]; roleDefinitions: { role: Role; description: string }[] }>('settings', '/api/settings/rbac'); }
  setMfaRequired(mfaRequired: boolean) { return this.put<{ mfaRequired: boolean }>('settings', '/api/settings/rbac/mfa-required', { mfaRequired }); }

  // ── billing (test-env only — see isBillingEnabled()) ────────────────────

  getBillingPlans() { return this.get<{ items: BillingPlan[] }>('billing', '/api/billing/plans'); }
  getBillingAddons() { return this.get<{ items: BillingAddon[] }>('billing', '/api/billing/addons'); }
  getCurrentSubscription() { return this.get<{ subscription: BillingSubscription | null; plan: BillingPlan | null }>('billing', '/api/billing/subscriptions/current'); }
  getPaymentProviderStatus() { return this.get<{ provider: string; configured: boolean; mode: 'test' | 'live' | 'none' }>('billing', '/api/billing/provider-status'); }
  /** idempotencyKey: pass the same value across a retry of the *same* attempt (network error, timeout) so the backend replays its original result instead of risking a second checkout session; omit it and a fresh one is generated, appropriate for a genuinely new attempt. */
  createSubscription(data: { planKey: string; billingInterval: 'monthly' | 'annual'; successPath?: string; cancelPath?: string }, idempotencyKey = crypto.randomUUID()) {
    return this.postIdempotent<{ subscription: BillingSubscription | null; checkoutUrl: string | null }>('billing', '/api/billing/subscriptions', data, idempotencyKey);
  }
  getBillingPortalUrl(returnPath?: string) { return this.post<{ portalUrl: string }>('billing', '/api/billing/subscriptions/portal', { returnPath }); }
  mockCompleteCheckout(data: { planKey: string; billingInterval: 'monthly' | 'annual'; outcome: 'success' | 'failure' }, idempotencyKey = crypto.randomUUID()) {
    return this.postIdempotent<{ subscription: BillingSubscription | null; activated: boolean }>('billing', '/api/billing/subscriptions/mock-complete', data, idempotencyKey);
  }
  getBillingInvoices(params: { page?: number; limit?: number } = {}) { return this.get<Paginated<BillingInvoice>>('billing', `/api/billing/invoices${qs(params)}`); }
  getBillingUsage() { return this.get<{ metrics: Record<string, BillingUsageMetric>; planKey: string | null }>('billing', '/api/billing/usage'); }
  validateCoupon(code: string, planKey?: string) { return this.post<{ valid: true; coupon: BillingCoupon }>('billing', '/api/billing/coupons/validate', { code, planKey }); }
  redeemCoupon(code: string, planKey?: string) { return this.post<{ redeemed: true; coupon: BillingCoupon }>('billing', '/api/billing/coupons/redeem', { code, planKey }); }
  getReferrals() { return this.get<{ code: string; redemptions: BillingReferral[]; totalCreditedCents: number; creditPerReferralCents: number }>('billing', '/api/billing/referrals'); }
  redeemReferral(code: string) { return this.post<{ redeemed: true; creditedCents: number }>('billing', '/api/billing/referrals/redeem', { code }); }

  // ── ai-copilot ────────────────────────────────────────────────────────────

  sendChatMessage(data: { conversationId?: string; message: string }) { return this.post<ChatReply>('aiCopilot', '/api/ai-copilot/chat', data); }
  getConversations() { return this.get<{ items: ConversationSummary[] }>('aiCopilot', '/api/ai-copilot/conversations'); }
  getConversationMessages(id: string) { return this.get<{ items: ChatMessage[] }>('aiCopilot', `/api/ai-copilot/conversations/${id}/messages`); }
  renameConversation(id: string, title: string) { return this.patch<ConversationSummary>('aiCopilot', `/api/ai-copilot/conversations/${id}`, { title }); }
  pinConversation(id: string, pinned: boolean) { return this.patch<ConversationSummary>('aiCopilot', `/api/ai-copilot/conversations/${id}`, { pinned }); }
  deleteConversation(id: string) { return this.delete<{ deleted: boolean }>('aiCopilot', `/api/ai-copilot/conversations/${id}`); }
}

export const api = new ApiClient();

// ── Types ────────────────────────────────────────────────────────────────

export type Role = 'owner' | 'admin' | 'editor' | 'viewer' | 'billing_admin';
export type Environment = 'production' | 'staging' | 'dev' | 'sandbox' | 'qa' | 'security' | 'dr' | 'legacy';
export type BudgetScopeType = 'org' | 'folder' | 'project' | 'connection';

export interface BillingPlan {
  id: string; key: string; name: string; monthly_price_cents: number; annual_price_cents: number; currency: string;
  included_cloud_accounts: number; included_organizations: number; included_users: number;
  included_api_requests: number; included_ai_requests: number; included_storage_gb: number; included_automations: number;
  support_level: string; sla_percent: number | null; data_retention_days: number; audit_log_enabled: boolean;
  sso_enabled: boolean; saml_sso_enabled: boolean; compliance_features: string[]; security_features: string[];
  is_active: boolean; is_public: boolean; sort_order: number;
}
export interface BillingAddon {
  id: string; key: string; name: string; description: string | null; price_cents: number; billing_unit: string; unit_label: string | null; is_active: boolean;
}
export interface BillingSubscription {
  id: string; org_id: string; plan_id: string; status: string; billing_interval: string;
  current_period_start: string; current_period_end: string; trial_end: string | null;
  cancel_at_period_end: boolean; payment_provider: string | null;
}
export interface BillingInvoice {
  id: string; invoice_number: string; status: string; amount_due_cents: number; amount_paid_cents: number;
  currency: string; period_start: string; period_end: string; paid_at: string | null; pdf_url: string | null; created_at: string;
}
export interface BillingUsageMetric { used: number | null; included: number | null; tracked: boolean; reason?: string }
export interface BillingCoupon { id: string; code: string; discount_type: 'percent' | 'fixed'; discount_value: number }
export interface BillingReferral { id: string; referred_org_id: string | null; referral_code: string; status: 'pending' | 'credited' | 'expired'; discount_credited_cents: number; created_at: string }
export interface OverviewDashboard {
  connections: { total: number; connected: number; error: number; pending: number; disconnected: number };
  resources: { total: number; byCategory: Record<string, number> };
  cost: { monthToDate: number; currency: string };
  security: { openFindings: number; bySeverity: Record<string, number> };
  monitoring: { totalAlarms: number; inAlarm: number };
  alerts: { open: number; bySeverity: Record<string, number> };
  executiveSummary: string;
}

export interface ActivityEntry { id: string; action: string; targetType: string | null; targetId: string | null; metadata: Record<string, unknown>; occurredAt: string; actor: { email: string; name: string | null } | null }
export interface CloudTrailEvent {
  eventId: string; eventName: string; eventTime: string; eventSource: string;
  username: string | null; userIdentityType: string | null; userIdentityArn: string | null;
  sourceIpAddress: string | null; userAgent: string | null; awsRegion: string | null; readOnly: boolean | null;
  errorCode: string | null; errorMessage: string | null;
  resources: { resourceType?: string; resourceName?: string }[];
  requestParameters: unknown; responseElements: unknown;
}
export interface Favorite { id: string; type: string; label: string; path: string; addedAt: string }
export interface QuickAction { key: string; label: string; description: string; module: string; path: string; minRole: Role }

export interface CloudConnection {
  id: string; org_id: string; project_id: string | null; connection_method: 'access_key' | 'cross_account_role';
  aws_account_id: string; connection_name: string | null; masked_access_key: string | null; external_id: string | null;
  role_arn: string | null; default_region: string; status: 'pending' | 'connected' | 'error' | 'disconnected' | 'expired';
  environment: Environment; support_plan: string | null;
  resource_summary: { totalResources?: number; categoryCounts?: Record<string, number> } | null;
  last_discovery_at: string | null; last_full_scan_at: string | null; last_sync_at: string | null;
  key_rotated_at: string | null; error_message: string | null; scan_regions: string[]; created_at: string; updated_at: string;
}
export interface AccountSummary { id: string; connection_name: string; status: string; environment?: string; last_sync_at: string | null; last_discovery_at: string | null; last_permission_check_at?: string | null; error_message: string | null; resource_summary?: unknown; key_rotated_at?: string | null }

/** gcp-accounts-api's equivalent of CloudConnection — a distinct type rather than widening CloudConnection's AWS-specific required fields (aws_account_id, role_arn, external_id) to accommodate GCP's identifiers. */
export interface GcpConnection {
  id: string; org_id: string; project_id: string | null; provider: 'gcp'; connection_method: 'service_account_key' | 'service_account_impersonation';
  gcp_project_id: string; connection_name: string | null; masked_access_key: string | null; gcp_impersonated_service_account: string | null;
  default_region: string; status: 'pending' | 'connected' | 'error' | 'disconnected' | 'expired';
  environment: Environment;
  resource_summary: { totalResources?: number; categoryCounts?: Record<string, number> } | null;
  last_discovery_at: string | null; last_full_scan_at: string | null; last_sync_at: string | null;
  error_message: string | null; scan_regions: string[]; created_at: string; updated_at: string;
}
export interface CrossAccountRole { id: string; connection_name: string; aws_account_id: string; role_arn: string; external_id: string; status: string; created_at: string }

export interface AwsAccountsDashboard {
  totalAccounts: number;
  healthyAccounts: number;
  failedAccounts: number;
  disconnectedAccounts: number;
  accountsNeedingAttention: number;
  resourcesDiscovered: number;
  regionsCovered: number;
  lastDiscovery: string | null;
  /** No discovery scheduler exists in this build — always null, shown as an honest "not scheduled" rather than a fabricated date. */
  nextScheduledDiscovery: string | null;
  /** No discovery engine exists in this build — always null. */
  discoverySuccessRate: number | null;
  accountsNeedingAttentionList: { connectionId: string; connectionName: string; reason: string }[];
  permissionErrors: number;
  syncFailures: number;
  monthlyCost: number;
  topCostAccounts: { connectionId: string; connectionName: string; monthToDate: number }[];
  topGrowingAccounts: { connectionId: string; connectionName: string; totalResources: number }[];
  openRecommendations: number;
  potentialMonthlySavings: number;
  rotationDue: number;
  recentActivity: { id: string; action: string; targetId: string | null; occurredAt: string; actorEmail: string | null }[];
  recentAlerts: { id: string; alertName: string; severity: string; connectionId: string | null; triggeredAt: string }[];
}

export type CheckStatus = 'granted' | 'denied' | 'error' | 'not_applicable';
export interface PermissionCheckResult { service: string; label: string; status: CheckStatus; detail: string; verified: boolean }
export interface IdentitySummary { arn: string | null; accountId: string | null; userId: string | null }
export interface ValidationRun { id: string; run_type?: 'permission_validation' | 'discovery'; status: 'running' | 'succeeded' | 'failed'; identity_arn?: string | null; identity_account_id?: string | null; started_at: string; finished_at: string | null; error_message: string | null; triggered_by?: string | null }
export interface AccountPermissionSummary {
  connectionId: string;
  connectionName: string;
  lastCheckedAt: string | null;
  overallStatus: 'running' | 'succeeded' | 'failed' | 'never_run';
  deniedCount: number;
  errorCount: number;
  checks: PermissionCheckResult[];
}

export type ResourceCategory = 'Compute' | 'Storage' | 'Database' | 'Networking' | 'Security' | 'Containers' | 'Analytics' | 'Management' | 'Others';
export interface ResourceCatalogEntry { key: string; service: string; resource_type: string; display_name: string; category: ResourceCategory; console_url_template: string | null; is_default_capable: boolean; scanner_status: 'live' | 'planned'; provider: 'aws' | 'gcp' }
export interface CloudResource {
  id: string; connection_id: string; account_id: string; resource_type_key: string; resource_id: string; resource_name: string | null;
  region: string | null; category: string; service: string; state: string | null; status: string; is_default: boolean;
  cost_monthly: number | null; tags: Record<string, string>; metadata: Record<string, unknown>; relationships: Record<string, unknown>;
  first_seen_at: string; last_seen_at: string; deleted_at: string | null; created_at: string;
}
export interface ResourceLifecycleEvent { id: string; connection_id: string; resource_id: string | null; resource_type_key: string; aws_resource_id: string; event_type: string; detail: Record<string, unknown>; occurred_at: string }
export type ContainerListParams = { connectionId?: string; region?: string; status?: string; search?: string; page?: number; limit?: number }

export interface MonitoringAlarm { id: string; connection_id: string; resource_id: string | null; alarm_name: string; metric_name: string; namespace: string; region: string; state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA'; threshold: number | null; comparison_operator: string | null; updated_at: string; created_at: string }
export interface ResourceMetric { id: string; connection_id: string; resource_id: string | null; resource_type_key: string; metric_name: string; namespace: string; unit: string | null; region: string; ts: string; value: number; created_at: string }

export interface CostSnapshot { id: string; connection_id: string; account_id: string; usage_date: string; service: string; region: string | null; unblended_cost: string; usage_quantity: string | null; usage_unit: string | null; currency: string }
export interface CostAllocation { tagKey: string; totalCost: number; buckets: { tagValue: string; totalCost: number }[] }
export interface Budget {
  id: string; org_id: string; scope_type: BudgetScopeType; scope_id: string; name: string; monthly_limit: number; alert_thresholds: number[]; created_at: string;
  currentSpend: number; projectedSpend: number; forecastMethod: string; percentOfLimit: number; status: 'ok' | 'warning' | 'exceeded';
}
/** Mirrors cost-optimization-api's lib/rules.ts DEFAULT_RECOMMENDATION_RULES exactly — see that file's comment for why there's no "minimum days idle" or "Scheduling" knob (no groundable data source for either yet). */
export interface RecommendationRules {
  idleDetectionEnabled: boolean;
  rightsizingEnabled: boolean;
  rightsizingCpuThresholdPct: number;
  minMonthlySavingsToFlag: number;
}
export interface GitInstallation { id: string; org_id: string; installation_id: number; account_login: string; connected_by: string | null; created_at: string }
export interface GitRepo { fullName: string; defaultBranch: string; private: boolean }
export type ExclusionReason = 'business_critical' | 'performance_required' | 'temporary_workload' | 'false_positive' | 'other';
export type ExclusionDuration = '30d' | '90d' | 'permanent' | 'custom';
export interface CostRecommendation {
  id: string; connection_id: string; resource_id: string | null; category: string; issue: string; recommended_action: string;
  potential_monthly_savings: number; priority: 'high' | 'medium' | 'low'; status: 'open' | 'applied' | 'dismissed'; created_at: string; external_key: string | null;
  excluded_reason: ExclusionReason | null; excluded_justification: string | null; excluded_by: string | null; excluded_at: string | null; excluded_until: string | null;
  assigned_to: string | null; last_notified_at: string | null; last_notified_by: string | null;
}
export type RecommendationListParams = { connectionId?: string; category?: string; priority?: string; status?: string; page?: number; limit?: number }
export interface CostAnomaly { id: string; connection_id: string; service: string; detected_at: string; usage_date: string; expected_cost: number; actual_cost: number; percent_change: number; dollar_impact: number; status: 'open' | 'acknowledged' | 'resolved'; created_at: string }

export type RemediationActionType = 'stop_instance' | 'start_instance' | 'release_eip' | 'delete_volume' | 'delete_snapshot' | 'deregister_ami' | 'resize_instance';
export interface RemediationRequest {
  id: string; org_id: string; connection_id: string; resource_id: string | null; recommendation_id: string | null;
  action_type: RemediationActionType; target_resource_id: string; region: string | null;
  status: 'pending_approval' | 'rejected' | 'approved' | 'dry_run_passed' | 'dry_run_failed' | 'executing' | 'awaiting_stop' | 'completed' | 'failed' | 'rolled_back';
  requested_by: string | null; approved_by: string | null; dry_run_result: { eligible?: boolean; wouldSucceed?: boolean; reason?: string } | null;
  execution_result: { ok?: boolean; errorCode?: string; errorMessage?: string; snapshotId?: string; reason?: string; step?: string; observedState?: string } | null;
  rollback_of: string | null; target_config: { targetInstanceType?: string; zone?: string } | null;
  provider: 'aws' | 'gcp'; created_at: string; approved_at: string | null; executed_at: string | null;
}

export interface VulnerabilityFinding {
  id: string; connection_id: string; resource_id: string | null; finding_source: 'internal' | 'security_hub' | 'guardduty' | 'inspector' | 'iam_access_analyzer' | 'aws_config' | 'trusted_advisor';
  aws_finding_id: string | null; severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'; cvss_score: number | null; title: string; description: string | null;
  compliance_frameworks: string[]; status: 'open' | 'resolved' | 'suppressed'; remediation_link: string | null; region: string | null; resource_arn: string | null;
  discovered_at: string; last_seen_at: string; resolved_at: string | null;
}
// passRate is a 0-1 fraction (not a percentage) and null when total_checks
// is 0 (nothing evaluated yet, not the same as a 0% pass rate) - multiply by
// 100 and null-check at render time, never call .toFixed() on it directly.
export interface ComplianceBenchmark { id: string; connection_id: string; framework: 'cis_aws_foundations' | 'pci_dss' | 'iso_27001'; passed_checks: number; total_checks: number; last_evaluated_at: string; passRate: number | null }

export interface AlertRow { id: string; org_id: string; connection_id: string | null; resource_id: string | null; rule_id: string | null; severity: 'critical' | 'high' | 'medium' | 'low'; alert_name: string; status: 'open' | 'acknowledged' | 'in_progress' | 'resolved'; triggered_at: string; acknowledged_at: string | null; resolved_at: string | null; metadata: Record<string, unknown> }

// cloudops360-scanner-* microservices (Prowler, Trivy, Semgrep, Gitleaks,
// Checkov, Grype, Syft, TruffleHog, Nuclei, Dependency-Check) — see each
// repo's shared-lib types.ts for the authoritative schema this mirrors.
export interface ScanRecord {
  scan_id: string; tenant_id: string; scanner: string; scanner_version: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  scan_type: string; provider: string | null; asset_id: string | null;
  target: { type: string; uri: string }; created_at: string; started_at: string | null;
  finished_at: string | null; duration_ms: number | null; finding_count: number;
  error_count: number; error_message: string | null;
}
export interface ScannerFinding {
  finding_id: string; tenant_id: string; scan_id: string; scanner: string; scanner_version: string;
  asset_id: string | null; asset_type: string | null; resource_id: string | null; title: string;
  description: string | null; severity: 'informational' | 'low' | 'medium' | 'high' | 'critical';
  scanner_severity: string | null; cvss: number | null; cve: string | null; cwe: string | null;
  status: 'open' | 'resolved' | 'suppressed' | 'accepted_risk'; first_seen: string; last_seen: string;
  source_finding_id: string; location: Record<string, unknown> | null; references: string[] | null;
}
export interface AlertRule { id: string; org_id: string; name: string; condition: unknown; severity: string; notification_channels: unknown[]; enabled: boolean; created_at: string }
export interface NotificationChannel { id: string; org_id: string; channel_type: string; name: string; config: unknown; enabled: boolean; created_at: string }
export interface EscalationPolicy { id: string; org_id: string; name: string; steps: unknown[]; created_at: string }
export interface MaintenanceWindow { id: string; org_id: string; connection_id: string | null; name: string; starts_at: string; ends_at: string; recurrence: unknown; created_by: string; created_at: string }

export interface ReportRow { id: string; org_id: string; category: string; name: string; scope: unknown; format: string; status: 'pending' | 'generating' | 'delivered' | 'failed'; data_volume_mb: number | null; region: string | null; requested_by: string | null; generated_at: string | null; delivered_at: string | null; download_url: string | null; mime_type: string | null; error_message: string | null; created_at: string }
export interface ScheduledReport { id: string; org_id: string; report_category: string; name: string; scope: unknown; cadence: string; recipients: string[]; format: string; next_run_at: string | null; enabled: boolean; created_at: string }

export interface Member { roleGrantId: string; userId: string; role: Role; email: string | null; fullName: string | null; mfaEnabled: boolean }
export interface PendingInvite { id: string; email: string; role: Role; invitedBy: string | null; createdAt: string }
export interface PendingInviteRow { id: string; org_id: string; email: string; role: Role; invited_by: string; accepted_at: string | null; created_at: string }
export interface UserGroup { id: string; name: string; createdAt: string; memberIds: string[] }
export interface ApiKeySummary { id: string; name: string; key_prefix: string; last_used_at: string | null; revoked_at: string | null; created_at: string; user_id: string }

export interface OrganizationRow { id: string; name: string; slug: string; mfa_required: boolean; ip_allowlist: string[]; branding: Record<string, unknown>; plan: string; seats: number; settings: Record<string, unknown>; created_by: string; created_at: string; myRole?: Role }
export interface FolderRow { id: string; parent_folder_id: string | null; name: string; monthly_budget: number | null; required_tags: string[]; allowed_regions: string[]; business_unit_id: string | null; cost_center_id: string | null; created_at: string }
export interface ProjectRow { id: string; folder_id: string | null; name: string; slug: string; monthly_budget: number | null; business_unit_id: string | null; cost_center_id: string | null; created_at: string }
export interface BusinessUnit { id: string; name: string; code: string | null; created_at: string }
export interface CostCenter { id: string; business_unit_id: string | null; name: string; code: string | null; created_at: string }
export interface HierarchyNode { orgId: string; folders: HierarchyFolder[]; unfiledProjects: { id: string; name: string; connectionCount: number }[] }
export interface HierarchyFolder { id: string; name: string; projects: { id: string; name: string; connectionCount: number }[]; children: HierarchyFolder[] }

export interface CustomDashboard { id: string; org_id: string; owner_id: string; name: string; description: string | null; widgets: unknown[]; is_shared: boolean; is_template: boolean; source_template_id: string | null; created_at: string; updated_at: string }
export interface DashboardWidgetCatalogEntry { key: string; widget_type: string; display_name: string; description: string | null; default_config: Record<string, unknown>; category: string }

export interface Runbook { id: string; org_id: string; name: string; description: string | null; category: string; steps: unknown[]; created_by: string | null; created_at: string; updated_at: string }
export interface Workflow { id: string; org_id: string; name: string; description: string | null; trigger: unknown; steps: unknown[]; enabled: boolean; created_by: string | null; created_at: string; updated_at: string }
export interface ScheduledJob { id: string; org_id: string; name: string; job_type: string; schedule_cron: string; target: unknown; enabled: boolean; last_run_at: string | null; next_run_at: string | null; created_at: string }
export interface AutomationExecution { id: string; org_id: string; automation_type: string; automation_id: string | null; status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'; started_at: string | null; finished_at: string | null; triggered_by: string | null; output: unknown; error_message: string | null; created_at: string }
export interface Webhook { id: string; org_id: string; name: string; url: string; events: string[]; platform: 'generic' | 'slack'; enabled: boolean; last_triggered_at: string | null; created_at: string }
export interface Integration { id: string; org_id: string; category: string; provider_name: string; status: 'connected' | 'disconnected' | 'error'; connected_on: string | null; last_sync_at: string | null; account_region: string | null; config: unknown; created_at: string }

export type MenuPermissionLevel = 'none' | 'read' | 'write' | 'admin';
export interface MenuPermissionRow { id: string; user_id: string | null; group_id: string | null; menu_key: string; level: MenuPermissionLevel; created_at: string; updated_at: string }

export interface ResourceGrantRow { id: string; user_id: string | null; connection_id: string; created_at: string }

export interface ChatSource { type: string; summary: string }
export interface ChatReply { conversationId: string; message: string; sources: ChatSource[] }
export interface ConversationSummary { id: string; title: string; pinned: boolean; created_at: string; updated_at: string }
export interface ChatMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; sources: ChatSource[]; created_at: string }
