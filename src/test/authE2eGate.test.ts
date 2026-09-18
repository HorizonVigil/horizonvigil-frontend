import { describe, expect, it } from 'vitest';

import { stripComments } from './sourceCode';

/**
 * The authenticated E2E suite must not silently become zero tests again.
 *
 * It sat at ZERO EXECUTIONS for months while looking healthy: the spec file
 * existed, Playwright discovered the tests, and the workflow was green-by-
 * absence because it only ever ran on demand and its credentials were never
 * configured. Nothing in the repository would have told anyone.
 *
 * These assertions run in the ordinary unit suite -- which gates every push --
 * so a change that empties, skips, or disconnects the authenticated suite
 * fails immediately rather than months later.
 *
 * The workflow performs the complementary runtime check (`--list` must report
 * at least one test). This covers what is checkable without a browser: that
 * the tests exist, are not skipped, and are still wired to a project.
 */

const SOURCES = import.meta.glob(
  ['../../e2e/**/*.ts', '../../playwright.config.ts', '../../.github/workflows/smoke-test.yml'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function source(endsWith: string): string {
  const hit = Object.entries(SOURCES).find(([path]) => path.endsWith(endsWith));

  expect(hit, `source not found for ${endsWith} -- did the file move?`).toBeTruthy();

  return hit![1];
}

describe('authenticated E2E suite integrity', () => {
  it('the authenticated spec still exists and contains tests', () => {
    const spec = stripComments(source('e2e/smoke.spec.ts'));
    const tests = spec.match(/\btest\s*\(/g) ?? [];

    expect(
      tests.length,
      'smoke.spec.ts declares no tests -- the authenticated suite is empty',
    ).toBeGreaterThan(0);
  });

  it('the authentication setup still exists and performs a real login', () => {
    const setup = stripComments(source('e2e/auth.setup.ts'));

    // A real credential-based sign-in, not an injected session.
    expect(setup).toMatch(/SMOKE_TEST_EMAIL/);
    expect(setup).toMatch(/SMOKE_TEST_PASSWORD/);
    expect(setup).toMatch(/getByRole\(\s*['"]button['"]/);
    expect(setup).toMatch(/storageState/);

    // Must not fabricate a session instead of logging in.
    expect(setup).not.toMatch(/addInitScript[\s\S]{0,200}access_token/);
    expect(setup).not.toMatch(/setItem\(\s*['"]sb-/);
  });

  /**
   * A missing credential must abort. If setup ever degrades to "skip when the
   * secret is absent", the suite silently reports success while testing
   * nothing -- which is precisely how it stayed broken.
   */
  it('missing credentials abort rather than skip', () => {
    const setup = stripComments(source('e2e/auth.setup.ts'));

    expect(setup).toMatch(/throw new Error/);
    expect(setup).not.toMatch(/\.skip\s*\(/);
  });

  it('no authenticated test is skipped, fixmed, or isolated with .only', () => {
    for (const file of ['e2e/smoke.spec.ts', 'e2e/auth.setup.ts']) {
      const src = stripComments(source(file));

      for (const forbidden of [
        /\btest\.skip\s*\(/,
        /\btest\.fixme\s*\(/,
        /\btest\.only\s*\(/,
        /\bdescribe\.skip\s*\(/,
        /\bdescribe\.only\s*\(/,
      ]) {
        expect(src, `${file} contains ${forbidden}`).not.toMatch(forbidden);
      }
    }
  });

  it('the smoke project is still wired to the spec and its setup', () => {
    const config = stripComments(source('playwright.config.ts'));

    expect(config).toMatch(/name:\s*['"]smoke['"]/);
    expect(config).toMatch(/name:\s*['"]setup['"]/);
    expect(config).toMatch(/dependencies:\s*\[\s*['"]setup['"]\s*\]/);
    expect(config).toMatch(/storageState/);
  });

  /**
   * The password is typed only in the setup project. Traces and videos store
   * DOM snapshots and screen recordings, and CI uploads them as artifacts, so
   * diagnostics must stay off for exactly that project.
   */
  it('setup captures no trace, screenshot or video', () => {
    const config = stripComments(source('playwright.config.ts'));
    const setupBlock = /name:\s*['"]setup['"][\s\S]{0,400}?\}/.exec(config)?.[0] ?? '';

    expect(setupBlock).toMatch(/trace:\s*['"]off['"]/);
    expect(setupBlock).toMatch(/screenshot:\s*['"]off['"]/);
    expect(setupBlock).toMatch(/video:\s*['"]off['"]/);
  });

  it('the workflow fails on missing credentials instead of skipping', () => {
    const workflow = source('.github/workflows/smoke-test.yml');

    expect(workflow).toMatch(/SMOKE_TEST_EMAIL is not configured/);
    expect(workflow).toMatch(/SMOKE_TEST_PASSWORD is not configured/);
    expect(workflow).toMatch(/AUTHENTICATED E2E CONFIGURATION ERROR/);
    expect(workflow).toMatch(/AUTHENTICATED TESTS DISCOVERED/);

    // Never echo a secret.
    expect(workflow).not.toMatch(/echo\s+"?\$\{?SMOKE_TEST_PASSWORD/);
    expect(workflow).not.toMatch(/echo\s+"?\$\{?SMOKE_TEST_EMAIL/);
  });
});
