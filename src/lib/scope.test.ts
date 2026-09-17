import { describe, expect, it } from 'vitest';

import type { FolderRow, ProjectRow } from './api';
import type { Scope } from './orgContext';
import type { UnifiedAccountRow } from './unifiedAccounts';
import {
  connectionInScope,
  filterConnectionsByScope,
  projectIdsInFolder,
  scopedConnectionIdSet,
} from './scope';

function folder(
  id: string,
  parent: string | null = null,
): FolderRow {
  return {
    id,
    parent_folder_id: parent,
    name: id,
    monthly_budget: null,
    required_tags: [],
    allowed_regions: [],
    business_unit_id: null,
    cost_center_id: null,
    created_at: '',
  };
}

function project(
  id: string,
  folderId: string | null = null,
): ProjectRow {
  return {
    id,
    folder_id: folderId,
    name: id,
    slug: id,
    monthly_budget: null,
    business_unit_id: null,
    cost_center_id: null,
    created_at: '',
  };
}

function row(
  id: string,
  projectId: string | null,
): UnifiedAccountRow {
  return {
    id,
    provider: 'aws',
    name: id,
    identifier: id,
    environment: 'production',
    status: 'connected',
    errorMessage: null,
    connectionMethod: 'access_key',
    connectionMethodLabel: 'Access key',
    region: 'us-east-1',
    resources: 0,
    lastSync: null,
     
    raw: { project_id: projectId } as any,
  };
}

/**
 * Canonical test hierarchy:
 *
 * root/
 * ├─ parentFolder/   -> projB
 * │  └─ childFolder/ -> projC
 * ├─ siblingFolder/  -> projD
 * └─ projA (root-level project)
 */
const folders: FolderRow[] = [
  folder('parentFolder'),
  folder('childFolder', 'parentFolder'),
  folder('siblingFolder'),
];

const projects: ProjectRow[] = [
  project('projB', 'parentFolder'),
  project('projC', 'childFolder'),
  project('projD', 'siblingFolder'),
  project('projA', null),
];

describe('projectIdsInFolder', () => {
  it('includes direct and recursively nested-folder projects', () => {
    const ids = projectIdsInFolder('parentFolder', folders, projects);

    expect(ids).toEqual(new Set(['projB', 'projC']));
  });

  it('does not include sibling-folder projects', () => {
    const ids = projectIdsInFolder('parentFolder', folders, projects);

    expect(ids.has('projD')).toBe(false);
  });

  it('does not include root-level projects', () => {
    const ids = projectIdsInFolder('parentFolder', folders, projects);

    expect(ids.has('projA')).toBe(false);
  });

  it('is cycle-safe against malformed parent-folder chains', () => {
    const cyclicFolders = [
      folder('a', 'b'),
      folder('b', 'a'),
    ];

    expect(() =>
      projectIdsInFolder('a', cyclicFolders, []),
    ).not.toThrow();

    expect(
      projectIdsInFolder('a', cyclicFolders, []),
    ).toEqual(new Set());
  });

  it('handles self-referential folder data safely', () => {
    const selfReferential = [folder('a', 'a')];

    expect(() =>
      projectIdsInFolder('a', selfReferential, [project('p', 'a')]),
    ).not.toThrow();

    expect(
      projectIdsInFolder('a', selfReferential, [project('p', 'a')]),
    ).toEqual(new Set(['p']));
  });

  it('deduplicates project IDs when malformed data references the same project repeatedly', () => {
    const duplicateProjects = [
      project('p1', 'a'),
      project('p1', 'a'),
    ];

    expect(
      projectIdsInFolder(
        'a',
        [folder('a')],
        duplicateProjects,
      ),
    ).toEqual(new Set(['p1']));
  });
});

describe('connectionInScope', () => {
  it('matches every connection for null and org scope', () => {
    expect(
      connectionInScope('projB', null, folders, projects),
    ).toBe(true);

    expect(
      connectionInScope(
        null,
        { type: 'org', id: 'o1', name: 'Org' },
        folders,
        projects,
      ),
    ).toBe(true);

    expect(
      connectionInScope(
        undefined,
        { type: 'org', id: 'o1', name: 'Org' },
        folders,
        projects,
      ),
    ).toBe(true);
  });

  it('matches only the exact project for project scope', () => {
    const scope: Scope = {
      type: 'project',
      id: 'projB',
      name: 'B',
    };

    expect(
      connectionInScope('projB', scope, folders, projects),
    ).toBe(true);

    expect(
      connectionInScope('projC', scope, folders, projects),
    ).toBe(false);

    expect(
      connectionInScope(null, scope, folders, projects),
    ).toBe(false);
  });

  it('matches direct and nested projects for folder scope', () => {
    const scope: Scope = {
      type: 'folder',
      id: 'parentFolder',
      name: 'Parent',
    };

    expect(
      connectionInScope('projB', scope, folders, projects),
    ).toBe(true);

    expect(
      connectionInScope('projC', scope, folders, projects),
    ).toBe(true);

    expect(
      connectionInScope('projD', scope, folders, projects),
    ).toBe(false);
  });

  it('does not match a project from an unrelated folder', () => {
    const scope: Scope = {
      type: 'folder',
      id: 'childFolder',
      name: 'Child',
    };

    expect(
      connectionInScope('projC', scope, folders, projects),
    ).toBe(true);

    expect(
      connectionInScope('projB', scope, folders, projects),
    ).toBe(false);
  });

  it('never matches a project-less connection for a non-org scope', () => {
    const projectScope: Scope = {
      type: 'project',
      id: 'projB',
      name: 'B',
    };

    const folderScope: Scope = {
      type: 'folder',
      id: 'parentFolder',
      name: 'Parent',
    };

    expect(
      connectionInScope(null, projectScope, folders, projects),
    ).toBe(false);

    expect(
      connectionInScope(undefined, projectScope, folders, projects),
    ).toBe(false);

    expect(
      connectionInScope(null, folderScope, folders, projects),
    ).toBe(false);

    expect(
      connectionInScope(undefined, folderScope, folders, projects),
    ).toBe(false);
  });

  it('does not accidentally match a project ID that only shares a prefix', () => {
    const scope: Scope = {
      type: 'project',
      id: 'projB',
      name: 'B',
    };

    expect(
      connectionInScope('projB-extra', scope, folders, projects),
    ).toBe(false);
  });
});

describe('filterConnectionsByScope', () => {
  const rows = [
    row('c1', 'projB'),
    row('c2', 'projC'),
    row('c3', 'projD'),
    row('c4', null),
  ];

  it('returns the original array unchanged for org scope', () => {
    const scope: Scope = {
      type: 'org',
      id: 'o1',
      name: 'Org',
    };

    expect(
      filterConnectionsByScope(
        rows,
        scope,
        folders,
        projects,
      ),
    ).toBe(rows);
  });

  it('returns the original array unchanged for null scope', () => {
    expect(
      filterConnectionsByScope(
        rows,
        null,
        folders,
        projects,
      ),
    ).toBe(rows);
  });

  it('recursively narrows a folder scope', () => {
    const scope: Scope = {
      type: 'folder',
      id: 'parentFolder',
      name: 'Parent',
    };

    const result = filterConnectionsByScope(
      rows,
      scope,
      folders,
      projects,
    );

    expect(result.map((account) => account.id)).toEqual([
      'c1',
      'c2',
    ]);
  });

  it('narrows a project scope to one project', () => {
    const scope: Scope = {
      type: 'project',
      id: 'projD',
      name: 'D',
    };

    const result = filterConnectionsByScope(
      rows,
      scope,
      folders,
      projects,
    );

    expect(result.map((account) => account.id)).toEqual(['c3']);
  });

  it('does not mutate the source connection array', () => {
    const original = [...rows];

    const scope: Scope = {
      type: 'folder',
      id: 'parentFolder',
      name: 'Parent',
    };

    filterConnectionsByScope(
      rows,
      scope,
      folders,
      projects,
    );

    expect(rows).toEqual(original);
  });

  it('preserves source order after filtering', () => {
    const input = [
      row('c3', 'projD'),
      row('c2', 'projC'),
      row('c1', 'projB'),
    ];

    const scope: Scope = {
      type: 'folder',
      id: 'parentFolder',
      name: 'Parent',
    };

    expect(
      filterConnectionsByScope(
        input,
        scope,
        folders,
        projects,
      ).map((account) => account.id),
    ).toEqual(['c2', 'c1']);
  });
});

describe('scopedConnectionIdSet', () => {
  const rows = [
    row('c1', 'projB'),
    row('c2', 'projD'),
    row('c3', null),
  ];

  it('returns null for org/unscoped access, never an empty set', () => {
    expect(
      scopedConnectionIdSet(
        rows,
        null,
        folders,
        projects,
      ),
    ).toBeNull();

    expect(
      scopedConnectionIdSet(
        rows,
        { type: 'org', id: 'o1', name: 'Org' },
        folders,
        projects,
      ),
    ).toBeNull();
  });

  it('returns matching connection IDs for a folder scope', () => {
    const scope: Scope = {
      type: 'folder',
      id: 'parentFolder',
      name: 'Parent',
    };

    expect(
      scopedConnectionIdSet(
        rows,
        scope,
        folders,
        projects,
      ),
    ).toEqual(new Set(['c1']));
  });

  it('returns matching connection IDs for a nested folder scope', () => {
    const nestedScope: Scope = {
      type: 'folder',
      id: 'childFolder',
      name: 'Child',
    };

    expect(
      scopedConnectionIdSet(
        rows,
        nestedScope,
        folders,
        projects,
      ),
    ).toEqual(new Set());
  });

  it('returns exactly one ID for a matching project scope', () => {
    const scope: Scope = {
      type: 'project',
      id: 'projB',
      name: 'B',
    };

    expect(
      scopedConnectionIdSet(
        rows,
        scope,
        folders,
        projects,
      ),
    ).toEqual(new Set(['c1']));
  });

  it('returns a new set and does not expose internal mutable state', () => {
    const scope: Scope = {
      type: 'folder',
      id: 'parentFolder',
      name: 'Parent',
    };

    const first = scopedConnectionIdSet(
      rows,
      scope,
      folders,
      projects,
    );

    expect(first).toEqual(new Set(['c1']));

    first?.add('evil');

    const second = scopedConnectionIdSet(
      rows,
      scope,
      folders,
      projects,
    );

    expect(second).toEqual(new Set(['c1']));
  });
});
