import { describe, it, expect } from 'vitest';
import { buildHierarchy, accountsInSubtree } from './hierarchy';
import type { HierarchyNode } from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';

function row(id: string, projectId: string | null): UnifiedAccountRow {
  return {
    id, provider: 'aws', name: id, identifier: id, environment: 'production', status: 'connected',
    errorMessage: null, connectionMethod: 'cross_account_role', connectionMethodLabel: 'role',
    region: 'us-east-1', resources: 0, lastSync: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: { project_id: projectId } as any,
  };
}

const hierarchy: HierarchyNode = {
  orgId: 'org-1',
  folders: [
    {
      id: 'f1', name: 'Payments', children: [
        { id: 'f1a', name: 'Payments Prod', children: [], projects: [{ id: 'p2', name: 'payment-api', connectionCount: 1 }] },
      ],
      projects: [{ id: 'p1', name: 'payment-web', connectionCount: 1 }],
    },
  ],
  unfiledProjects: [{ id: 'p3', name: 'sandbox', connectionCount: 0 }],
};

describe('buildHierarchy', () => {
  it('nests folders → projects → accounts and totals the subtree', () => {
    const rows = [row('a', 'p1'), row('b', 'p2'), row('c', 'p2'), row('d', null)];
    const tree = buildHierarchy('Acme', hierarchy, rows);

    expect(tree.type).toBe('org');
    expect(tree.name).toBe('Acme');
    expect(tree.accountTotal).toBe(4);

    const payments = tree.children.find((n) => n.id === 'f1');
    expect(payments?.type).toBe('folder');
    expect(payments?.accountTotal).toBe(3); // p1 (1) + p2 (2)

    const paymentApi = payments?.children.flatMap((c) => c.type === 'folder' ? c.children : [c]).find((n) => n.id === 'p2');
    expect(paymentApi?.accounts.map((a) => a.id).sort()).toEqual(['b', 'c']);

    const unassigned = tree.children.find((n) => n.type === 'unassigned');
    expect(unassigned?.accounts.map((a) => a.id)).toEqual(['d']);
  });

  it('handles a null hierarchy (org-management unavailable) — everything is unassigned', () => {
    const tree = buildHierarchy('Acme', null, [row('a', 'p1'), row('b', null)]);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].type).toBe('unassigned');
    expect(tree.children[0].accountTotal).toBe(2);
  });

  it('accountsInSubtree flattens all leaves', () => {
    const tree = buildHierarchy('Acme', hierarchy, [row('a', 'p1'), row('b', 'p2'), row('d', null)]);
    const payments = tree.children.find((n) => n.id === 'f1')!;
    expect(accountsInSubtree(payments).map((a) => a.id).sort()).toEqual(['a', 'b']);
  });
});
