import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  accountsInSubtree,
  buildHierarchy,
} from './hierarchy';

import type { HierarchyNode } from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';

function row(
  id: string,
  projectId: string | null,
  overrides: Partial<UnifiedAccountRow> = {},
): UnifiedAccountRow {
  return {
    id,
    provider: 'aws',
    name: id,
    identifier: id,
    environment: 'production',
    status: 'connected',
    errorMessage: null,
    connectionMethod: 'cross_account_role',
    connectionMethodLabel: 'role',
    region: 'us-east-1',
    resources: 0,
    lastSync: null,
    raw: {
      project_id: projectId,
    },
    ...overrides,
  } as UnifiedAccountRow;
}

const hierarchy: HierarchyNode = {
  orgId: 'org-1',
  folders: [
    {
      id: 'f1',
      name: 'Payments',
      children: [
        {
          id: 'f1a',
          name: 'Payments Prod',
          children: [],
          projects: [
            {
              id: 'p2',
              name: 'payment-api',
              connectionCount: 1,
            },
          ],
        },
      ],
      projects: [
        {
          id: 'p1',
          name: 'payment-web',
          connectionCount: 1,
        },
      ],
    },
  ],
  unfiledProjects: [
    {
      id: 'p3',
      name: 'sandbox',
      connectionCount: 0,
    },
  ],
};

describe('buildHierarchy', () => {
  it('nests folders → projects → accounts and totals each subtree correctly', () => {
    const rows = [
      row('a', 'p1'),
      row('b', 'p2'),
      row('c', 'p2'),
      row('d', null),
    ];

    const tree = buildHierarchy(
      'Acme',
      hierarchy,
      rows,
    );

    expect(tree).toMatchObject({
      type: 'org',
      id: 'org-1',
      name: 'Acme',
      accountTotal: 4,
    });

    const payments =
      tree.children.find(
        (node) => node.id === 'f1',
      );

    expect(payments).toBeDefined();
    expect(payments?.type).toBe(
      'folder',
    );
    expect(payments?.accountTotal).toBe(
      3,
    );

    /*
     * p2 lives one level below the Payments folder. Do not depend on sibling
     * ordering because the production implementation intentionally makes the
     * tree deterministic by sorting node names.
     */
    const paymentApi =
      payments?.children
        .flatMap((child) =>
          child.type === 'folder'
            ? child.children
            : [child],
        )
        .find(
          (node) =>
            node.id === 'p2',
        );

    expect(paymentApi).toBeDefined();
    expect(
      paymentApi?.type,
    ).toBe('project');
    expect(
      paymentApi?.accounts.map(
        (account) => account.id,
      ),
    ).toEqual(['b', 'c']);

    const paymentWeb =
      payments?.children.find(
        (node) =>
          node.id === 'p1',
      );

    expect(
      paymentWeb?.accountTotal,
    ).toBe(1);
    expect(
      paymentWeb?.accounts.map(
        (account) => account.id,
      ),
    ).toEqual(['a']);

    const sandbox =
      tree.children.find(
        (node) =>
          node.id === 'p3',
      );

    expect(sandbox?.type).toBe(
      'project',
    );
    expect(
      sandbox?.accountTotal,
    ).toBe(0);

    const unassigned =
      tree.children.find(
        (node) =>
          node.type ===
          'unassigned',
      );

    expect(unassigned).toBeDefined();
    expect(
      unassigned?.accountTotal,
    ).toBe(1);
    expect(
      unassigned?.accounts.map(
        (account) => account.id,
      ),
    ).toEqual(['d']);
  });

  it('handles a null hierarchy by keeping every account visible as unassigned', () => {
    const rows = [
      row('a', 'p1'),
      row('b', null),
    ];

    const tree = buildHierarchy(
      'Acme',
      null,
      rows,
    );

    expect(tree.type).toBe(
      'org',
    );
    expect(tree.name).toBe(
      'Acme',
    );
    expect(tree.accountTotal).toBe(
      2,
    );

    expect(
      tree.children,
    ).toHaveLength(1);

    expect(
      tree.children[0].type,
    ).toBe('unassigned');

    expect(
      tree.children[0].accountTotal,
    ).toBe(2);

    expect(
      tree.children[0].accounts.map(
        (account) => account.id,
      ),
    ).toEqual(['a', 'b']);
  });

  it('keeps an account whose project is missing from hierarchy metadata', () => {
    const tree = buildHierarchy(
      'Acme',
      hierarchy,
      [
        row('known', 'p1'),
        row('orphan', 'does-not-exist'),
      ],
    );

    const unassigned =
      tree.children.find(
        (node) =>
          node.type ===
          'unassigned',
      );

    expect(
      unassigned?.accounts.map(
        (account) => account.id,
      ),
    ).toEqual([
      'orphan',
    ]);

    expect(
      tree.accountTotal,
    ).toBe(2);
  });

  it('keeps duplicate project references grouped under the same project', () => {
    const duplicateProjectHierarchy: HierarchyNode =
      {
        orgId: 'org-1',
        folders: [
          {
            id: 'f1',
            name: 'Folder',
            children: [],
            projects: [
              {
                id: 'p1',
                name: 'Project A',
                connectionCount: 2,
              },
            ],
          },
          {
            id: 'f2',
            name: 'Another Folder',
            children: [],
            projects: [
              {
                id: 'p1',
                name: 'Project A duplicate',
                connectionCount: 1,
              },
            ],
          },
        ],
        unfiledProjects: [],
      };

    const tree = buildHierarchy(
      'Acme',
      duplicateProjectHierarchy,
      [
        row('a', 'p1'),
      ],
    );

    /*
     * The current contract consumes a project ID the first time it is seen.
     * The account must therefore remain attached to exactly one project and
     * must not be duplicated into multiple branches.
     */
    const matchingNodes =
      tree.children.flatMap(
        (folder) =>
          folder.children.filter(
            (node) =>
              node.id === 'p1',
          ),
      );

    expect(
      matchingNodes,
    ).toHaveLength(1);

    expect(
      matchingNodes[0].accounts.map(
        (account) => account.id,
      ),
    ).toEqual(['a']);

    expect(
      tree.accountTotal,
    ).toBe(1);
  });

  it('does not mutate the caller-provided account array', () => {
    const rows = [
      row('b', 'p1'),
      row('a', 'p1'),
    ];

    const originalIds =
      rows.map(
        (account) => account.id,
      );

    buildHierarchy(
      'Acme',
      hierarchy,
      rows,
    );

    expect(
      rows.map(
        (account) => account.id,
      ),
    ).toEqual(originalIds);
  });

  it('uses safe organization defaults when the organization name is blank', () => {
    const tree = buildHierarchy(
      '   ',
      hierarchy,
      [],
    );

    expect(tree.id).toBe(
      'org-1',
    );
    expect(tree.name).toBe(
      'Organization',
    );
  });
});

describe('accountsInSubtree', () => {
  it('flattens all descendant accounts', () => {
    const tree = buildHierarchy(
      'Acme',
      hierarchy,
      [
        row('a', 'p1'),
        row('b', 'p2'),
        row('d', null),
      ],
    );

    const payments =
      tree.children.find(
        (node) =>
          node.id === 'f1',
      );

    expect(payments).toBeDefined();

    const accounts =
      accountsInSubtree(
        payments!,
      );

    expect(
      accounts.map(
        (account) => account.id,
      ).sort(),
    ).toEqual([
      'a',
      'b',
    ]);
  });

  it('returns a new array and does not mutate the hierarchy node', () => {
    const tree = buildHierarchy(
      'Acme',
      hierarchy,
      [
        row('a', 'p1'),
        row('b', 'p2'),
      ],
    );

    const payments =
      tree.children.find(
        (node) =>
          node.id === 'f1',
      )!;

    const first =
      accountsInSubtree(
        payments,
      );

    const second =
      accountsInSubtree(
        payments,
      );

    expect(first).not.toBe(
      second,
    );
    expect(
      first.map(
        (account) => account.id,
      ).sort(),
    ).toEqual(
      second.map(
        (account) => account.id,
      ).sort(),
    );
  });

  it('handles an empty hierarchy node', () => {
    const emptyNode = {
      type: 'project' as const,
      id: 'p-empty',
      name: 'Empty',
      children: [],
      accounts: [],
      accountTotal: 0,
    };

    expect(
      accountsInSubtree(
        emptyNode,
      ),
    ).toEqual([]);
  });
});
