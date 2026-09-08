import { describe, it, expect } from 'vitest';

/**
 * Phase 1 — server-side scope isolation, client contract.
 *
 * 2026-09-08 production-readiness audits, P0: "Selecting a folder containing
 * only one zero-resource Azure account still leaves 1,805 resources, global
 * accounts, activity, favorites, health, and savings visible... A client
 * filter is not authorization."
 *
 * The server now resolves folder/project scope itself
 * (shared-lib getActiveScope + getOrgConnectionIds), but it can only do that
 * if the client actually tells it which node is selected. If these headers
 * stop being sent, the server silently falls back to org scope and the
 * original defect returns with no test failing anywhere else -- which is
 * exactly how this shipped as a cosmetic selector the first time.
 *
 * Asserted at source level for the same reason navConfig.test.ts asserts
 * App.tsx invariants that way: the alternative is standing up the whole
 * Supabase session/client stack to observe one header.
 */
const sources = import.meta.glob(['./api.ts', './orgContext.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([path]) => path.endsWith(endsWith));
  expect(hit, `source not found for ${endsWith}`).toBeTruthy();
  return hit![1];
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the API client sends the active scope to the server', () => {
  const api = code(source('/api.ts'));

  it('sets X-Scope-Type and X-Scope-Id alongside X-Org-Id', () => {
    expect(api).toMatch(/headers\['X-Scope-Type'\]/);
    expect(api).toMatch(/headers\['X-Scope-Id'\]/);
    // must live in the same place X-Org-Id does, so every request carries it
    const authHeaders = api.slice(api.indexOf('private async authHeaders'));
    expect(authHeaders).toMatch(/X-Org-Id/);
    expect(authHeaders).toMatch(/X-Scope-Type/);
  });

  it('sends no scope header for org scope, matching the server default', () => {
    // Org scope must look identical to an older client that sends nothing,
    // otherwise the backwards-compatible default stops being exercised.
    expect(api).toMatch(/scope\.type !== 'org' \? scope : null/);
  });
});

describe('the scope picker propagates to the API client', () => {
  const ctx = code(source('/orgContext.tsx'));

  it('setScope mirrors the selection onto the client', () => {
    // Without this the entire server-side implementation is dormant.
    expect(ctx).toMatch(/api\.setActiveScope\(/);
    expect(ctx).toMatch(/setScope = useCallback/);
  });

  it('clearing the scope clears it on the client too', () => {
    expect(ctx).toMatch(/api\.setActiveScope\(next \? \{ type: next\.type, id: next\.id \} : null\)/);
  });
});
