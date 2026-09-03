import { describe, it, expect } from 'vitest';
import { deriveCapabilities } from './capabilities';

describe('deriveCapabilities — role-only (no menu overrides)', () => {
  it('viewer gets read capabilities but no action capabilities', () => {
    const c = deriveCapabilities('viewer', null);
    expect(c.has('security.read')).toBe(true);
    expect(c.has('cost.read')).toBe(true);
    expect(c.has('observability.read')).toBe(true);
    expect(c.has('security.investigate')).toBe(false);
    expect(c.has('security.remediate')).toBe(false);
    expect(c.has('automation.execute')).toBe(false);
    expect(c.has('cost.manage')).toBe(false);
  });

  it('editor gets manage/investigate but not remediate/execute', () => {
    const c = deriveCapabilities('editor', null);
    expect(c.has('security.investigate')).toBe(true);
    expect(c.has('cost.manage')).toBe(true);
    expect(c.has('observability.investigate')).toBe(true);
    expect(c.has('security.remediate')).toBe(false);
    expect(c.has('automation.execute')).toBe(false);
  });

  it('admin and owner get the privileged action capabilities', () => {
    for (const role of ['admin', 'owner'] as const) {
      const c = deriveCapabilities(role, null);
      expect(c.has('security.remediate')).toBe(true);
      expect(c.has('automation.execute')).toBe(true);
      expect(c.has('cost.optimize')).toBe(true);
      expect(c.has('kubernetes.security')).toBe(true);
    }
  });

  it('billing_admin is finance-forward: full cost, read-only security', () => {
    const c = deriveCapabilities('billing_admin', null);
    expect(c.has('cost.optimize')).toBe(true);
    expect(c.has('cost.manage')).toBe(true);
    expect(c.has('security.read')).toBe(true);
    expect(c.has('security.investigate')).toBe(false);
  });
});

describe('deriveCapabilities — explicit menu-permission overrides win', () => {
  it('security:none strips every security capability, even for an owner', () => {
    const c = deriveCapabilities('owner', { security: 'none' });
    expect(c.has('security.read')).toBe(false);
    expect(c.has('security.investigate')).toBe(false);
    expect(c.has('security.remediate')).toBe(false);
    // unrelated domains untouched
    expect(c.has('cost.read')).toBe(true);
  });

  it('security:admin on a viewer grants remediate', () => {
    const c = deriveCapabilities('viewer', { security: 'admin' });
    expect(c.has('security.read')).toBe(true);
    expect(c.has('security.investigate')).toBe(true);
    expect(c.has('security.remediate')).toBe(true);
  });

  it('a FinOps persona (cost admin, everything else none) sees only cost', () => {
    const c = deriveCapabilities('viewer', {
      cost: 'admin', optimization: 'admin',
      security: 'none', cloud: 'none', monitoring: 'none',
      incidents: 'none', automation: 'none', containers: 'none',
      resources: 'none', alerts: 'none',
    });
    expect(c.has('cost.read')).toBe(true);
    expect(c.has('cost.optimize')).toBe(true);
    expect(c.has('security.read')).toBe(false);
    expect(c.has('observability.read')).toBe(false);
    expect(c.has('infrastructure.read')).toBe(false);
    expect(c.has('devops.read')).toBe(false);
  });

  it('terraform.manage needs both resources and security at write+', () => {
    expect(deriveCapabilities('viewer', { resources: 'write', security: 'write' }).has('terraform.manage')).toBe(true);
    expect(deriveCapabilities('viewer', { resources: 'write', security: 'read' }).has('terraform.manage')).toBe(false);
  });

  it('admin keeps automation.execute even with automation:none (route stays admin-gated)', () => {
    const c = deriveCapabilities('admin', { automation: 'none' });
    expect(c.has('automation.execute')).toBe(true);
  });
});
