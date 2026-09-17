import { describe, expect, it } from 'vitest';

import { stripComments } from '../test/sourceCode';

/**
 * Guards must fail CLOSED when the caller's role is unknown.
 *
 * Four places resolved the current role as `(currentOrg?.myRole as Role) ??
 * 'owner'`, which makes "we do not know who this is" resolve to the highest
 * privilege the system has. `currentOrg` is null both while the organisation
 * bootstrap is in flight and whenever it FAILS, so a failed bootstrap rendered
 * every module-gated route and the complete admin sidebar.
 *
 * These are source-level assertions because the alternative -- standing up
 * OrgProvider, auth and a router per case -- would test the harness more than
 * the rule. What matters is small and textual: the fallback literal.
 */
const SOURCES = import.meta.glob(
  [
    './ProtectedRoute.tsx',
    './AppRail.tsx',
    '../lib/useCanSeeSubmenu.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(SOURCES).find(([path]) => path.endsWith(endsWith));

  expect(hit, `source not found for ${endsWith} -- did the file move?`).toBeTruthy();

  return stripComments(hit![1]);
}

describe('role resolution fails closed', () => {
  it.each([
    ['ProtectedRoute.tsx', './ProtectedRoute.tsx'],
    ['AppRail.tsx', './AppRail.tsx'],
    ['useCanSeeSubmenu.ts', '../lib/useCanSeeSubmenu.ts'],
  ])('%s never defaults an unknown role to owner', (_label, path) => {
    const src = source(path);

    expect(src).not.toMatch(/\?\?\s*['"]owner['"]/);
    expect(src).not.toMatch(/\|\|\s*['"]owner['"]/);
  });

  /**
   * The route guard is the one that decides whether a page renders at all, so
   * it must keep three states apart rather than collapsing unknown into
   * either extreme: loading decides nothing, a missing role denies.
   */
  it('ProtectedRoute distinguishes loading from an unresolved role', () => {
    const src = source('./ProtectedRoute.tsx');

    expect(src).toMatch(/isLoading/);
    expect(src).toMatch(/if\s*\(\s*isLoading\s*\)\s*return\s+null/);
    expect(src).toMatch(/if\s*\(\s*!role\s*\)\s*return\s*<AccessDenied\s*\/>/);
  });

  /**
   * Authentication is enforced by RequireAuth/RequireOrg. A second, unused
   * guard here -- documented as though it were in use -- invites the reader to
   * believe a route is protected by something that never runs.
   */
  it('carries no unused duplicate auth guard', () => {
    const src = source('./ProtectedRoute.tsx');

    expect(src).not.toMatch(/export\s+function\s+RequireAuthRoute/);
  });
});
