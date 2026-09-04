import { describe, it, expect } from 'vitest';
import type { FolderRow, ProjectRow } from './api';
import type { Scope } from './orgContext';
import type { UnifiedAccountRow } from './unifiedAccounts';
import { projectIdsInFolder, connectionInScope, filterConnectionsByScope, scopedConnectionIdSet } from './scope';

function folder(id: string, parent: string | null = null): FolderRow {
  return { id, parent_folder_id: parent, name: id, monthly_budget: null, required_tags: [], allowed_regions: [], business_unit_id: null, cost_center_id: null, created_at: '' };
}
function project(id: string, folderId: string | null = null): ProjectRow {
  return { id, folder_id: folderId, name: id, slug: id, monthly_budget: null, business_unit_id: null, cost_center_id: null, created_at: '' };
}
function row(id: string, projectId: string | null): UnifiedAccountRow {
  return {
    id, provider: 'aws', name: id, identifier: id, environment: 'production', status: 'connected', errorMessage: null,
    connectionMethod: 'access_key', connectionMethodLabel: 'Access key', region: 'us-east-1', resources: 0, lastSync: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: { project_id: projectId } as any,
  };
}

// Tree: root/
//         parentFolder/  -> projB
//           childFolder/ -> projC
//         siblingFolder/ -> projD
const folders = [folder('parentFolder'), folder('childFolder', 'parentFolder'), folder('siblingFolder')];
const projects = [project('projB', 'parentFolder'), project('projC', 'childFolder'), project('projD', 'siblingFolder'), project('projA', null)];

describe('projectIdsInFolder', () => {
  it('includes the folder\'s own projects plus every nested folder\'s projects', () => {
    const ids = projectIdsInFolder('parentFolder', folders, projects);
    expect(ids).toEqual(new Set(['projB', 'projC']));
  });

  it('does not include a sibling folder\'s projects', () => {
    const ids = projectIdsInFolder('parentFolder', folders, projects);
    expect(ids.has('projD')).toBe(false);
  });

  it('is cycle-safe against malformed parent chains', () => {
    const cyclic = [folder('a', 'b'), folder('b', 'a')];
    expect(() => projectIdsInFolder('a', cyclic, [])).not.toThrow();
  });
});

describe('connectionInScope', () => {
  it('matches everything when scope is null or org', () => {
    expect(connectionInScope('projB', null, folders, projects)).toBe(true);
    expect(connectionInScope(null, { type: 'org', id: 'o1', name: 'Org' }, folders, projects)).toBe(true);
  });

  it('project scope matches only that exact project', () => {
    const scope: Scope = { type: 'project', id: 'projB', name: 'B' };
    expect(connectionInScope('projB', scope, folders, projects)).toBe(true);
    expect(connectionInScope('projC', scope, folders, projects)).toBe(false);
  });

  it('folder scope matches projects in nested folders too', () => {
    const scope: Scope = { type: 'folder', id: 'parentFolder', name: 'Parent' };
    expect(connectionInScope('projB', scope, folders, projects)).toBe(true);
    expect(connectionInScope('projC', scope, folders, projects)).toBe(true);
    expect(connectionInScope('projD', scope, folders, projects)).toBe(false);
  });

  it('a connection with no project_id never matches a non-org scope', () => {
    const scope: Scope = { type: 'folder', id: 'parentFolder', name: 'Parent' };
    expect(connectionInScope(null, scope, folders, projects)).toBe(false);
    expect(connectionInScope(undefined, scope, folders, projects)).toBe(false);
  });
});

describe('filterConnectionsByScope', () => {
  const rows = [row('c1', 'projB'), row('c2', 'projC'), row('c3', 'projD'), row('c4', null)];

  it('returns everything unchanged for org scope', () => {
    expect(filterConnectionsByScope(rows, { type: 'org', id: 'o1', name: 'Org' }, folders, projects)).toBe(rows);
  });

  it('narrows to a folder\'s connections recursively', () => {
    const scope: Scope = { type: 'folder', id: 'parentFolder', name: 'Parent' };
    const result = filterConnectionsByScope(rows, scope, folders, projects);
    expect(result.map((r) => r.id)).toEqual(['c1', 'c2']);
  });

  it('narrows to a single project\'s connections', () => {
    const scope: Scope = { type: 'project', id: 'projD', name: 'D' };
    const result = filterConnectionsByScope(rows, scope, folders, projects);
    expect(result.map((r) => r.id)).toEqual(['c3']);
  });
});

describe('scopedConnectionIdSet', () => {
  const rows = [row('c1', 'projB'), row('c2', 'projD')];

  it('returns null (unscoped) for org scope, not an empty set', () => {
    expect(scopedConnectionIdSet(rows, null, folders, projects)).toBeNull();
    expect(scopedConnectionIdSet(rows, { type: 'org', id: 'o1', name: 'Org' }, folders, projects)).toBeNull();
  });

  it('returns the matching id set for a real scope', () => {
    const scope: Scope = { type: 'folder', id: 'parentFolder', name: 'Parent' };
    expect(scopedConnectionIdSet(rows, scope, folders, projects)).toEqual(new Set(['c1']));
  });
});
