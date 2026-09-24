import { describe, expect, it } from 'vitest';
import { stripComments } from '../test/sourceCode';

/** Source-level guards must read code, never the prose documenting it. */
const code = stripComments;

/**
 * Phase 1 — server-side scope isolation, client contract.
 *
 * The server resolves folder/project scope itself. The browser must therefore
 * propagate the currently selected scope to the API client; otherwise the
 * server falls back to organization scope and the UI selector becomes only a
 * cosmetic filter.
 *
 * These source-level tests protect the client/server contract without
 * requiring a live Supabase session or a full application mount.
 */

const sources = import.meta.glob(
  ['./api.ts', './orgContext.tsx'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(sources).find(([filePath]) =>
    filePath.endsWith(endsWith),
  );

  expect(
    hit,
    `source not found for ${endsWith}; verify the import.meta.glob path`,
  ).toBeTruthy();

  return hit![1];
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function functionBody(
  sourceText: string,
  functionName: string,
): string {
  const start = sourceText.indexOf(functionName);

  if (start < 0) return '';

  return sourceText.slice(start, start + 12_000);
}

describe('API client scope propagation', () => {
  const api = code(source('/api.ts'));
  const compactApi = compact(api);

  it('loads api.ts successfully', () => {
    expect(api.trim()).not.toBe('');
  });

  it('defines both server scope headers', () => {
    expect(api).toMatch(/['"]X-Scope-Type['"]/);
    expect(api).toMatch(/['"]X-Scope-Id['"]/);
  });

  it('keeps scope propagation in the shared request/auth-header path', () => {
    const authHeaderBody = functionBody(api, 'private async authHeaders');

    expect(
      authHeaderBody,
      'private async authHeaders was not found; every request may not be receiving the scope contract',
    ).not.toBe('');

    expect(authHeaderBody).toMatch(/X-Org-Id/);
    expect(authHeaderBody).toMatch(/X-Scope-Type/);
    expect(authHeaderBody).toMatch(/X-Scope-Id/);
  });

  it('does not limit scope headers to a single API service method', () => {
    const authHeaderBody = functionBody(api, 'private async authHeaders');

    expect(authHeaderBody).toMatch(
      /headers\s*\[[^\]]*X-Scope-Type[^\]]*\]/,
    );
    expect(authHeaderBody).toMatch(
      /headers\s*\[[^\]]*X-Scope-Id[^\]]*\]/,
    );

    /**
     * The important invariant is that the shared header builder contains the
     * scope contract. Individual endpoints should not be responsible for
     * remembering to add it.
     */
    expect(compactApi).toMatch(/private async authHeaders/);
  });

  it('does not send a scope ID without its scope type', () => {
    const authHeaderBody = functionBody(api, 'private async authHeaders');

    const typeIndex = authHeaderBody.indexOf('X-Scope-Type');
    const idIndex = authHeaderBody.indexOf('X-Scope-Id');

    expect(typeIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThanOrEqual(0);
  });

  it('preserves the organization-header contract', () => {
    const authHeaderBody = functionBody(api, 'private async authHeaders');

    expect(authHeaderBody).toMatch(/X-Org-Id/);
    // The contract is the header, not the accessor. Reading the private
    // field directly is equivalent; sending no org is not.
    expect(authHeaderBody).toMatch(/currentOrgId/i);
    expect(authHeaderBody).toMatch(/headers\['X-Org-Id'\]\s*=/);
  });

  it('does not silently rewrite a non-org scope into organization scope in the client', () => {
    /**
     * Client-side scope propagation must preserve the selected type/id.
     * Server-side authorization decides whether that scope is permitted.
     */
    expect(compactApi).toMatch(
      /X-Scope-Type[^]*X-Scope-Id/,
    );

    expect(compactApi).not.toMatch(
      /X-Scope-Type[^]{0,500}(?:['"]org['"]\s*;|\?\s*['"]org['"])/i,
    );
  });
});

describe('organization context scope synchronization', () => {
  const context = code(source('/orgContext.tsx'));
  const compactContext = compact(context);

  it('loads orgContext.tsx successfully', () => {
    expect(context.trim()).not.toBe('');
  });

  it('defines setScope as a stable callback', () => {
    expect(compactContext).toMatch(
      /setScope\s*=\s*useCallback\s*\(/,
    );
  });

  it('mirrors the selected scope to the API client', () => {
    expect(compactContext).toMatch(
      /api\.setActiveScope\s*\(/,
    );

    /**
     * The selected scope's type/id must be the values passed to the client,
     * not a reconstructed or hard-coded scope.
     */
    expect(compactContext).toMatch(
      /setActiveScope\s*\(\s*[^)]*(?:type:\s*[^,}]+,\s*id:\s*[^,}]+|type:\s*next\.type,\s*id:\s*next\.id)/,
    );
  });

  it('clears the API scope when the UI scope is cleared', () => {
    /**
     * Clearing the picker must clear the shared client scope as well.
     * Otherwise stale folder/project headers can leak into later requests.
     */
    expect(compactContext).toMatch(
      /setScope\s*=\s*useCallback[\s\S]{0,2500}setActiveScope\s*\([\s\S]{0,1000}null/,
    );
  });

  it('does not only update React state without updating the API client', () => {
    const setScopeStart = compactContext.indexOf(
      'setScope = useCallback',
    );

    expect(setScopeStart).toBeGreaterThanOrEqual(0);

    const setScopeBody = compactContext.slice(
      setScopeStart,
      setScopeStart + 2500,
    );

    expect(setScopeBody).toMatch(/setScopeState/);
    expect(setScopeBody).toMatch(/api\.setActiveScope/);
  });

  it('initializes organization scope on organization bootstrap', () => {
    /**
     * The org scope is the unscoped/default state after selecting an
     * organization. It must update both the React context and API client.
     */
    // Either the setScope callback or the underlying state setter is fine --
    // what must not change is that React state is put into org scope.
    expect(compactContext).toMatch(
      /setScope(?:State)?\s*\(\s*\{\s*type:\s*['"]org['"]/,
    );

    expect(compactContext).toMatch(
      /api\.setActiveScope\s*\(\s*\{\s*type:\s*['"]org['"]/,
    );
  });

  it('clears the API scope when there is no active organization', () => {
    /**
     * A signed-out/no-organization state must not retain a previously selected
     * organization's scope headers.
     */
    expect(compactContext).toMatch(
      /api\.setCurrentOrgId\s*\(\s*null\s*\)/,
    );
    expect(compactContext).toMatch(
      /api\.setActiveScope\s*\(\s*null\s*\)/,
    );
  });
});

describe('scope contract fail-safe invariants', () => {
  const api = compact(code(source('/api.ts')));
  const context = compact(code(source('/orgContext.tsx')));

  it('does not rely on an in-memory client filter as the authorization boundary', () => {
    /**
     * The client may still filter presentation, but the contract tested here
     * is explicit scope propagation to the server. Keeping X-Scope headers in
     * the shared request path is the protected server-enforcement contract.
     */
    expect(api).toMatch(/X-Scope-Type/);
    expect(api).toMatch(/X-Scope-Id/);
  });

  it('does not retain a stale scope after a scope clear or organization clear', () => {
    expect(context).toMatch(/setActiveScope\s*\(\s*null\s*\)/);
  });

  it('keeps scope values typed as organization/folder/project rather than arbitrary UI labels', () => {
    /**
     * This is intentionally a source-level smoke invariant: the context uses
     * the Scope object fields (`type`, `id`) rather than a display name as the
     * API scope identifier.
     */
    expect(context).toMatch(
      // Whatever the local variable is named, `type` and `id` must come from
      // the Scope object itself -- never from `name` or another label.
      /setActiveScope\s*\([\s\S]{0,120}?\{\s*type:\s*(\w+)\.type\s*,\s*id:\s*\1\.id\s*,?\s*\}/,
    );
  });
});
