import { describe, expect, it } from 'vitest';

import { LAZY_ROUTE_MODULES } from './lazyRoutes.manifest';
import * as lazyRoutes from './lazyRoutes';

/**
 * Why this test has to exist.
 *
 * `lazy(() => import('../pages/Foo').then((m) => ({ default: m.Foo })))` is a
 * DYNAMIC import. TypeScript checks that the module exists, but a wrong export
 * name inside the `.then()` is just a property read on a module object: it
 * type-checks, it builds, and it fails at runtime as `undefined` passed to
 * React — a blank screen on exactly one route, discovered by a customer.
 *
 * Splitting 37 pages into 37 dynamic imports created 37 chances to make that
 * mistake, so each one is resolved here and its export asserted. This is the
 * verification that makes route splitting safe to do without an end-to-end
 * suite: it proves every chunk loads and every export name is real.
 */

const modules = import.meta.glob('../pages/**/*.tsx');

describe('lazy route chunks', () => {
  it('has a manifest entry for every lazily-loaded route', () => {
    const exported = Object.keys(lazyRoutes);

    expect(exported.length).toBeGreaterThan(30);
    expect(LAZY_ROUTE_MODULES.length).toBe(exported.length);
  });

  it.each(LAZY_ROUTE_MODULES.map((entry) => [entry[1], entry[0]] as const))(
    '%s resolves and exports %s',
    async (modulePath, exportName) => {
      const key = modulePath.replace('../pages', '../pages');
      const loader = modules[`${key}.tsx`];

      expect(
        loader,
        `${modulePath} was not found on disk -- the lazy import would 404 at runtime`,
      ).toBeTypeOf('function');

      const mod = (await loader!()) as Record<string, unknown>;

      expect(
        mod[exportName],
        `${modulePath} has no export named "${exportName}"; ` +
          'React would receive undefined and render nothing on that route',
      ).toBeTypeOf('function');
    },
  );

  /**
   * React.lazy accepts anything and only fails when the route is visited, so
   * the shape is asserted here instead.
   */
  it('exports only React lazy components', () => {
    for (const [name, value] of Object.entries(lazyRoutes)) {
      expect(value, `${name} is not an object`).toBeTypeOf('object');

      const component = value as { $$typeof?: symbol; _payload?: unknown };

      expect(
        component.$$typeof,
        `${name} is not a React lazy component`,
      ).toBe(Symbol.for('react.lazy'));
    }
  });
});
