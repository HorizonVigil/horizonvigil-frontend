/**
 * Cloud Accounts — Hierarchy view data model (spec §25).
 *
 * Merges the org-management folder/project tree returned by
 * `api.getHierarchyExplorer()` with this organization's connected environments.
 *
 * This module is intentionally pure:
 * - no React/router dependencies;
 * - no network access;
 * - no mutation of caller-owned arrays/maps;
 * - deterministic output for deterministic input.
 *
 * The provider-specific AWS Organizations OU tree is handled separately by
 * the Hierarchy tab. This module owns the provider-agnostic
 * Organization → Folder → Project → Account view.
 */

import type {
  AzureConnection,
  CloudConnection,
  GcpConnection,
  HierarchyFolder,
  HierarchyNode,
} from '../api';
// Single canonical home. The refactor also aliased it from '../api',
// which never exported it.
import type { UnifiedAccountRow } from '../unifiedAccounts';

export type HierNodeType =
  | 'org'
  | 'folder'
  | 'project'
  | 'unassigned';

export interface HierNode {
  type: HierNodeType;
  id: string;
  name: string;
  children: HierNode[];

  /**
   * Accounts directly under this node.
   *
   * Project and unassigned nodes normally contain accounts. Folder/org nodes
   * keep this empty and expose descendants through `children`.
   */
  accounts: UnifiedAccountRow[];

  /** Number of accounts contained in this entire subtree. */
  accountTotal: number;
}

const UNASSIGNED_NODE_ID =
  '__unassigned__';

const DEFAULT_ORG_ID = 'org';
const DEFAULT_ORG_NAME = 'Organization';

type RawConnection =
  | CloudConnection
  | GcpConnection
  | AzureConnection;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeId(
  value: unknown,
): string | null {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized || null;
}

function normalizeName(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();

  return normalized || fallback;
}

function projectIdOf(
  row: UnifiedAccountRow,
): string | null {
  /*
   * `raw` is provider-specific. Only read the property required by this
   * hierarchy adapter, and never allow an invalid raw value to throw.
   */
  if (!isRecord(row.raw)) {
    return null;
  }

  const raw =
    row.raw as RawConnection;

  return normalizeId(
    'project_id' in raw
      ? raw.project_id
      : null,
  );
}

function accountIdOf(
  row: UnifiedAccountRow,
  fallbackIndex: number,
): string {
  return (
    normalizeId(row.id) ??
    `account-${fallbackIndex}`
  );
}

function compareHierarchyNodes(
  a: HierNode,
  b: HierNode,
): number {
  /*
   * Keep folder/project ordering deterministic without changing the source
   * hierarchy's relative semantics:
   * - named nodes first;
   * - ID as a deterministic tie breaker.
   */
  const byName = a.name.localeCompare(
    b.name,
    undefined,
    {
      sensitivity: 'base',
      numeric: true,
    },
  );

  if (byName !== 0) {
    return byName;
  }

  return a.id.localeCompare(
    b.id,
    undefined,
    {
      numeric: true,
    },
  );
}

function sortAccounts(
  rows: UnifiedAccountRow[],
): UnifiedAccountRow[] {
  /*
   * Do not mutate the caller-owned array.
   *
   * Environment/account names are the most useful human ordering, with ID as
   * a deterministic fallback.
   */
  return [...rows].sort(
    (a, b) => {
      const aName =
        normalizeName(
          a.name,
          '',
        );
      const bName =
        normalizeName(
          b.name,
          '',
        );

      const byName =
        aName.localeCompare(
          bName,
          undefined,
          {
            sensitivity: 'base',
            numeric: true,
          },
        );

      if (byName !== 0) {
        return byName;
      }

      return accountIdOf(
        a,
        0,
      ).localeCompare(
        accountIdOf(
          b,
          0,
        ),
        undefined,
        {
          numeric: true,
        },
      );
    },
  );
}

function createProjectNode(
  project: HierarchyFolder['projects'][number],
  accounts: UnifiedAccountRow[],
): HierNode {
  const id =
    normalizeId(project.id) ??
    `project-${normalizeName(
      project.name,
      'unknown',
    )}`;

  return {
    type: 'project',
    id,
    name: normalizeName(
      project.name,
      'Unnamed project',
    ),
    children: [],
    accounts: sortAccounts(
      accounts,
    ),
    accountTotal: accounts.length,
  };
}

function createUnassignedNode(
  accounts: UnifiedAccountRow[],
): HierNode {
  const normalizedAccounts =
    sortAccounts(accounts);

  return {
    type: 'unassigned',
    id: UNASSIGNED_NODE_ID,
    name: 'Unassigned accounts',
    children: [],
    accounts: normalizedAccounts,
    accountTotal:
      normalizedAccounts.length,
  };
}

function foldFolder(
  folder: HierarchyFolder,
  byProject: Map<
    string,
    UnifiedAccountRow[]
  >,
  consumed: Set<string>,
): HierNode {
  const projectNodes =
    Array.isArray(folder.projects)
      ? folder.projects
          .filter(
            (project) =>
              Boolean(project),
          )
          .map((project) => {
            const id =
              normalizeId(project.id);

            if (!id) {
              /*
               * An invalid project node cannot safely participate in
               * consumption matching or React keys. Ignore only that malformed
               * hierarchy node; its accounts remain recoverable through the
               * orphan/unassigned pass below.
               */
              return null;
            }

            /*
             * First folder to claim a project id wins.
             *
             * The same project appearing under two folders used to emit a
             * node in BOTH, and each node pulled the same accounts out of
             * byProject -- so one account was rendered twice and counted
             * twice in accountTotal. A duplicated id is a data anomaly; the
             * response to it must not be to inflate the estate.
             */
            if (consumed.has(id)) {
              return null;
            }

            consumed.add(id);

            return createProjectNode(
              {
                ...project,
                id,
              },
              byProject.get(id) ??
                [],
            );
          })
          .filter(
            (
              node,
            ): node is HierNode =>
              node !== null,
          )
      : [];

  const childNodes =
    Array.isArray(folder.children)
      ? folder.children
          .filter(
            (child) =>
              Boolean(child),
          )
          .map((child) =>
            foldFolder(
              child,
              byProject,
              consumed,
            ),
          )
      : [];

  const children = [
    ...childNodes,
    ...projectNodes,
  ].sort(compareHierarchyNodes);

  const id =
    normalizeId(folder.id) ??
    `folder-${normalizeName(
      folder.name,
      'unknown',
    )}`;

  const node: HierNode = {
    type: 'folder',
    id,
    name: normalizeName(
      folder.name,
      'Unnamed folder',
    ),
    children,
    accounts: [],
    accountTotal: 0,
  };

  node.accountTotal =
    children.reduce(
      (total, child) =>
        total + child.accountTotal,
      0,
    );

  return node;
}

function createRootProjects(
  projects: HierarchyNode['unfiledProjects'],
  byProject: Map<
    string,
    UnifiedAccountRow[]
  >,
  consumed: Set<string>,
): HierNode[] {
  if (!Array.isArray(projects)) {
    return [];
  }

  return projects
    .map((project) => {
      const id =
        normalizeId(project.id);

      if (!id) {
        return null;
      }

      // Same rule as the folder path: a project id already placed in the
      // tree is not emitted again, so its accounts cannot be counted twice.
      if (consumed.has(id)) {
        return null;
      }

      consumed.add(id);

      return createProjectNode(
        {
          ...project,
          id,
        },
        byProject.get(id) ??
          [],
      );
    })
    .filter(
      (
        node,
      ): node is HierNode =>
        node !== null,
    )
    .sort(compareHierarchyNodes);
}

export function buildHierarchy(
  orgName: string,
  hierarchy: HierarchyNode | null,
  rows: UnifiedAccountRow[],
): HierNode {
  const safeRows = Array.isArray(
    rows,
  )
    ? rows.filter(
        (
          row,
        ): row is UnifiedAccountRow =>
          Boolean(
            row &&
              typeof row ===
                'object',
          ),
      )
    : [];

  const byProject =
    new Map<
      string,
      UnifiedAccountRow[]
    >();

  const initiallyUnassigned: UnifiedAccountRow[] =
    [];

  /*
   * Preserve every connected environment. A missing project_id is not a reason
   * to drop an account from the hierarchy.
   */
  safeRows.forEach((row) => {
    const projectId =
      projectIdOf(row);

    if (!projectId) {
      initiallyUnassigned.push(
        row,
      );
      return;
    }

    const current =
      byProject.get(projectId) ??
      [];

    current.push(row);
    byProject.set(
      projectId,
      current,
    );
  });

  const consumed =
    new Set<string>();

  const folderNodes =
    hierarchy &&
    Array.isArray(
      hierarchy.folders,
    )
      ? hierarchy.folders
          .filter(
            (folder) =>
              Boolean(folder),
          )
          .map((folder) =>
            foldFolder(
              folder,
              byProject,
              consumed,
            ),
          )
          .sort(
            compareHierarchyNodes,
          )
      : [];

  const unfiledProjectNodes =
    hierarchy
      ? createRootProjects(
          hierarchy.unfiledProjects,
          byProject,
          consumed,
        )
      : [];

  /*
   * Anything with a project_id that the current org-management hierarchy does
   * not know about must remain visible. This handles stale/incomplete
   * hierarchy metadata without silently dropping real connected environments.
   */
  const orphanedAccounts =
    [...byProject.entries()]
      .filter(
        ([projectId]) =>
          !consumed.has(projectId),
      )
      .flatMap(
        ([, accounts]) => accounts,
      );

  const unassignedAccounts = [
    ...initiallyUnassigned,
    ...orphanedAccounts,
  ];

  const children: HierNode[] = [
    ...folderNodes,
    ...unfiledProjectNodes,
  ];

  if (
    unassignedAccounts.length >
    0
  ) {
    children.push(
      createUnassignedNode(
        unassignedAccounts,
      ),
    );
  }

  const orgId =
    normalizeId(
      hierarchy?.orgId,
    ) ??
    DEFAULT_ORG_ID;

  const normalizedOrgName =
    normalizeName(
      orgName,
      DEFAULT_ORG_NAME,
    );

  /*
   * `accountTotal` intentionally reflects the connected rows supplied to this
   * function, not the account totals declared by hierarchy metadata. This keeps
   * the number honest when hierarchy and connection data temporarily disagree.
   */
  return {
    type: 'org',
    id: orgId,
    name: normalizedOrgName,
    children,
    accounts: [],
    accountTotal:
      safeRows.length,
  };
}

/**
 * Flattens a hierarchy subtree to its leaf accounts.
 *
 * Used by bulk-selection actions such as "select all environments in this
 * folder".
 *
 * The returned array is always newly allocated and contains each account once
 * for a well-formed hierarchy.
 */
export function accountsInSubtree(
  node: HierNode,
): UnifiedAccountRow[] {
  const result: UnifiedAccountRow[] =
    [];

  const walk = (
    current: HierNode,
  ) => {
    if (
      Array.isArray(
        current.accounts,
      )
    ) {
      result.push(
        ...current.accounts,
      );
    }

    if (
      Array.isArray(
        current.children,
      )
    ) {
      for (const child of current.children) {
        walk(child);
      }
    }
  };

  walk(node);

  return result;
}
