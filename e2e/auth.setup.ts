import { test as setup, expect } from '@playwright/test';

const email = process.env.SMOKE_TEST_EMAIL;
const password = process.env.SMOKE_TEST_PASSWORD;
const smokeOrgName = process.env.SMOKE_TEST_ORG_NAME || 'HorizonVigil Production Smoke';

/**
 * Logs in once via the real Login page (real Supabase Auth call, not a
 * stubbed session) and saves the resulting storageState -- Supabase's JS
 * client keeps its session in localStorage, which Playwright's
 * storageState captures per-origin same as cookies. Every spec in the
 * "smoke" project reuses this instead of re-logging in per test: faster,
 * and closer to how one real customer session actually behaves in the app.
 */
setup('authenticate', async ({ page }) => {
  if (!email || !password) {
    throw new Error(
      'SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD are not set. This suite logs into a real ' +
      'account on purpose (see playwright.config.ts) -- there is no mock login path to fall back to.',
    );
  }

  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  // exact: true matters here -- without it this also matches "Sign in
  // with company SSO instead" (confirmed against the real deployed page:
  // both buttons' accessible names contain "Sign in", which Playwright's
  // default substring name-matching treats as a hit), causing a
  // strict-mode violation instead of a clean click.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // MFA-enrolled smoke-test accounts aren't supported by this suite --
  // fail loudly and specifically rather than timing out mysteriously on
  // a page that never arrives.
  await expect(page).not.toHaveURL(/\/login\/mfa/, { timeout: 5_000 }).catch(async () => {
    if (page.url().includes('/login/mfa')) {
      throw new Error(
        'Signed in but landed on the MFA step-up screen. Use a smoke-test account with MFA ' +
        'disabled, or extend this setup to complete a TOTP challenge.',
      );
    }
  });

  // Successful sign-in lands on /overview (or wherever RequireAuth's
  // "from" redirect sends it) -- either way, off /login.
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 10_000 });

  // A dedicated smoke user can be freshly provisioned or have its tenant
  // removed during test-data maintenance. Bootstrap exactly one stable tenant
  // when the authenticated product explicitly presents the zero-org screen.
  // This is intentionally UI-driven: it verifies the real organization
  // creation path and leaves normal accounts untouched.
  const createOrgHeading = page.getByRole('heading', { name: 'Create your organization' });
  const appShell = page.locator('#main-content');
  await expect(createOrgHeading.or(appShell)).toBeVisible({ timeout: 20_000 });

  if (await createOrgHeading.isVisible()) {
    await page.getByLabel('Organization name').fill(smokeOrgName);
    await page.getByRole('button', { name: 'Create organization', exact: true }).click();
  }

  // Authentication without a usable tenant is not a release-ready session.
  // Persist storage only after the application shell is available.
  await expect(appShell).toBeVisible({ timeout: 20_000 });
  await page.context().storageState({ path: 'e2e/.auth/session.json' });
});
