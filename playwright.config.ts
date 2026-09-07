import { defineConfig, devices } from '@playwright/test';

/**
 * Go-live smoke test suite (v1.0 Readiness Audit, "Recommended 36-Day
 * Sequence" #3 / master spec's own §46 flow). Runs against a real,
 * already-deployed HorizonVigil environment -- there is no mock backend
 * here and there shouldn't be: the entire point is to catch what only
 * shows up against the real Cloud Run services + Supabase project (auth,
 * RLS, a real cloud connection's real data). Not a substitute for the
 * unit/component tests already covering individual logic -- this only
 * proves the pages a real customer clicks through still render.
 *
 * Requires three env vars (see .github/workflows/smoke-test.yml):
 *   SMOKE_TEST_BASE_URL  -- defaults to the real production frontend
 *   SMOKE_TEST_EMAIL     -- a real user in a real org (the "kamal" org's
 *                           own test account, matching this codebase's
 *                           established pattern of using that org as the
 *                           vetted subject for anything run for real)
 *   SMOKE_TEST_PASSWORD
 *
 * Deliberately workflow_dispatch-only in CI, not on every push -- it logs
 * into a real account and clicks real buttons; running it unattended on
 * every PR is a different (larger) commitment than this pass makes.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // one shared logged-in session (see auth.setup.ts) -- parallel workers would race it
  workers: 1,
  retries: process.env.CI ? 1 : 0, // one retry only for real flake (a slow provider API), never to paper over a real break
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.SMOKE_TEST_BASE_URL || 'https://frontend-7yo5yw7xca-uc.a.run.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/session.json' },
      dependencies: ['setup'],
    },
  ],
});
