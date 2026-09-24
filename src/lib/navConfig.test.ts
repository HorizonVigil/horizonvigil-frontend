import { describe, it, expect } from 'vitest';
import {
  moduleMatchesPath,
  isChildActive,
  findActiveModule,
  NAV_MODULES,
  type NavModule,
  type NavChild,
} from './navConfig';

/**
 * Raw-text import (Vite feature, typed via vite/client in vite-env.d.ts).
 *
 * Keeping this browser-safe avoids node:fs/node:path dependencies in the
 * application's TypeScript program while still letting Vitest validate the
 * strings that App.tsx passes to ProtectedRoute.
 */
const appSourceFiles = import.meta.glob('../App.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function mod(
  overrides: Partial<NavModule> & { children: NavChild[] },
): NavModule {
  return {
    label: 'Test',
    icon: '•',
    ...overrides,
  };
}

function pathOnly(to: string): string {
  return to.split('#', 1)[0].split('?', 1)[0];
}

function normalizedRoutePath(path: string): string {
  const withoutQuery = pathOnly(path).trim();

  if (withoutQuery === '') {
    return '/';
  }

  const withLeadingSlash = withoutQuery.startsWith('/')
    ? withoutQuery
    : `/${withoutQuery}`;

  if (withLeadingSlash === '/') {
    return '/';
  }

  return withLeadingSlash.replace(/\/+$/, '');
}

describe('NAV_MODULES structure', () => {
  it('contains at least one navigation module', () => {
    expect(NAV_MODULES.length).toBeGreaterThan(0);
  });

  it('every module carries a section for AppRail grouping', () => {
    for (const module of NAV_MODULES) {
      expect(
        module.section,
        `module "${module.label}" is missing a section`,
      ).toBeTruthy();
    }
  });

  it('has unique module labels', () => {
    const labels = NAV_MODULES.map((module) => module.label);

    expect(new Set(labels).size, `duplicate module labels: ${labels.join(', ')}`)
      .toBe(labels.length);
  });

  it('has unique icons for RBAC menu_key compatibility', () => {
    const icons = NAV_MODULES.map((module) => module.icon);

    expect(
      new Set(icons).size,
      `duplicate module icons: ${icons.join(', ')}`,
    ).toBe(icons.length);
  });

  it('has no duplicate real child destinations within the same group', () => {
    const offenders: string[] = [];

    for (const module of NAV_MODULES) {
      const seen = new Map<string, string>();

      for (const child of module.children) {
        if (!child.real || !child.to) continue;

        const key = [
          child.group ?? '',
          normalizedRoutePath(child.to),
          new URL(child.to, 'https://horizonvigil.invalid').hash,
          new URL(child.to, 'https://horizonvigil.invalid').searchParams.get(
            'tab',
          ) ?? '',
          // `preset` is part of the destination, not decoration: "All
          // Vulnerabilities" and "Critical Vulnerabilities" open the same tab
          // filtered differently. Omitting it here reported those two as
          // duplicates of each other.
          new URL(child.to, 'https://horizonvigil.invalid').searchParams.get(
            'preset',
          ) ?? '',
        ].join('|');

        const previous = seen.get(key);

        if (previous) {
          offenders.push(
            `"${module.label}" > "${previous}" and "${child.label}" share "${child.to}"`,
          );
        } else {
          seen.set(key, child.label);
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * Every real child must resolve back to the module that declares it.
   *
   * A cross-link is allowed only when the child is explicitly non-real.
   * Otherwise findActiveModule() would highlight the wrong module because it
   * searches the complete NAV_MODULES collection.
   */
  it('every real child path resolves to its declaring module', () => {
    const offenders: string[] = [];

    for (const module of NAV_MODULES) {
      for (const child of module.children) {
        if (!child.real || !child.to) continue;

        const path = pathOnly(child.to);

        if (!path) continue;

        const resolved = findActiveModule(path);

        if (resolved.label !== module.label) {
          offenders.push(
            `"${module.label}" > "${child.label}" (${child.to}) resolves to "${resolved.label}" instead`,
          );
        }
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('does not carry a standalone Cost Optimization module', () => {
    expect(
      NAV_MODULES.find((module) => module.label === 'Cost Optimization'),
    ).toBeUndefined();
  });

  it('keeps Vulnerability Management container navigation deduplicated', () => {
    const vulnerability = NAV_MODULES.find(
      (module) => module.label === 'Vulnerability Management',
    );

    expect(vulnerability).toBeTruthy();

    const sameDestination = vulnerability!.children.filter(
      (child) =>
        child.group === 'Container & Kubernetes' &&
        child.to === '/container-security?tab=Docker%20%26%20Container%20Images',
    );

    expect(sameDestination.map((child) => child.label)).toEqual([
      'Container Image Inventory',
    ]);
  });

  it('keeps Vulnerability Management code-security destinations unique', () => {
    const vulnerability = NAV_MODULES.find(
      (module) => module.label === 'Vulnerability Management',
    );

    expect(vulnerability).toBeTruthy();

    const codeChildren = vulnerability!.children.filter(
      (child) => child.group === 'Code Security',
    );

    const byDestination = new Map<string, string[]>();

    for (const child of codeChildren) {
      if (!child.to) continue;

      const destination = `${normalizedRoutePath(child.to)}?tab=${
        new URL(
          child.to,
          'https://horizonvigil.invalid',
        ).searchParams.get('tab') ?? ''
      }`;

      byDestination.set(destination, [
        ...(byDestination.get(destination) ?? []),
        child.label,
      ]);
    }

    for (const [destination, labels] of byDestination) {
      expect(
        labels,
        `Code Security group: multiple labels land on ${destination}: ${labels.join(', ')}`,
      ).toHaveLength(1);
    }
  });

  it('every ProtectedRoute module in App.tsx resolves to NAV_MODULES', () => {
    const appSource = Object.values(appSourceFiles)[0];

    expect(
      appSource,
      'App.tsx raw import came back empty; verify the glob pattern still resolves',
    ).toBeTruthy();

    /**
     * Subscription can be intentionally absent from NAV_MODULES because it is
     * conditionally exposed by the billing feature flag.
     */
    const labels = new Set([
      ...NAV_MODULES.map((module) => module.label),
      'Subscription',
    ]);

    const protectedRouteModules = [
      ...appSource.matchAll(/ProtectedRoute\s+module\s*=\s*"([^"]+)"/g),
    ].map((match) => match[1]);

    expect(
      protectedRouteModules.length,
      'no ProtectedRoute module="..." usages found; verify App.tsx and regex',
    ).toBeGreaterThan(0);

    const offenders = protectedRouteModules.filter(
      (label) => !labels.has(label),
    );

    expect(
      offenders,
      `these module values in App.tsx do not match current NAV_MODULES labels: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

describe('moduleMatchesPath', () => {
  it('matches the module landing page', () => {
    const module = mod({ to: '/widgets', children: [] });

    expect(moduleMatchesPath(module, '/widgets')).toBe(true);
  });

  it('matches a sub-path of the landing page', () => {
    const module = mod({ to: '/widgets', children: [] });

    expect(moduleMatchesPath(module, '/widgets/123')).toBe(true);
  });

  it('matches through a child route while ignoring query parameters', () => {
    const module = mod({
      to: '/widgets',
      children: [
        {
          label: 'Sub',
          to: '/widgets/sub?tab=x',
          real: true,
        },
      ],
    });

    expect(moduleMatchesPath(module, '/widgets/sub')).toBe(true);
  });

  it('does not match an unrelated path', () => {
    const module = mod({ to: '/widgets', children: [] });

    expect(moduleMatchesPath(module, '/gadgets')).toBe(false);
  });

  it('does not treat a similarly prefixed route as the module route', () => {
    const module = mod({ to: '/resources', children: [] });

    expect(moduleMatchesPath(module, '/resources-archive')).toBe(false);
  });
});

describe('findActiveModule', () => {
  it('resolves /cloud-accounts to Cloud Accounts', () => {
    expect(findActiveModule('/cloud-accounts').label).toBe('Cloud Accounts');
  });

  it('resolves nested Cloud Accounts routes to Cloud Accounts', () => {
    expect(findActiveModule('/cloud-accounts/abc-123').label).toBe(
      'Cloud Accounts',
    );
  });

  it('resolves /overview to Overview', () => {
    expect(findActiveModule('/overview').label).toBe('Overview');
  });

  it('resolves /resources to Asset Inventory', () => {
    expect(findActiveModule('/resources').label).toBe('Asset Inventory');
  });

  it('resolves security pillar routes to Vulnerability Management', () => {
    // '/cloud-security' is deliberately NOT in this list. The Phase 10 split
    // made Cloud Security (V1 posture) its own top-level module, so that
    // route resolves to Cloud Security by design -- asserting otherwise here
    // would contradict the "exactly one navigation module rooted at Cloud
    // Security" guard in v2Isolation.test.ts.
    const securityRoutes = [
      '/security-scanning',
      '/application-security',
      '/code-security',
      '/container-security',
      '/infrastructure-security',
    ] as const;

    for (const route of securityRoutes) {
      expect(findActiveModule(route).label, route).toBe(
        'Vulnerability Management',
      );
    }
  });

  it('falls back to the first module for an unclaimed route', () => {
    expect(findActiveModule('/this-route-does-not-exist')).toBe(NAV_MODULES[0]);
  });
});

describe('isChildActive', () => {
  it('is active when pathname matches and neither child nor current location has a tab', () => {
    const child: NavChild = {
      label: 'A',
      to: '/widgets',
      real: true,
    };

    expect(isChildActive(child, [child], '/widgets', '', '')).toBe(true);
  });

  it('is not active when pathname differs', () => {
    const child: NavChild = {
      label: 'A',
      to: '/widgets',
      real: true,
    };

    expect(isChildActive(child, [child], '/gadgets', '', '')).toBe(false);
  });

  it('is not active when the child has no destination', () => {
    const child: NavChild = {
      label: 'A',
      real: false,
    };

    expect(isChildActive(child, [child], '/widgets', '', '')).toBe(false);
  });

  it('matches a specific tab query parameter', () => {
    const alpha: NavChild = {
      label: 'A',
      to: '/widgets?tab=Alpha',
      real: true,
    };
    const beta: NavChild = {
      label: 'B',
      to: '/widgets?tab=Beta',
      real: true,
    };

    expect(isChildActive(alpha, [alpha, beta], '/widgets', '?tab=Alpha', '')).toBe(
      true,
    );
    expect(isChildActive(alpha, [alpha, beta], '/widgets', '?tab=Beta', '')).toBe(
      false,
    );
  });

  it('does not activate a bare child while another tab is selected', () => {
    const bare: NavChild = {
      label: 'Default',
      to: '/widgets',
      real: true,
    };
    const tabbed: NavChild = {
      label: 'Other',
      to: '/widgets?tab=Other',
      real: true,
    };

    expect(isChildActive(bare, [bare, tabbed], '/widgets', '', '')).toBe(true);
    expect(isChildActive(bare, [bare, tabbed], '/widgets', '?tab=Other', '')).toBe(
      false,
    );
  });

  it('does not highlight siblings that share the same destination', () => {
    const a: NavChild = {
      label: 'A',
      to: '/widgets',
      real: true,
    };
    const b: NavChild = {
      label: 'B',
      to: '/widgets',
      real: true,
    };

    expect(isChildActive(a, [a, b], '/widgets', '', '')).toBe(false);
    expect(isChildActive(b, [a, b], '/widgets', '', '')).toBe(false);
  });

  it('does not highlight children that resolve to the same page without a distinguishing tab', () => {
    const dependencyGraph: NavChild = {
      label: 'Dependency Graph',
      to: '/resources/all',
      real: true,
    };
    const bulkOperations: NavChild = {
      label: 'Bulk Operations',
      to: '/resources/all?bulk=1',
      real: true,
    };

    expect(
      isChildActive(
        dependencyGraph,
        [dependencyGraph, bulkOperations],
        '/resources/all',
        '',
        '',
      ),
    ).toBe(false);

    expect(
      isChildActive(
        bulkOperations,
        [dependencyGraph, bulkOperations],
        '/resources/all',
        '',
        '',
      ),
    ).toBe(false);
  });

  it('activates only the matching hash-anchor child', () => {
    const dashboard: NavChild = {
      label: 'Executive Dashboard',
      to: '/overview#executive-dashboard',
      real: true,
    };
    const activity: NavChild = {
      label: 'Activity Timeline',
      to: '/overview#activity-timeline',
      real: true,
    };
    const siblings = [dashboard, activity];

    expect(isChildActive(dashboard, siblings, '/overview', '', '')).toBe(false);
    expect(isChildActive(activity, siblings, '/overview', '', '')).toBe(false);

    expect(
      isChildActive(
        dashboard,
        siblings,
        '/overview',
        '',
        '#executive-dashboard',
      ),
    ).toBe(true);

    expect(
      isChildActive(
        activity,
        siblings,
        '/overview',
        '',
        '#executive-dashboard',
      ),
    ).toBe(false);

    expect(
      isChildActive(
        activity,
        siblings,
        '/overview',
        '',
        '#activity-timeline',
      ),
    ).toBe(true);
  });
});
