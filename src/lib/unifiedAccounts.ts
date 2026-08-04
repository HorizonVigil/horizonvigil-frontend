import type { CloudConnection, GcpConnection } from './api';

/** Normalized shape both AWS and GCP connection rows get squashed into — everything downstream (search, filters, sort, dropdowns, actions) reads from this instead of branching on provider at every field access. Originally local to CloudAccounts.tsx's Inventory table; promoted here so filterContext.tsx's app-wide Account filter (and anything else that needs every connection regardless of provider) can share it instead of only ever seeing AWS accounts. */
export interface UnifiedAccountRow {
  id: string;
  provider: 'aws' | 'gcp';
  name: string;
  identifier: string; // aws_account_id or gcp_project_id
  environment: string;
  status: string;
  errorMessage: string | null;
  connectionMethod: string;
  connectionMethodLabel: string;
  region: string;
  resources: number | null;
  lastSync: string | null;
  raw: CloudConnection | GcpConnection;
}

export function toUnifiedRow(c: CloudConnection): UnifiedAccountRow {
  return {
    id: c.id, provider: 'aws', name: c.connection_name ?? c.aws_account_id, identifier: c.aws_account_id,
    environment: c.environment, status: c.status, errorMessage: c.error_message,
    connectionMethod: c.connection_method, connectionMethodLabel: c.connection_method === 'cross_account_role' ? 'Cross-account role' : 'Access key',
    region: c.default_region, resources: c.resource_summary?.totalResources ?? null, lastSync: c.last_sync_at, raw: c,
  };
}
export function toUnifiedGcpRow(c: GcpConnection): UnifiedAccountRow {
  return {
    id: c.id, provider: 'gcp', name: c.connection_name ?? c.gcp_project_id, identifier: c.gcp_project_id,
    environment: c.environment, status: c.status, errorMessage: c.error_message,
    connectionMethod: c.connection_method, connectionMethodLabel: c.connection_method === 'service_account_impersonation' ? 'Impersonation' : 'Service account key',
    region: c.default_region, resources: c.resource_summary?.totalResources ?? null, lastSync: c.last_sync_at, raw: c,
  };
}
