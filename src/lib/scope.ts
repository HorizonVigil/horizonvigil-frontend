/**
 * App-wide org / folder / project scope filtering.
 *
 * This module is the pure scope-resolution boundary used by UI consumers that
 * need to turn an org/folder/project Scope into a connection set.
 *
 * Rules:
 * - null/org scope means unscoped and therefore matches every connection;
 * - project scope matches exactly that project;
 * - folder scope matches projects directly in the folder and recursively in
 *   descendant folders;
 * - malformed cyclic folder trees cannot recurse forever;
 * - callers never receive shared mutable internal state.
 *
 * Backend authorization remains authoritative. These helpers only determine
 * which rows the client should display/query within the currently selected
 * UI scope.
 */
import type { FolderRow, ProjectRow } from './api';
import type { Scope } from './orgContext';
import type { UnifiedAccountRow } from './unifiedAccounts';

type ProjectId = string;
type FolderId = string;

function normalizeId(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * All project IDs that live directly in `folderId`, or in any descendant
 * folder, recursively.
 *
 * The traversal is cycle-safe and uses iterative DFS to avoid browser call
 * stack growth with unexpectedly deep or malformed folder trees.
 */
export function projectIdsInFolder(
  folderId: string,
  folders: readonly FolderRow[],
  projects: readonly ProjectRow[],
): Set<ProjectId> {
  const rootFolderId = normalizeId(folderId);
  if (!rootFolderId) return new Set<string>();

  const childrenByParent = new Map<FolderId | null, FolderRow[]>();

  for (const folder of folders) {
    const id = normalizeId(folder.id);
    if (!id) continue;

    const parentId = normalizeId(folder.parent_folder_id);

    const children = childrenByParent.get(parentId);
    if (children) {
      children.push(folder);
    } else {
      childrenByParent.set(parentId, [folder]);
    }
  }

  const projectsByFolder = new Map<FolderId | null, ProjectRow[]>();

  for (const project of projects) {
    const projectId = normalizeId(project.id);
    if (!projectId) continue;

    const folderId = normalizeId(project.folder_id);

    const bucket = projectsByFolder.get(folderId);
    if (bucket) {
      bucket.push(project);
    } else {
      projectsByFolder.set(folderId, [project]);
    }
  }

  const result = new Set<ProjectId>();
  const visited = new Set<FolderId>();
  const stack: FolderId[] = [rootFolderId];

  while (stack.length > 0) {
    const currentFolderId = stack.pop()!;

    if (visited.has(currentFolderId)) continue;
    visited.add(currentFolderId);

    for (const project of projectsByFolder.get(currentFolderId) ?? []) {
      const projectId = normalizeId(project.id);
      if (projectId) result.add(projectId);
    }

    for (const child of childrenByParent.get(currentFolderId) ?? []) {
      const childId = normalizeId(child.id);
      if (childId && !visited.has(childId)) {
        stack.push(childId);
      }
    }
  }

  return result;
}

/**
 * Returns whether a connection's project_id belongs to the supplied scope.
 *
 * A null/org scope is intentionally unscoped. A non-org scope requires a
 * concrete project ID; a project-less connection therefore never leaks into
 * a folder/project-scoped result.
 */
export function connectionInScope(
  projectId: string | null | undefined,
  scope: Scope | null,
  folders: readonly FolderRow[],
  projects: readonly ProjectRow[],
): boolean {
  if (!scope || scope.type === 'org') return true;

  const normalizedProjectId = normalizeId(projectId);
  const normalizedScopeId = normalizeId(scope.id);

  if (!normalizedProjectId || !normalizedScopeId) return false;

  if (scope.type === 'project') {
    return normalizedProjectId === normalizedScopeId;
  }

  if (scope.type === 'folder') {
    return projectIdsInFolder(
      normalizedScopeId,
      folders,
      projects,
    ).has(normalizedProjectId);
  }

  return false;
}

/**
 * Filters unified connection rows to the selected client scope.
 *
 * For null/org scope the original array is returned unchanged by reference;
 * this avoids unnecessary allocations in the common unscoped case.
 *
 * For folder/project scope a new array is returned, preserving source order.
 */
export function filterConnectionsByScope(
  rows: readonly UnifiedAccountRow[],
  scope: Scope | null,
  folders: readonly FolderRow[],
  projects: readonly ProjectRow[],
): UnifiedAccountRow[] {
  if (!scope || scope.type === 'org') {
    return rows as UnifiedAccountRow[];
  }

  const normalizedScopeId = normalizeId(scope.id);
  if (!normalizedScopeId) return [];

  if (scope.type === 'project') {
    return rows.filter(
      (row) =>
        normalizeId(row.raw?.project_id) === normalizedScopeId,
    );
  }

  if (scope.type === 'folder') {
    const projectIds = projectIdsInFolder(
      normalizedScopeId,
      folders,
      projects,
    );

    if (projectIds.size === 0) return [];

    return rows.filter((row) => {
      const projectId = normalizeId(row.raw?.project_id);
      return projectId !== null && projectIds.has(projectId);
    });
  }

  return [];
}

/**
 * Returns the IDs of connections that belong to the selected scope.
 *
 * `null` means "unscoped / entire organization" and is intentionally distinct
 * from an empty Set, which means "scoped but no connections matched."
 */
export function scopedConnectionIdSet(
  allConnections: readonly UnifiedAccountRow[],
  scope: Scope | null,
  folders: readonly FolderRow[],
  projects: readonly ProjectRow[],
): Set<string> | null {
  if (!scope || scope.type === 'org') return null;

  const filtered = filterConnectionsByScope(
    allConnections,
    scope,
    folders,
    projects,
  );

  const result = new Set<string>();

  for (const connection of filtered) {
    const id = normalizeId(connection.id);
    if (id) result.add(id);
  }

  return result;
}
