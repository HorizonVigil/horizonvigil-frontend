import type {
  AzureConnection,
  CloudConnection,
  GcpConnection,
} from './api';

export type CloudProvider = 'aws' | 'gcp' | 'azure';

export type UnifiedAccountConnection =
  | CloudConnection
  | GcpConnection
  | AzureConnection;

/**
 * Canonical UI-facing shape for AWS, GCP, and Azure connection rows.
 *
 * Downstream consumers such as search, filters, sorting, dropdowns, and
 * actions should use this normalized representation instead of branching on
 * provider-specific fields at every access site.
 *
 * Provider-specific data remains available through `raw` for actions that
 * genuinely require it.
 */
export interface UnifiedAccountRow {
  readonly id: string;
  readonly provider: CloudProvider;
  readonly name: string;
  readonly identifier: string;
  readonly environment: string;
  readonly status: string;
  readonly errorMessage: string | null;
  readonly connectionMethod: string;
  readonly connectionMethodLabel: string;
  readonly region: string;
  readonly resources: number | null;
  readonly lastSync: string | null;
  readonly raw: UnifiedAccountConnection;
}

function normalizeText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim();
  return normalized || fallback;
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeResourceCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  // Resource counts are counts, not measurements. Never expose a negative
  // count or a fractional count to the UI.
  if (value < 0) return null;

  return Math.floor(value);
}

function normalizeConnectionMethod(value: unknown): string {
  return normalizeText(value, 'unknown');
}

function normalizeEnvironment(value: unknown): string {
  return normalizeText(value, 'unknown');
}

function normalizeStatus(value: unknown): string {
  return normalizeText(value, 'unknown');
}

function normalizeRegion(value: unknown): string {
  return normalizeText(value, 'global');
}

function normalizeId(value: unknown): string {
  return normalizeText(value);
}

export function toUnifiedRow(c: CloudConnection): UnifiedAccountRow {
  const identifier = normalizeText(c.aws_account_id, 'Unknown AWS account');

  return {
    id: normalizeId(c.id),
    provider: 'aws',
    name: normalizeText(c.connection_name, identifier),
    identifier,
    environment: normalizeEnvironment(c.environment),
    status: normalizeStatus(c.status),
    errorMessage: normalizeOptionalText(c.error_message),
    connectionMethod: normalizeConnectionMethod(c.connection_method),
    connectionMethodLabel:
      c.connection_method === 'cross_account_role'
        ? 'Cross-account role'
        : c.connection_method === 'access_key'
          ? 'Access key'
          : 'Unknown',
    region: normalizeRegion(c.default_region),
    resources: normalizeResourceCount(c.resource_summary?.totalResources),
    lastSync: normalizeOptionalText(c.last_sync_at),
    raw: c,
  };
}

export function toUnifiedGcpRow(c: GcpConnection): UnifiedAccountRow {
  const identifier = normalizeText(c.gcp_project_id, 'Unknown GCP project');

  return {
    id: normalizeId(c.id),
    provider: 'gcp',
    name: normalizeText(c.connection_name, identifier),
    identifier,
    environment: normalizeEnvironment(c.environment),
    status: normalizeStatus(c.status),
    errorMessage: normalizeOptionalText(c.error_message),
    connectionMethod: normalizeConnectionMethod(c.connection_method),
    connectionMethodLabel:
      c.connection_method === 'service_account_impersonation'
        ? 'Impersonation'
        : c.connection_method === 'service_account_key'
          ? 'Service account key'
          : 'Unknown',
    region: normalizeRegion(c.default_region),
    resources: normalizeResourceCount(c.resource_summary?.totalResources),
    lastSync: normalizeOptionalText(c.last_sync_at),
    raw: c,
  };
}

export function toUnifiedAzureRow(c: AzureConnection): UnifiedAccountRow {
  const identifier = normalizeText(
    c.azure_subscription_id,
    'Unknown Azure subscription',
  );

  return {
    id: normalizeId(c.id),
    provider: 'azure',
    name: normalizeText(c.connection_name, identifier),
    identifier,
    environment: normalizeEnvironment(c.environment),
    status: normalizeStatus(c.status),
    errorMessage: normalizeOptionalText(c.error_message),
    connectionMethod: normalizeConnectionMethod(c.connection_method),
    connectionMethodLabel:
      c.azure_auth_type === 'client_certificate'
        ? 'Service principal (certificate)'
        : c.azure_auth_type === 'client_secret'
          ? 'Service principal (secret)'
          : 'Service principal',
    // Azure discovery is subscription-wide in the current connector contract;
    // there is no per-connection default region equivalent to AWS/GCP.
    region: 'global',
    resources: normalizeResourceCount(c.resource_summary?.totalResources),
    lastSync: normalizeOptionalText(c.last_sync_at),
    raw: c,
  };
}
