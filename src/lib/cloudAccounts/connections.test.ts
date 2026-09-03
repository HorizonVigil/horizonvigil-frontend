import { describe, it, expect } from 'vitest';
import { deriveConnections, connectionState } from './connections';
import type { UnifiedAccountRow } from '../unifiedAccounts';

function aws(over: Partial<UnifiedAccountRow> & { method?: string; externalId?: string } = {}): UnifiedAccountRow {
  const { method = 'cross_account_role', externalId, ...rest } = over;
  return {
    id: over.id ?? `aws-${Math.random()}`,
    provider: 'aws',
    name: over.name ?? 'acct',
    identifier: over.identifier ?? '111111111111',
    environment: over.environment ?? 'production',
    status: over.status ?? 'connected',
    errorMessage: null,
    connectionMethod: method,
    connectionMethodLabel: method,
    region: 'us-east-1',
    resources: 0,
    lastSync: over.lastSync ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: { connection_method: method, external_id: externalId ?? null } as any,
    ...rest,
  };
}

function azure(tenant: string, over: Partial<UnifiedAccountRow> = {}): UnifiedAccountRow {
  return {
    id: over.id ?? `az-${Math.random()}`, provider: 'azure', name: 'sub', identifier: 'sub-1',
    environment: 'production', status: over.status ?? 'connected', errorMessage: null,
    connectionMethod: 'service_principal', connectionMethodLabel: 'SP', region: 'global',
    resources: 0, lastSync: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: { azure_tenant_id: tenant } as any,
    ...over,
  };
}

describe('deriveConnections', () => {
  it('groups AWS cross-account-role rows sharing an external_id into one Organization connection', () => {
    const rows = [
      aws({ id: 'a', method: 'cross_account_role', externalId: 'ext-abc' }),
      aws({ id: 'b', method: 'cross_account_role', externalId: 'ext-abc' }),
      aws({ id: 'c', method: 'cross_account_role', externalId: 'ext-abc' }),
    ];
    const conns = deriveConnections(rows);
    expect(conns).toHaveLength(1);
    expect(conns[0].kind).toBe('aws_organization');
    expect(conns[0].accountCount).toBe(3);
    expect(conns[0].accountIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('separates access-key rows, role rows without an external id, and different tenants', () => {
    const conns = deriveConnections([
      aws({ id: 'k1', method: 'access_key' }),
      aws({ id: 'r1', method: 'cross_account_role', externalId: undefined }),
      azure('tenant-1', { id: 'z1' }),
      azure('tenant-2', { id: 'z2' }),
    ]);
    const kinds = conns.map((c) => c.kind).sort();
    expect(kinds).toEqual(['aws_access_key', 'aws_role', 'azure_tenant', 'azure_tenant']);
  });

  it('Organization connections sort first', () => {
    const conns = deriveConnections([
      aws({ id: 'k1', method: 'access_key' }),
      aws({ id: 'o1', method: 'cross_account_role', externalId: 'x' }),
    ]);
    expect(conns[0].kind).toBe('aws_organization');
  });

  it('rolls up status counts and environments', () => {
    const conns = deriveConnections([
      aws({ id: 'a', method: 'cross_account_role', externalId: 'x', status: 'connected', environment: 'production' }),
      aws({ id: 'b', method: 'cross_account_role', externalId: 'x', status: 'error', environment: 'staging' }),
    ]);
    expect(conns[0].statusCounts).toEqual({ connected: 1, error: 1 });
    expect(conns[0].environments).toEqual(['production', 'staging']);
  });
});

describe('connectionState', () => {
  const base = { id: 'x', label: 'l', provider: 'aws' as const, kind: 'aws_organization' as const, connectionType: 'Organization', accountCount: 1, environments: [], accountIds: [], lastSync: null };
  it('error dominates', () => {
    expect(connectionState({ ...base, statusCounts: { connected: 5, error: 1 } })).toBe('error');
  });
  it('pending when any pending and no error', () => {
    expect(connectionState({ ...base, statusCounts: { connected: 5, pending: 1 } })).toBe('pending');
  });
  it('connected otherwise', () => {
    expect(connectionState({ ...base, statusCounts: { connected: 5 } })).toBe('connected');
  });
});
