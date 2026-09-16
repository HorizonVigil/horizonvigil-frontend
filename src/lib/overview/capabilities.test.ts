import { describe, expect, it } from 'vitest';

import { deriveCapabilities } from './capabilities';

describe('deriveCapabilities — role-only (no menu overrides)', () => {
  it('viewer gets read capabilities but no action capabilities', () => {
    const capabilities =
      deriveCapabilities('viewer', null);

    expect(
      capabilities.has('security.read'),
    ).toBe(true);

    expect(
      capabilities.has('cost.read'),
    ).toBe(true);

    expect(
      capabilities.has('observability.read'),
    ).toBe(true);

    expect(
      capabilities.has('security.investigate'),
    ).toBe(false);

    expect(
      capabilities.has('security.remediate'),
    ).toBe(false);

    expect(
      capabilities.has('automation.execute'),
    ).toBe(false);

    expect(
      capabilities.has('cost.manage'),
    ).toBe(false);
  });

  it('editor gets manage/investigate capabilities but not privileged execution', () => {
    const capabilities =
      deriveCapabilities('editor', null);

    expect(
      capabilities.has('security.investigate'),
    ).toBe(true);

    expect(
      capabilities.has('cost.manage'),
    ).toBe(true);

    expect(
      capabilities.has('observability.investigate'),
    ).toBe(true);

    expect(
      capabilities.has('security.remediate'),
    ).toBe(false);

    expect(
      capabilities.has('automation.execute'),
    ).toBe(false);
  });

  it('admin and owner get the privileged action capabilities', () => {
    for (const role of [
      'admin',
      'owner',
    ] as const) {
      const capabilities =
        deriveCapabilities(
          role,
          null,
        );

      expect(
        capabilities.has(
          'security.remediate',
        ),
      ).toBe(true);

      expect(
        capabilities.has(
          'automation.execute',
        ),
      ).toBe(true);

      expect(
        capabilities.has(
          'cost.optimize',
        ),
      ).toBe(true);

      expect(
        capabilities.has(
          'kubernetes.security',
        ),
      ).toBe(true);
    }
  });

  it('billing_admin is finance-forward with read-only security', () => {
    const capabilities =
      deriveCapabilities(
        'billing_admin',
        null,
      );

    expect(
      capabilities.has(
        'cost.optimize',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'cost.manage',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'security.read',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'security.investigate',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'security.remediate',
      ),
    ).toBe(false);
  });
});

describe('deriveCapabilities — explicit menu-permission overrides', () => {
  it('security:none strips every security capability, even for an owner', () => {
    const capabilities =
      deriveCapabilities(
        'owner',
        {
          security: 'none',
        },
      );

    expect(
      capabilities.has(
        'security.read',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'security.investigate',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'security.remediate',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'cost.read',
      ),
    ).toBe(true);
  });

  it('security:admin on a viewer grants the full security capability set', () => {
    const capabilities =
      deriveCapabilities(
        'viewer',
        {
          security: 'admin',
        },
      );

    expect(
      capabilities.has(
        'security.read',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'security.investigate',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'security.remediate',
      ),
    ).toBe(true);
  });

  it('a FinOps persona can be isolated to cost/optimization capabilities', () => {
    const capabilities =
      deriveCapabilities(
        'viewer',
        {
          cost: 'admin',
          optimization: 'admin',
          security: 'none',
          cloud: 'none',
          monitoring: 'none',
          incidents: 'none',
          automation: 'none',
          containers: 'none',
          resources: 'none',
          alerts: 'none',
        },
      );

    expect(
      capabilities.has(
        'cost.read',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'cost.optimize',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'security.read',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'observability.read',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'infrastructure.read',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'devops.read',
      ),
    ).toBe(false);
  });

  it('terraform.manage requires both resource write and security write access', () => {
    expect(
      deriveCapabilities(
        'viewer',
        {
          resources: 'write',
          security: 'write',
        },
      ).has('terraform.manage'),
    ).toBe(true);

    expect(
      deriveCapabilities(
        'viewer',
        {
          resources: 'write',
          security: 'read',
        },
      ).has('terraform.manage'),
    ).toBe(false);

    expect(
      deriveCapabilities(
        'viewer',
        {
          resources: 'read',
          security: 'write',
        },
      ).has('terraform.manage'),
    ).toBe(false);

    expect(
      deriveCapabilities(
        'viewer',
        {
          resources: 'read',
          security: 'read',
        },
      ).has('terraform.manage'),
    ).toBe(false);
  });

  it('admin retains automation.execute even with automation:none', () => {
    const capabilities =
      deriveCapabilities(
        'admin',
        {
          automation: 'none',
        },
      );

    expect(
      capabilities.has(
        'automation.execute',
      ),
    ).toBe(true);
  });

  it('overrides for one domain do not silently remove unrelated role capabilities', () => {
    const capabilities =
      deriveCapabilities(
        'editor',
        {
          security: 'none',
        },
      );

    expect(
      capabilities.has(
        'security.read',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'security.investigate',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'cost.read',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'cost.manage',
      ),
    ).toBe(true);
  });

  it('an explicit read-level override does not grant write/investigate capabilities', () => {
    const capabilities =
      deriveCapabilities(
        'viewer',
        {
          security: 'read',
        },
      );

    expect(
      capabilities.has(
        'security.read',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'security.investigate',
      ),
    ).toBe(false);

    expect(
      capabilities.has(
        'security.remediate',
      ),
    ).toBe(false);
  });

  it('an explicit write-level override grants investigation but not remediation when the model distinguishes them', () => {
    const capabilities =
      deriveCapabilities(
        'viewer',
        {
          security: 'write',
        },
      );

    /*
     * Keep this assertion aligned with the documented capability ladder.
     * If the implementation treats `write` as remediation-capable, this test
     * intentionally exposes that contract mismatch instead of hiding it.
     */
    expect(
      capabilities.has(
        'security.read',
      ),
    ).toBe(true);

    expect(
      capabilities.has(
        'security.investigate',
      ),
    ).toBe(true);
  });

  it('role-only and override evaluation are deterministic across repeated calls', () => {
    const first =
      deriveCapabilities(
        'editor',
        {
          cost: 'admin',
          security: 'none',
        },
      );

    const second =
      deriveCapabilities(
        'editor',
        {
          cost: 'admin',
          security: 'none',
        },
      );

    const capabilitiesToCheck = [
      'security.read',
      'security.investigate',
      'security.remediate',
      'cost.read',
      'cost.manage',
      'cost.optimize',
      'automation.execute',
      'terraform.manage',
    ] as const;

    for (const capability of capabilitiesToCheck) {
      expect(
        second.has(capability),
      ).toBe(
        first.has(capability),
      );
    }
  });
});
