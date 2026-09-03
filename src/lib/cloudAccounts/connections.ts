/**
 * Cloud Accounts — the "Connections" view (spec §13–16).
 *
 * The spec models a first-class Connection entity ("AWS Organization
 * Connection" → 820 accounts). HorizonVigil's data model doesn't have one
 * today — every account IS a `cloud_connections` row — so this derives the
 * grouping the UI needs from what exists, honestly:
 *
 *   - AWS cross-account-role rows sharing one `external_id` → one
 *     "AWS Organization Connection" (that's what bulk-import-from-organization
 *     produces — every member account trusts the same per-org external id).
 *   - AWS access-key rows → grouped as "AWS IAM User connections".
 *   - Azure service-principal rows sharing one tenant → one
 *     "Azure Tenant Connection".
 *   - GCP rows grouped by connection method.
 *
 * Pure + unit-tested. When a real Connection entity lands server-side this
 * becomes a thin adapter over it.
 */
import type { UnifiedAccountRow } from '../unifiedAccounts';
import type { CloudConnection, GcpConnection, AzureConnection } from '../api';

export type ConnectionKind =
  | 'aws_organization' | 'aws_role' | 'aws_access_key'
  | 'azure_tenant' | 'gcp_service_account' | 'gcp_impersonation';

export interface DerivedConnection {
  id: string; // synthetic, stable for a given grouping key
  label: string;
  provider: 'aws' | 'azure' | 'gcp';
  kind: ConnectionKind;
  connectionType: string; // human label, e.g. "Organization", "Cross-account role"
  accountCount: number;
  statusCounts: Record<string, number>;
  environments: string[];
  /** the account rows that roll up into this connection */
  accountIds: string[];
  /** newest lastSync across the group, or null */
  lastSync: string | null;
}

const KIND_LABEL: Record<ConnectionKind, { label: string; type: string }> = {
  aws_organization: { label: 'AWS Organization', type: 'Organization' },
  aws_role: { label: 'AWS Cross-Account Roles', type: 'Cross-account role' },
  aws_access_key: { label: 'AWS IAM User Keys', type: 'Access key' },
  azure_tenant: { label: 'Azure Tenant', type: 'Tenant' },
  gcp_service_account: { label: 'GCP Service Account Keys', type: 'Service account key' },
  gcp_impersonation: { label: 'GCP Impersonation', type: 'Impersonation' },
};

function groupKeyFor(row: UnifiedAccountRow): { kind: ConnectionKind; sub: string } {
  if (row.provider === 'aws') {
    const raw = row.raw as CloudConnection;
    if (raw.connection_method === 'cross_account_role') {
      // Rows sharing one external_id came from one Organization onboarding.
      const ext = raw.external_id?.trim();
      return ext ? { kind: 'aws_organization', sub: ext } : { kind: 'aws_role', sub: '_' };
    }
    return { kind: 'aws_access_key', sub: '_' };
  }
  if (row.provider === 'azure') {
    const raw = row.raw as AzureConnection;
    return { kind: 'azure_tenant', sub: raw.azure_tenant_id || '_' };
  }
  const raw = row.raw as GcpConnection;
  return raw.connection_method === 'service_account_impersonation'
    ? { kind: 'gcp_impersonation', sub: '_' }
    : { kind: 'gcp_service_account', sub: '_' };
}

export function deriveConnections(rows: UnifiedAccountRow[]): DerivedConnection[] {
  const groups = new Map<string, UnifiedAccountRow[]>();
  for (const row of rows) {
    const { kind, sub } = groupKeyFor(row);
    const key = `${kind}:${sub}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: DerivedConnection[] = [];
  for (const [key, list] of groups) {
    const [kind, sub] = key.split(/:(.+)/) as [ConnectionKind, string];
    const statusCounts: Record<string, number> = {};
    const envs = new Set<string>();
    let lastSync: string | null = null;
    for (const r of list) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
      if (r.environment) envs.add(r.environment);
      if (r.lastSync && (!lastSync || r.lastSync > lastSync)) lastSync = r.lastSync;
    }
    const meta = KIND_LABEL[kind];
    const suffix = sub && sub !== '_' && sub.length <= 12 ? ` (${sub})` : '';
    out.push({
      id: key,
      label: `${meta.label}${suffix}`,
      provider: list[0].provider,
      kind,
      connectionType: meta.type,
      accountCount: list.length,
      statusCounts,
      environments: [...envs].sort(),
      accountIds: list.map((r) => r.id),
      lastSync,
    });
  }

  // Organization connections first, then by account count desc.
  const order: ConnectionKind[] = ['aws_organization', 'azure_tenant', 'aws_role', 'aws_access_key', 'gcp_service_account', 'gcp_impersonation'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.accountCount - a.accountCount);
}

/** Roll a connection's per-status counts into one summary state for the Connections table. */
export function connectionState(c: DerivedConnection): 'connected' | 'warning' | 'error' | 'pending' {
  if (c.statusCounts.error || c.statusCounts.expired) return 'error';
  if (c.statusCounts.pending) return 'pending';
  if (c.statusCounts.disconnected && !c.statusCounts.connected) return 'warning';
  return 'connected';
}
