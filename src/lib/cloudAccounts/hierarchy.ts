/**
 * Cloud Accounts — the Hierarchy view (spec §25).
 *
 * Merges the org-management folder/project tree (`api.getHierarchyExplorer()`
 * → HierarchyNode, already exists) with this org's connected accounts so a
 * user can navigate Organization → Folder → Project → Account. The AWS
 * Organizations OU tree (`api.getAwsOrgHierarchy()`) is rendered as its own
 * section by the Hierarchy tab — this function handles the
 * provider-agnostic org/folder/project side.
 *
 * Pure + unit-tested.
 */
import type { HierarchyNode, HierarchyFolder } from '../api';
import type { UnifiedAccountRow } from '../unifiedAccounts';
import type { CloudConnection, GcpConnection, AzureConnection } from '../api';

export type HierNodeType = 'org' | 'folder' | 'project' | 'unassigned';

export interface HierNode {
  type: HierNodeType;
  id: string;
  name: string;
  children: HierNode[];
  /** accounts directly under this node (only populated on project / unassigned nodes) */
  accounts: UnifiedAccountRow[];
  /** total accounts in this subtree */
  accountTotal: number;
}

function projectIdOf(row: UnifiedAccountRow): string | null {
  const raw = row.raw as CloudConnection | GcpConnection | AzureConnection;
  return raw.project_id ?? null;
}

function foldFolder(folder: HierarchyFolder, byProject: Map<string, UnifiedAccountRow[]>, consumed: Set<string>): HierNode {
  const projectNodes: HierNode[] = folder.projects.map((p) => {
    consumed.add(p.id);
    const accounts = byProject.get(p.id) ?? [];
    return { type: 'project' as const, id: p.id, name: p.name, children: [], accounts, accountTotal: accounts.length };
  });
  const childNodes = folder.children.map((child) => foldFolder(child, byProject, consumed));
  const node: HierNode = {
    type: 'folder',
    id: folder.id,
    name: folder.name,
    children: [...childNodes, ...projectNodes],
    accounts: [],
    accountTotal: 0,
  };
  node.accountTotal = node.children.reduce((s, c) => s + c.accountTotal, 0);
  return node;
}

export function buildHierarchy(
  orgName: string,
  hierarchy: HierarchyNode | null,
  rows: UnifiedAccountRow[],
): HierNode {
  const byProject = new Map<string, UnifiedAccountRow[]>();
  const unassigned: UnifiedAccountRow[] = [];
  for (const row of rows) {
    const pid = projectIdOf(row);
    if (!pid) { unassigned.push(row); continue; }
    const list = byProject.get(pid) ?? [];
    list.push(row);
    byProject.set(pid, list);
  }

  const consumed = new Set<string>();
  const folderNodes = (hierarchy?.folders ?? []).map((f) => foldFolder(f, byProject, consumed));

  const unfiledProjectNodes: HierNode[] = (hierarchy?.unfiledProjects ?? []).map((p) => {
    consumed.add(p.id);
    const accounts = byProject.get(p.id) ?? [];
    return { type: 'project' as const, id: p.id, name: p.name, children: [], accounts, accountTotal: accounts.length };
  });

  // Accounts tagged with a project the org-management tree doesn't know about
  // (or a null hierarchy entirely) still need a home — fold them into
  // "unassigned" rather than dropping them.
  for (const [pid, list] of byProject) {
    if (!consumed.has(pid)) unassigned.push(...list);
  }

  const children: HierNode[] = [...folderNodes, ...unfiledProjectNodes];
  if (unassigned.length > 0) {
    children.push({ type: 'unassigned', id: '__unassigned__', name: 'Unassigned accounts', children: [], accounts: unassigned, accountTotal: unassigned.length });
  }

  const org: HierNode = {
    type: 'org',
    id: hierarchy?.orgId ?? 'org',
    name: orgName || 'Organization',
    children,
    accounts: [],
    accountTotal: rows.length,
  };
  return org;
}

/** Flatten a hierarchy subtree to its leaf accounts — used for "select all in this folder" bulk actions. */
export function accountsInSubtree(node: HierNode): UnifiedAccountRow[] {
  const out: UnifiedAccountRow[] = [...node.accounts];
  for (const child of node.children) out.push(...accountsInSubtree(child));
  return out;
}
