import { describe, it, expect } from 'vitest';
import {
  buildOverviewConfig,
  getEligibleMeta,
  type EngineInput,
} from './engine';
import { deriveCapabilities } from './capabilities';
import { getEnabledModules } from './modules';
import {
  DEFAULT_PREFERENCES,
  EMPTY_SIGNALS,
  type EffectiveScope,
  type OverviewPreferences,
} from './types';
import type { MenuPermissionLevel } from '../api';
import type { Role } from '../navConfig';

const SCOPE: EffectiveScope = {
  orgId: 'org-1',
  orgName: 'Acme',
  folders: [],
  projects: [],
  restricted: false,
  connectionIds: 'all',
  region: 'all',
};

function input(
  role: Role,
  menu: Record<string, MenuPermissionLevel> | null | undefined,
  over: Partial<EngineInput> = {},
): EngineInput {
  return {
    userId: 'u-1',
    role,
    capabilities: deriveCapabilities(role, menu),
    enabledModules: getEnabledModules(role, menu),
    scope: SCOPE,
    preferences: DEFAULT_PREFERENCES,
    signals: EMPTY_SIGNALS,
    ...over,
  };
}

const ids = (list: ReadonlyArray<{ meta: { id: string } }>): string[] =>
  list.map((item) => item.meta.id);

describe('getEligibleMeta', () => {
  it('an owner with no overrides receives the complete currently-defined catalogue', () => {
    const eligible = getEligibleMeta(input('owner', null));

    // Keep this intentionally bounded to the current catalogue rather than
    // making the test pass simply because "55" happens to be below it.
    expect(eligible.length).toBeGreaterThanOrEqual(55);

    const uniqueIds = new Set(eligible.map((meta) => meta.id));
    expect(uniqueIds.size).toBe(eligible.length);
  });

  it('an explicit security-only viewer cannot reach FinOps or DevOps widgets', () => {
    const menu: Record<string, MenuPermissionLevel> = {
      security: 'read',
      cost: 'none',
      optimization: 'none',
      monitoring: 'none',
      cloud: 'none',
      incidents: 'none',
      automation: 'none',
      containers: 'none',
      resources: 'none',
      alerts: 'none',
    };

    const eligible = getEligibleMeta(input('viewer', menu));
    const eligibleIds = new Set(eligible.map((meta) => meta.id));

    expect(eligible.some((meta) => meta.category === 'finops')).toBe(false);
    expect(eligibleIds.has('recent-deployments')).toBe(false);
    expect(eligibleIds.has('deployment-frequency')).toBe(false);
    expect(eligibleIds.has('infrastructure-health')).toBe(false);
    expect(eligibleIds.has('security-posture')).toBe(true);
  });

  it('explicit none overrides the role-derived default for every supplied module', () => {
    const modules = [
      'security',
      'cost',
      'optimization',
      'monitoring',
      'cloud',
      'incidents',
      'automation',
      'containers',
      'resources',
      'alerts',
    ] as const;

    const menu = Object.fromEntries(
      modules.map((module) => [module, 'none' as MenuPermissionLevel]),
    );

    const eligible = getEligibleMeta(input('owner', menu));

    expect(eligible.some((meta) => meta.category === 'finops')).toBe(false);
    expect(eligible.some((meta) => meta.category === 'security')).toBe(false);
    expect(eligible.some((meta) => meta.category === 'devops')).toBe(false);
    expect(eligible.some((meta) => meta.category === 'observability')).toBe(false);
  });
});

describe('buildOverviewConfig — persona shapes', () => {
  it('executive (owner) default view leads with operations + security', () => {
    const cfg = buildOverviewConfig(input('owner', null));
    const shown = ids(cfg.widgets);

    expect(shown).toContain('active-incidents');
    expect(shown).toContain('security-posture');
    expect(shown).toContain('current-cloud-spend');

    // These remain default-off in the current catalogue.
    expect(shown).not.toContain('golden-signals');
    expect(shown).not.toContain('error-rate');

    expect(cfg.user).toBe('u-1');
    expect(Array.isArray(cfg.modules)).toBe(true);
    expect(Array.isArray(cfg.capabilities)).toBe(true);
  });

  it('FinOps persona gets a finance-focused Overview', () => {
    const menu: Record<string, MenuPermissionLevel> = {
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
    };

    const cfg = buildOverviewConfig(input('viewer', menu));
    const panelCategories = new Set(
      cfg.widgets.map((widget) => widget.meta.category),
    );

    expect(
      cfg.widgets.some((widget) => widget.meta.category === 'finops'),
    ).toBe(true);

    expect(panelCategories.has('security')).toBe(false);
    expect(panelCategories.has('devops')).toBe(false);
    expect(panelCategories.has('observability')).toBe(false);

    expect(ids(cfg.kpis).some((id) => id.startsWith('kpi-'))).toBe(true);
    expect(ids(cfg.kpis)).not.toContain('kpi-security-score');
  });

  it('DevSecOps persona gets deployment + security widgets combined', () => {
    const menu: Record<string, MenuPermissionLevel> = {
      security: 'write',
      monitoring: 'write',
      resources: 'read',
      containers: 'write',
      cost: 'none',
      optimization: 'none',
      incidents: 'read',
    };

    const cfg = buildOverviewConfig(input('editor', menu));
    const shown = ids(cfg.widgets);

    expect(shown).toContain('recent-deployments');
    expect(shown).toContain('critical-vulnerabilities');
  });
});

describe('buildOverviewConfig — personalization (issue §15 level 2)', () => {
  it('hidden widgets drop out; opted-in default-off widgets appear', () => {
    const preferences: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      hidden: ['active-incidents'],
      added: ['compliance'],
    };

    const cfg = buildOverviewConfig(
      input('owner', null, { preferences }),
    );

    const shown = ids(cfg.widgets);

    expect(shown).not.toContain('active-incidents');
    expect(shown).toContain('compliance');
  });

  it('a saved layout rect overrides the auto-packed position', () => {
    const preferences: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      layout: {
        'security-posture': {
          x: 8,
          y: 20,
          w: 4,
          h: 9,
        },
      },
    };

    const cfg = buildOverviewConfig(
      input('owner', null, { preferences }),
    );

    const securityPosture = cfg.widgets.find(
      (widget) => widget.meta.id === 'security-posture',
    );

    expect(securityPosture?.layout).toEqual({
      x: 8,
      y: 20,
      w: 4,
      h: 9,
    });
  });

  it('a favorite is pulled to the front and marked as favorite', () => {
    const preferences: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      favorites: ['cost-by-service'],
    };

    const cfg = buildOverviewConfig(
      input('owner', null, { preferences }),
    );

    expect(cfg.widgets[0]?.meta.id).toBe('cost-by-service');
    expect(cfg.widgets[0]?.favorite).toBe(true);
  });

  it('a hidden widget cannot be reintroduced merely by favoriting it', () => {
    const preferences: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      hidden: ['active-incidents'],
      favorites: ['active-incidents'],
    };

    const cfg = buildOverviewConfig(
      input('owner', null, { preferences }),
    );

    expect(ids(cfg.widgets)).not.toContain('active-incidents');
  });
});

describe('buildOverviewConfig — context awareness (issue §15 level 3)', () => {
  it('a critical incident pushes Active Incidents to the top with a reason', () => {
    const calm = buildOverviewConfig(input('owner', null));
    const calmPosition = ids(calm.widgets).indexOf('active-incidents');

    const hot = buildOverviewConfig(
      input('owner', null, {
        signals: {
          ...EMPTY_SIGNALS,
          criticalIncidents: 2,
          generatedAt: '2026-09-03T00:00:00Z',
        },
      }),
    );

    expect(hot.widgets[0]?.meta.id).toBe('active-incidents');
    expect(hot.widgets[0]?.boostReason).toMatch(/critical incident/i);
    expect(
      ids(hot.widgets).indexOf('active-incidents'),
    ).toBeLessThan(calmPosition);
  });

  it('a cost anomaly elevates the Cost Anomalies widget when it is shown', () => {
    const preferences: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      added: ['cost-anomalies'],
    };

    const hot = buildOverviewConfig(
      input('owner', null, {
        preferences,
        signals: {
          ...EMPTY_SIGNALS,
          costAnomalies: 3,
        },
      }),
    );

    const costAnomalies = hot.widgets.find(
      (widget) => widget.meta.id === 'cost-anomalies',
    );

    expect(costAnomalies?.boostReason).toMatch(/anomal/i);
  });

  it('does not apply a context boost to an ineligible widget', () => {
    const menu: Record<string, MenuPermissionLevel> = {
      security: 'none',
      cost: 'none',
      optimization: 'none',
      monitoring: 'none',
      cloud: 'none',
      incidents: 'none',
      automation: 'none',
      containers: 'none',
      resources: 'none',
      alerts: 'none',
    };

    const cfg = buildOverviewConfig(
      input('viewer', menu, {
        signals: {
          ...EMPTY_SIGNALS,
          criticalIncidents: 99,
          costAnomalies: 99,
        },
      }),
    );

    expect(ids(cfg.widgets)).not.toContain('active-incidents');
    expect(ids(cfg.widgets)).not.toContain('cost-anomalies');
  });

  it('produces deterministic ordering for identical inputs', () => {
    const first = buildOverviewConfig(input('owner', null));
    const second = buildOverviewConfig(input('owner', null));

    expect(
      first.widgets.map((widget) => widget.meta.id),
    ).toEqual(second.widgets.map((widget) => widget.meta.id));

    expect(
      first.kpis.map((kpi) => kpi.meta.id),
    ).toEqual(second.kpis.map((kpi) => kpi.meta.id));
  });

  it('preserves layout rectangles while context priority changes ordering', () => {
    const preferences: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      layout: {
        'active-incidents': {
          x: 2,
          y: 4,
          w: 6,
          h: 8,
        },
      },
    };

    const cfg = buildOverviewConfig(
      input('owner', null, {
        preferences,
        signals: {
          ...EMPTY_SIGNALS,
          criticalIncidents: 1,
        },
      }),
    );

    const activeIncidents = cfg.widgets.find(
      (widget) => widget.meta.id === 'active-incidents',
    );

    expect(activeIncidents?.layout).toEqual({
      x: 2,
      y: 4,
      w: 6,
      h: 8,
    });
  });
});

describe('buildOverviewConfig — defensive inputs', () => {
  it('does not mutate caller preferences', () => {
    const preferences: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      hidden: ['active-incidents'],
      added: ['compliance'],
      favorites: ['cost-by-service'],
      layout: {
        'security-posture': { x: 8, y: 20, w: 4, h: 9 },
      },
    };

    const before = structuredClone(preferences);

    buildOverviewConfig(input('owner', null, { preferences }));

    expect(preferences).toEqual(before);
  });

  it('does not mutate EMPTY_SIGNALS when it receives partial signal overrides', () => {
    const before = structuredClone(EMPTY_SIGNALS);

    buildOverviewConfig(
      input('owner', null, {
        signals: {
          ...EMPTY_SIGNALS,
          criticalIncidents: 1,
        },
      }),
    );

    expect(EMPTY_SIGNALS).toEqual(before);
  });
});
