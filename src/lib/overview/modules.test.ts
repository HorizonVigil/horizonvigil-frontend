import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnabledModules } from './modules';

describe('getEnabledModules', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /**
   * Regression coverage for the production bug where multiple navigation
   * entries shared the `security` icon. The Overview engine consumes the
   * enabled-module icon set as a widget eligibility gate, so a hidden
   * Vulnerability Management module must not become eligible merely because
   * Cloud Security or Cloud Compliance are visible.
   */
  it('excludes hidden module icons in cloud-only mode while preserving visible management shortcuts', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'true');

    const enabled = getEnabledModules('owner', null);

    // Vulnerability Management.
    expect(enabled.has('security')).toBe(false);

    // Modules hidden in cloud-only mode.
    expect(enabled.has('incidents')).toBe(false);
    expect(enabled.has('issues')).toBe(false);
    expect(enabled.has('dashboard')).toBe(false);
    expect(enabled.has('monitoring')).toBe(false);
    expect(enabled.has('alerts')).toBe(false);

    // Access/org-management remains available.
    expect(enabled.has('users')).toBe(true);
    expect(enabled.has('organization')).toBe(true);

    // Cloud-only security/compliance shortcuts use distinct identifiers.
    expect(enabled.has('cloud-security')).toBe(true);
    expect(enabled.has('cloud-compliance')).toBe(true);

    // Cost is not hidden by cloud-only mode.
    expect(enabled.has('cost')).toBe(true);
  });

  it('includes the full module icon set in non-cloud-only mode', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'false');

    const enabled = getEnabledModules('owner', null);

    expect(enabled.has('security')).toBe(true);
    expect(enabled.has('incidents')).toBe(true);
    expect(enabled.has('organization')).toBe(true);
    expect(enabled.has('issues')).toBe(true);
    expect(enabled.has('dashboard')).toBe(true);
    expect(enabled.has('users')).toBe(true);
    expect(enabled.has('monitoring')).toBe(true);
    expect(enabled.has('alerts')).toBe(true);
  });

  it('does not leak a hidden security capability through cloud-only shortcut modules', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'true');

    const enabled = getEnabledModules('owner', null);

    // The critical invariant is not merely that Vulnerability Management is
    // absent from navigation; its exact `security` capability/module key must
    // also be absent from the returned set.
    expect(enabled.has('security')).toBe(false);

    expect(enabled.has('cloud-security')).toBe(true);
    expect(enabled.has('cloud-compliance')).toBe(true);
  });

  it('keeps output isolated between calls when the environment changes', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'true');
    const cloudOnly = getEnabledModules('owner', null);

    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'false');
    const full = getEnabledModules('owner', null);

    expect(cloudOnly.has('security')).toBe(false);
    expect(full.has('security')).toBe(true);

    // The first Set must represent the state at the time it was created,
    // rather than sharing mutable state with later calls.
    expect(cloudOnly.has('incidents')).toBe(false);
    expect(full.has('incidents')).toBe(true);
  });

  it('accepts null permissions without treating them as an explicit deny', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'false');

    const enabled = getEnabledModules('owner', null);

    expect(enabled.has('security')).toBe(true);
    expect(enabled.has('cost')).toBe(true);
    expect(enabled.has('users')).toBe(true);
    expect(enabled.has('organization')).toBe(true);
  });

  it('keeps the cloud-only result free of the modules explicitly known to be hidden', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'true');

    const enabled = getEnabledModules('owner', null);

    const hiddenInCloudOnly = [
      'security',
      'incidents',
      'issues',
      'dashboard',
      'monitoring',
      'alerts',
    ];

    for (const moduleIcon of hiddenInCloudOnly) {
      expect(
        enabled.has(moduleIcon),
        `expected hidden module icon "${moduleIcon}" to be excluded`,
      ).toBe(false);
    }
  });

  it('does not share mutable Set state across callers', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'false');

    const first = getEnabledModules('owner', null);
    const second = getEnabledModules('owner', null);

    expect(first).not.toBe(second);

    const originalSecondSize = second.size;
    first.add('__test_only__');

    expect(first.has('__test_only__')).toBe(true);
    expect(second.has('__test_only__')).toBe(false);
    expect(second.size).toBe(originalSecondSize);
  });
});
