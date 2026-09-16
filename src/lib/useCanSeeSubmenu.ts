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
 * Canonical UI-facing representation of a cloud connection.
 *
 * Search, filtering, sorting, selectors, and common account-row rendering
 * should consume this shape rather than branching on provider-specific fields.
 *
 * `raw` deliberately retains the original API object for operations that
 * genuinely require provider-specific fields. Treat it as read-only in UI
 * code; the normalizer does not mutate the source object.
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

const UNKNOWN_NAME = 'Unknown';
const UNKNOWN_IDENTIFIER = 'Unknown identifier';
const UNKNOWN_ENVIRONMENT = 'unknown';
const UNKNOWN_STATUS = 'unknown';
const UNKNOWN_METHOD = 'unknown';
const UNKNOWN_METHOD_LABEL = 'Unknown';
const GLOBAL_REGION = 'global';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function displayValue(value: unknown, fallback: string): string {
  const normalized = normalizeText(value);
  return normalized || fallback;
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized || null;
}

function normalizeResourceCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function normalizeId(value: unknown): string {
  return normalizeText(value);
}

function normalizeEnvironment(value: unknown): string {
  return displayValue(value, UNKNOWN_ENVIRONMENT);
}

function normalizeStatus(value: unknown): string {
  return displayValue(value, UNKNOWN_STATUS);
}

function normalizeConnectionMethod(value: unknown): string {
  return displayValue(value, UNKNOWN_METHOD);
}

function normalizeRegion(value: unknown): string {
  return displayValue(value, GLOBAL_REGION);
}

/**
 * Important: this returns the real provider identifier when available.
 * It does NOT manufacture a fake identifier such as "Unknown AWS account".
 *
 * Common actions should refuse to execute when `identifier` is empty rather
 * than accidentally sending a synthetic identifier to a backend.
 */
function normalizeIdentifier(value: unknown): string {
  return normalizeText(value);
}

function normalizeCommonFields(
  c: UnifiedAccountConnection,
  identifier: string,
): Pick<
  UnifiedAccountRow,
  | 'id'
  | 'name'
  | 'identifier'
  | 'environment'
  | 'status'
  | 'errorMessage'
  | 'connectionMethod'
  | 'region'
  | 'resources'
  | 'lastSync'
> {
  return {
    id: normalizeId(c.id),
    name: displayValue(c.connection_name, identifier || UNKNOWN_NAME),
    identifier,
    environment: normalizeEnvironment(c.environment),
    status: normalizeStatus(c.status),
    errorMessage: normalizeOptionalText(c.error_message),
    connectionMethod: normalizeConnectionMethod(c.connection_method),
    region: normalizeRegion(c.default_region),
    resources: normalizeResourceCount(c.resource_summary?.totalResources),
    lastSync: normalizeOptionalText(c.last_sync_at),
  };
}

export function toUnifiedRow(c: CloudConnection): UnifiedAccountRow {
  const identifier = normalizeIdentifier(c.aws_account_id);
  const common = normalizeCommonFields(c, identifier);

  return {
    ...common,
    provider: 'aws',
    connectionMethodLabel:
      c.connection_method === 'cross_account_role'
        ? 'Cross-account role'
        : c.connection_method === 'access_key'
          ? 'Access key'
          : UNKNOWN_METHOD_LABEL,
    raw: c,
  };
}

export function toUnifiedGcpRow(c: GcpConnection): UnifiedAccountRow {
  const identifier = normalizeIdentifier(c.gcp_project_id);
  const common = normalizeCommonFields(c, identifier);

  return {
    ...common,
    provider: 'gcp',
    connectionMethodLabel:
      c.connection_method === 'service_account_impersonation'
        ? 'Impersonation'
        : c.connection_method === 'service_account_key'
          ? 'Service account key'
          : UNKNOWN_METHOD_LABEL,
    raw: c,
  };
}

export function toUnifiedAzureRow(c: AzureConnection): UnifiedAccountRow {
  const identifier = normalizeIdentifier(c.azure_subscription_id);
  const common = normalizeCommonFields(c, identifier);

  return {
    ...common,
    provider: 'azure',
    connectionMethodLabel:
      c.azure_auth_type === 'client_certificate'
        ? 'Service principal (certificate)'
        : c.azure_auth_type === 'client_secret'
          ? 'Service principal (secret)'
          : 'Service principal',
    // Azure discovery is subscription-wide in the current connector contract;
    // there is no per-connection default region equivalent to AWS/GCP.
    region: GLOBAL_REGION,
    raw: c,
  };
}
