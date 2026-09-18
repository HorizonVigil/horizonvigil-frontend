import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Unauthenticated end-to-end smoke tests.
 *
 * WHY THIS SUITE EXISTS
 *
 * The authenticated suite (smoke.spec.ts) covers the logged-in product and
 * needs SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD. It now runs post-deploy and on
 * a schedule; for a long time it did not run at all, because those secrets
 * were never configured, and every "verified" claim about this frontend was
 * really a bundle grep plus an unauthenticated HTTP 200.
 *
 * This suite is the half that needs no credentials, so it gates EVERY push
 * rather than only a deploy. Everything here runs with no credentials and no
 * deployed environment: the
 * Playwright config builds the app and serves `dist`, so this can run on every
 * push. It does not replace the authenticated suite -- it covers what can be
 * proven without a tenant, which is considerably more than nothing:
 *
 *  - the application boots and mounts (a blank page fails here);
 *  - route-level code splitting actually resolves, which unit tests cannot
 *    show because they never mount the router;
 *  - protected routes redirect to /login rather than rendering or crashing;
 *  - no uncaught exception, failed chunk request, or error boundary appears.
 *
 * That last point is the one that matters most after splitting 37 pages into
 * 37 dynamically imported chunks: a chunk that 404s produces a blank screen on
 * exactly one route, and only a browser catches it.
 */

const ERROR_BOUNDARY_TEXT = /Something went wrong/i;

/** Console noise that is not an application defect. */
function isRealConsoleError(message: ConsoleMessage): boolean {
  if (message.type() !== 'error') return false;

  const text = message.text();

  // Unauthenticated API calls answering 401/403 are the CORRECT behaviour on
  // these pages; the browser logs the failed request regardless.
  if (/401|403|Failed to load resource/i.test(text)) return false;

  return true;
}

/**
 * Public routes, plus protected ones that must redirect rather than break.
 * Each protected entry exercises a different lazily-loaded chunk.
 */
const PUBLIC_ROUTES = ['/', '/pricing', '/docs', '/privacy', '/terms', '/login'];

const PROTECTED_ROUTES = [
  '/overview',
  '/cloud-accounts',
  '/resources',
  '/finops',
  '/cloud-security',
  '/cloud-compliance',
  '/reports',
  '/monitoring',
  '/alerts',
  '/settings',
];

test.describe('unauthenticated smoke', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public route ${route} renders without errors`, async ({ page }) => {
      const errors: string[] = [];
      const failedRequests: string[] = [];

      page.on('console', (m) => {
        if (isRealConsoleError(m)) errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
      page.on('requestfailed', (r) => {
        // A code-split chunk that fails to load is the failure mode this
        // suite was written for.
        if (/\/assets\/.*\.js$/.test(r.url())) {
          failedRequests.push(r.url());
        }
      });

      await page.goto(route, { waitUntil: 'networkidle' });

      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);

      expect(failedRequests, 'a JavaScript chunk failed to load').toEqual([]);
      expect(errors, `console errors on ${route}`).toEqual([]);
    });
  }

  for (const route of PROTECTED_ROUTES) {
    test(`protected route ${route} redirects to login, chunk loads`, async ({ page }) => {
      const failedRequests: string[] = [];
      const pageErrors: string[] = [];

      page.on('pageerror', (e) => pageErrors.push(e.message));
      page.on('requestfailed', (r) => {
        if (/\/assets\/.*\.js$/.test(r.url())) failedRequests.push(r.url());
      });

      await page.goto(route, { waitUntil: 'networkidle' });

      // Unauthenticated access must land on login, never render the page and
      // never throw.
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);

      expect(failedRequests, 'a JavaScript chunk failed to load').toEqual([]);
      expect(pageErrors, `uncaught error on ${route}`).toEqual([]);
    });
  }

  test('an unknown route renders the 404 page', async ({ page }) => {
    await page.goto('/this-route-does-not-exist', { waitUntil: 'networkidle' });

    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.getByText(ERROR_BOUNDARY_TEXT)).toHaveCount(0);
  });

  /**
   * The split is the point: if a future change reverts to eager imports this
   * silently regresses to one large download, and nothing else would notice.
   */
  test('the build is genuinely code-split', async ({ page }) => {
    const scripts: string[] = [];

    page.on('response', (r) => {
      if (/\/assets\/.*\.js$/.test(r.url())) scripts.push(r.url());
    });

    await page.goto('/login', { waitUntil: 'networkidle' });

    expect(
      scripts.length,
      'the login screen should not download the whole application',
    ).toBeGreaterThan(1);
  });
});
