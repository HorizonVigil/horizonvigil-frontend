import { describe, it, expect } from 'vitest';
import { moduleMatchesPath, isChildActive, findActiveModule, NAV_MODULES, type NavModule, type NavChild } from './navConfig';

// Raw-text import (Vite feature, typed via vite/client in vite-env.d.ts) --
// avoids depending on node:fs/node:path, which aren't available under this
// project's browser-targeted tsconfig (no @types/node on the `src` program).
const appSourceFiles = import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function mod(overrides: Partial<NavModule> & { children: NavChild[] }): NavModule {
  return { label: 'Test', icon: '•', ...overrides };
}

describe('NAV_MODULES sections', () => {
  it('every module carries a section for AppRail\'s grouping', () => {
    for (const m of NAV_MODULES) {
      expect(m.section, `module "${m.label}" is missing a section`).toBeTruthy();
    }
  });

  it('every module has a unique icon (RBAC menu_key)', () => {
    const icons = NAV_MODULES.map(m => m.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  /**
   * findActiveModule/moduleMatchesPath do a prefix match over EVERY child's
   * `to` regardless of `real` or which module declares it, and NAV_MODULES
   * .find() returns the first array match -- so a child that cross-links
   * into a path another module actually owns can silently "steal" that
   * path if it happens to sit earlier in the array (caught twice by hand
   * this session: Asset Inventory's old cross-links into the six now-folded
   * security modules, and Vulnerability Management's Reports/Resources
   * cross-links). This test asserts the invariant directly instead of
   * relying on catching each instance by hand again: every real child's
   * path must resolve, via findActiveModule, back to the module that
   * actually declares it.
   */
  it('every real child\'s path resolves back to its own declaring module (no cross-link steals another module\'s path)', () => {
    function pathOnly(to: string): string {
      return to.split('#')[0].split('?')[0];
    }
    const offenders: string[] = [];
    for (const m of NAV_MODULES) {
      for (const c of m.children) {
        if (!c.real || !c.to) continue;
        const path = pathOnly(c.to);
        if (!path) continue;
        const resolved = findActiveModule(path);
        if (resolved.label !== m.label) {
          offenders.push(`"${m.label}" > "${c.label}" (${c.to}) resolves to "${resolved.label}" instead`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  /**
   * ProtectedRoute's module-level check does `NAV_MODULES.find(m => m.label
   * === module)` -- a totally separate lookup path from findActiveModule
   * above, keyed by App.tsx's own hardcoded `module="..."` strings rather
   * than by URL. When a module is folded into another one (as the six
   * security pillars were, into Vulnerability Management, in the Phase 1 IA
   * redesign) and App.tsx isn't updated to match, `mod` comes back
   * `undefined` and ProtectedRoute unconditionally renders AccessDenied --
   * for every role, including admin/owner. This silently broke 6 routes for
   * an entire session before being caught by a live bug report, precisely
   * because it fails "closed" (looks like a permissions problem, not a
   * typo) and nothing exercises this lookup path. Asserts every module=
   * string in App.tsx resolves to a real NAV_MODULES label so this class of
   * bug can't reoccur silently again.
   */
  it('every ProtectedRoute module="..." in App.tsx resolves to a real NAV_MODULES label', () => {
    const appSource = Object.values(appSourceFiles)[0];
    expect(appSource, 'App.tsx raw import came back empty -- check the glob pattern still resolves').toBeTruthy();
    // 'Subscription' is feature-flagged out of NAV_MODULES by isBillingEnabled()
    // (reads VITE_BILLING_API_URL, never set in the vitest environment) --
    // legitimately absent here without being a stale-label bug like this test
    // otherwise guards against. Confirmed by reading featureFlags.ts directly,
    // not assumed.
    const labels = new Set([...NAV_MODULES.map(m => m.label), 'Subscription']);
    const found = [...appSource.matchAll(/ProtectedRoute module="([^"]+)"/g)].map(m => m[1]);
    expect(found.length, 'no ProtectedRoute module="..." usages found -- check the regex/file path still match App.tsx').toBeGreaterThan(0);
    const offenders = found.filter(label => !labels.has(label));
    expect(offenders, `these module="..." values in App.tsx don't match any current NAV_MODULES label: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('moduleMatchesPath', () => {
  it('matches the module\'s own landing page', () => {
    const m = mod({ to: '/widgets', children: [] });
    expect(moduleMatchesPath(m, '/widgets')).toBe(true);
  });

  it('matches a sub-path of the landing page', () => {
    const m = mod({ to: '/widgets', children: [] });
    expect(moduleMatchesPath(m, '/widgets/123')).toBe(true);
  });

  it('matches via a child route, ignoring the child\'s query string', () => {
    const m = mod({ to: '/widgets', children: [{ label: 'Sub', to: '/widgets/sub?tab=x', real: true }] });
    expect(moduleMatchesPath(m, '/widgets/sub')).toBe(true);
  });

  it('does not match an unrelated path', () => {
    const m = mod({ to: '/widgets', children: [] });
    expect(moduleMatchesPath(m, '/gadgets')).toBe(false);
  });
});

describe('findActiveModule', () => {
  it('resolves /cloud-accounts to the Cloud Accounts module', () => {
    expect(findActiveModule('/cloud-accounts').label).toBe('Cloud Accounts');
  });

  it('resolves /cloud-accounts/some-id to the Cloud Accounts module', () => {
    expect(findActiveModule('/cloud-accounts/abc-123').label).toBe('Cloud Accounts');
  });

  it('resolves /overview to the Overview module', () => {
    expect(findActiveModule('/overview').label).toBe('Overview');
  });

  it('resolves /resources to the relabeled Asset Inventory module', () => {
    expect(findActiveModule('/resources').label).toBe('Asset Inventory');
  });

  it('resolves each security pillar route to Vulnerability Management, which now owns them all', () => {
    expect(findActiveModule('/security-scanning').label).toBe('Vulnerability Management');
    expect(findActiveModule('/cloud-security').label).toBe('Vulnerability Management');
    expect(findActiveModule('/application-security').label).toBe('Vulnerability Management');
    expect(findActiveModule('/code-security').label).toBe('Vulnerability Management');
    expect(findActiveModule('/container-security').label).toBe('Vulnerability Management');
    expect(findActiveModule('/infrastructure-security').label).toBe('Vulnerability Management');
  });

  it('falls back to the first module for a path nothing claims', () => {
    expect(findActiveModule('/this-route-does-not-exist')).toBe(NAV_MODULES[0]);
  });
});

describe('isChildActive', () => {
  it('is active when pathname matches and neither has a tab', () => {
    const child: NavChild = { label: 'A', to: '/widgets', real: true };
    expect(isChildActive(child, [child], '/widgets', '', '')).toBe(true);
  });

  it('is not active when the pathname differs', () => {
    const child: NavChild = { label: 'A', to: '/widgets', real: true };
    expect(isChildActive(child, [child], '/gadgets', '', '')).toBe(false);
  });

  it('is not active when the child has no `to`', () => {
    const child: NavChild = { label: 'A', real: false };
    expect(isChildActive(child, [child], '/widgets', '', '')).toBe(false);
  });

  it('matches on tab query param, not just pathname', () => {
    const a: NavChild = { label: 'A', to: '/widgets?tab=Alpha', real: true };
    const b: NavChild = { label: 'B', to: '/widgets?tab=Beta', real: true };
    expect(isChildActive(a, [a, b], '/widgets', '?tab=Alpha', '')).toBe(true);
    expect(isChildActive(a, [a, b], '/widgets', '?tab=Beta', '')).toBe(false);
  });

  it('a bare (no ?tab=) child only matches when there is no current tab', () => {
    const bare: NavChild = { label: 'Default', to: '/widgets', real: true };
    const tabbed: NavChild = { label: 'Other', to: '/widgets?tab=Other', real: true };
    expect(isChildActive(bare, [bare, tabbed], '/widgets', '', '')).toBe(true);
    expect(isChildActive(bare, [bare, tabbed], '/widgets', '?tab=Other', '')).toBe(false);
  });

  it('does not highlight any sibling when several children share one destination', () => {
    const a: NavChild = { label: 'A', to: '/widgets', real: true };
    const b: NavChild = { label: 'B', to: '/widgets', real: true };
    expect(isChildActive(a, [a, b], '/widgets', '', '')).toBe(false);
    expect(isChildActive(b, [a, b], '/widgets', '', '')).toBe(false);
  });

  it('does not highlight any sibling when different `to` values still resolve to the same page+tab (e.g. Resources\' Dependency Graph vs. Bulk Operations, both /resources/all with no distinguishing tab)', () => {
    const a: NavChild = { label: 'Dependency Graph', to: '/resources/all', real: true };
    const b: NavChild = { label: 'Bulk Operations', to: '/resources/all?bulk=1', real: true };
    expect(isChildActive(a, [a, b], '/resources/all', '', '')).toBe(false);
    expect(isChildActive(b, [a, b], '/resources/all', '', '')).toBe(false);
  });

  it('only the matching hash-anchor sibling is active, and none are when there is no hash at all (Overview\'s Executive Dashboard/Activity Timeline/Quick Actions/Favorites)', () => {
    const dash: NavChild = { label: 'Executive Dashboard', to: '/overview#executive-dashboard', real: true };
    const activity: NavChild = { label: 'Activity Timeline', to: '/overview#activity-timeline', real: true };
    const siblings = [dash, activity];
    expect(isChildActive(dash, siblings, '/overview', '', '')).toBe(false);
    expect(isChildActive(activity, siblings, '/overview', '', '')).toBe(false);
    expect(isChildActive(dash, siblings, '/overview', '', '#executive-dashboard')).toBe(true);
    expect(isChildActive(activity, siblings, '/overview', '', '#executive-dashboard')).toBe(false);
    expect(isChildActive(activity, siblings, '/overview', '', '#activity-timeline')).toBe(true);
  });
});
