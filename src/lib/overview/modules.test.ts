import { describe, it, expect, afterEach, vi } from 'vitest';
import { getEnabledModules } from './modules';

describe('getEnabledModules', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Regression test for a real bug caught live: Cloud Security/Cloud
   * Compliance were first built sharing Vulnerability Management's icon
   * ('security') for RBAC reasons. getEnabledModules() feeds
   * getVisibleModules().map(icon) straight into the Overview engine's
   * widget-eligibility gate (engine.ts's getEligibleMeta) -- so as long as
   * ANY visible module carried icon 'security', every module:'security'
   * widget in registryMeta.ts (Critical Vulnerabilities, Attack Paths,
   * Security Posture, ...) stayed eligible on the Overview dashboard even
   * with Vulnerability Management itself correctly hidden from the sidebar.
   * Cloud Security/Cloud Compliance now carry their own distinct icons
   * specifically to prevent this.
   */
  it('excludes every hidden module\'s icon in cloud-only mode, without excluding their still-visible shortcuts', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'true');
    const enabled = getEnabledModules('owner', null);

    expect(enabled.has('security')).toBe(false); // Vulnerability Management
    expect(enabled.has('incidents')).toBe(false);
    expect(enabled.has('organization')).toBe(false); // Organization Management
    expect(enabled.has('issues')).toBe(false);
    expect(enabled.has('dashboard')).toBe(false); // Custom Dashboards
    expect(enabled.has('users')).toBe(false); // Users & Groups

    // The cloud-only shortcuts are still visible, on their own distinct
    // icons -- proving they didn't get swept up in the exclusion above.
    expect(enabled.has('cloud-security')).toBe(true);
    expect(enabled.has('cloud-compliance')).toBe(true);
    // FinOps (never hidden) and its Cost Optimization shortcut share 'cost'
    // -- both visible, and safe to share since FinOps itself is never hidden.
    expect(enabled.has('cost')).toBe(true);
  });

  it('includes every module\'s icon in full (non-cloud-only) mode', () => {
    vi.stubEnv('VITE_CLOUD_ONLY_MODE', 'false');
    const enabled = getEnabledModules('owner', null);
    expect(enabled.has('security')).toBe(true);
    expect(enabled.has('incidents')).toBe(true);
    expect(enabled.has('organization')).toBe(true);
    expect(enabled.has('issues')).toBe(true);
    expect(enabled.has('dashboard')).toBe(true);
    expect(enabled.has('users')).toBe(true);
  });
});
