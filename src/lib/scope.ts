/**
 * App-wide org / folder / project scope filtering (pure, unit-tested).
 *
 * `useOrg().scope` (set by `<ScopePicker>`) previously had no effect on any
 * page's data — connections were always fetched org-wide and nothing read
 * `scope` to narrow them. This is the one place that turns a `Scope` into
 * "which connections are in it", so every consumer filters consistently:
 * a project scope means exactly that project's connections; a folder scope
 * means every connection in that folder or any of its descendant folders'
 * projects, recursively.
 */
import type { FolderRow, ProjectRow } from './api';
import type { Scope } from './orgContext';
import type { UnifiedAccountRow } from './unifiedAccounts';

/** All project ids that live directly in `folderId`, or in any folder nested under it (recursively). Cycle-safe. */
export function projectIdsInFolder(folderId: string, folders: FolderRow[], projects: ProjectRow[]): Set<string> {
  const childFolders = new Map<string | null, FolderRow[]>();
  for (const f of folders) {
    const k = f.parent_folder_id;
    if (!childFolders.has(k)) childFolders.set(k, []);
    childFolders.get(k)!.push(f);
  }
  const projectsByFolder = new Map<string | null, ProjectRow[]>();
  for (const p of projects) {
    const k = p.folder_id;
    if (!projectsByFolder.has(k)) projectsByFolder.set(k, []);
    projectsByFolder.get(k)!.push(p);
  }

  const result = new Set<string>();
  const visited = new Set<string>();
  function walk(id: string) {
    if (visited.has(id)) return; // cyclic parent chain guard
    visited.add(id);
    for (const p of projectsByFolder.get(id) ?? []) result.add(p.id);
    for (const kid of childFolders.get(id) ?? []) walk(kid.id);
  }
  walk(folderId);
  return result;
}

/** Whether a connection's `project_id` falls inside the given scope. `null`/`org` scope always matches (unscoped). */
export function connectionInScope(
  projectId: string | null | undefined,
  scope: Scope | null,
  folders: FolderRow[],
  projects: ProjectRow[],
): boolean {
  if (!scope || scope.type === 'org') return true;
  if (!projectId) return false;
  if (scope.type === 'project') return projectId === scope.id;
  return projectIdsInFolder(scope.id, folders, projects).has(projectId);
}

/** Filters a list of unified connection rows down to the ones inside `scope`. */
export function filterConnectionsByScope(
  rows: UnifiedAccountRow[],
  scope: Scope | null,
  folders: FolderRow[],
  projects: ProjectRow[],
): UnifiedAccountRow[] {
  if (!scope || scope.type === 'org') return rows;
  return rows.filter((r) => connectionInScope(r.raw.project_id, scope, folders, projects));
}

/** The set of connection ids inside `scope`, for cross-referencing rows that don't carry `project_id` themselves (e.g. health/activity rows keyed only by `connectionId`). `null` means "unscoped — everything matches", not an empty set. */
export function scopedConnectionIdSet(
  allConnections: UnifiedAccountRow[],
  scope: Scope | null,
  folders: FolderRow[],
  projects: ProjectRow[],
): Set<string> | null {
  if (!scope || scope.type === 'org') return null;
  return new Set(filterConnectionsByScope(allConnections, scope, folders, projects).map((r) => r.id));
}
