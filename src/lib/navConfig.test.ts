import { describe, it, expect } from 'vitest';
import { moduleMatchesPath, isChildActive, findActiveModule, NAV_MODULES, type NavModule, type NavChild } from './navConfig';

function mod(overrides: Partial<NavModule> & { children: NavChild[] }): NavModule {
  return { label: 'Test', icon: '•', ...overrides };
}

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

  it('falls back to the first module for a path nothing claims', () => {
    expect(findActiveModule('/this-route-does-not-exist')).toBe(NAV_MODULES[0]);
  });
});

describe('isChildActive', () => {
  it('is active when pathname matches and neither has a tab', () => {
    const child: NavChild = { label: 'A', to: '/widgets', real: true };
    expect(isChildActive(child, [child], '/widgets', '')).toBe(true);
  });

  it('is not active when the pathname differs', () => {
    const child: NavChild = { label: 'A', to: '/widgets', real: true };
    expect(isChildActive(child, [child], '/gadgets', '')).toBe(false);
  });

  it('is not active when the child has no `to`', () => {
    const child: NavChild = { label: 'A', real: false };
    expect(isChildActive(child, [child], '/widgets', '')).toBe(false);
  });

  it('matches on tab query param, not just pathname', () => {
    const a: NavChild = { label: 'A', to: '/widgets?tab=Alpha', real: true };
    const b: NavChild = { label: 'B', to: '/widgets?tab=Beta', real: true };
    expect(isChildActive(a, [a, b], '/widgets', '?tab=Alpha')).toBe(true);
    expect(isChildActive(a, [a, b], '/widgets', '?tab=Beta')).toBe(false);
  });

  it('a bare (no ?tab=) child only matches when there is no current tab', () => {
    const bare: NavChild = { label: 'Default', to: '/widgets', real: true };
    const tabbed: NavChild = { label: 'Other', to: '/widgets?tab=Other', real: true };
    expect(isChildActive(bare, [bare, tabbed], '/widgets', '')).toBe(true);
    expect(isChildActive(bare, [bare, tabbed], '/widgets', '?tab=Other')).toBe(false);
  });

  it('does not highlight any sibling when several children share one destination', () => {
    const a: NavChild = { label: 'A', to: '/widgets', real: true };
    const b: NavChild = { label: 'B', to: '/widgets', real: true };
    expect(isChildActive(a, [a, b], '/widgets', '')).toBe(false);
    expect(isChildActive(b, [a, b], '/widgets', '')).toBe(false);
  });
});
