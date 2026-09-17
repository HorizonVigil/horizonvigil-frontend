import { test, expect } from '@playwright/test';

/**
 * Responsive layout, verified in a real browser at real viewport sizes.
 *
 * This had never been checked. Earlier passes confirmed statically that wide
 * tables sit inside `overflow-x-auto` containers, which is necessary but
 * proves nothing on its own: a container can scroll correctly while the PAGE
 * still scrolls sideways because something else overflows it.
 *
 * The check below is deliberately narrow and objective rather than a
 * screenshot diff: horizontal overflow of the document itself. That is the
 * defect that makes a page genuinely unusable on a phone -- content clipped
 * off-screen with no way to reach it -- and it is measurable without
 * committing to a particular visual design.
 *
 * Runs unauthenticated, so it covers the public and redirecting routes. The
 * authenticated layouts (dense tables, the Cloud Accounts grid) still need the
 * credentialed suite and are NOT claimed here.
 */

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 },
] as const;

const ROUTES = ['/', '/pricing', '/docs', '/login'];

/** A few pixels of tolerance: sub-pixel rounding is not a layout defect. */
const OVERFLOW_TOLERANCE_PX = 2;

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route} does not scroll horizontally`, async ({ page }) => {
        await page.goto(route, { waitUntil: 'networkidle' });

        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return {
            scrollWidth: doc.scrollWidth,
            clientWidth: doc.clientWidth,
          };
        });

        expect(
          overflow.scrollWidth - overflow.clientWidth,
          `the page overflows its viewport by ` +
            `${overflow.scrollWidth - overflow.clientWidth}px, so content is ` +
            `clipped off-screen`,
        ).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
      });
    }

    test('primary navigation is reachable', async ({ page }) => {
      await page.goto('/', { waitUntil: 'networkidle' });

      // Either the full nav is visible, or a menu control exists to reach it.
      // A layout that has neither is unusable at this width.
      const nav = page.locator('nav').first();
      const menuButton = page.getByRole('button', {
        name: /menu|navigation|open menu/i,
      });

      const navVisible = await nav.isVisible().catch(() => false);
      const menuVisible = await menuButton
        .first()
        .isVisible()
        .catch(() => false);

      expect(
        navVisible || menuVisible,
        'neither a visible nav nor a menu control was found',
      ).toBe(true);
    });
  });
}

test.describe('mobile interaction targets', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /**
   * The login form is the one flow every user must complete on whatever device
   * they have, so its controls must actually be operable at phone width.
   */
  test('the login form is usable at 375px', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });

    const email = page.locator('input[type="email"]').first();
    const password = page.locator('input[type="password"]').first();

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    for (const field of [email, password]) {
      const box = await field.boundingBox();

      expect(box, 'form field has no layout box').not.toBeNull();
      expect(
        box!.width,
        'a form field is wider than the viewport',
      ).toBeLessThanOrEqual(375);
      expect(box!.height, 'a form field is too short to tap').toBeGreaterThanOrEqual(28);
    }
  });
});
