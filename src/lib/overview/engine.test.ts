import { describe, it, expect } from 'vitest';
import { buildOverviewConfig, getEligibleMeta, type EngineInput } from './engine';
import { deriveCapabilities } from './capabilities';
import { getEnabledModules } from './modules';
import { DEFAULT_PREFERENCES, EMPTY_SIGNALS, type EffectiveScope, type OverviewPreferences } from './types';
import type { MenuPermissionLevel } from '../api';
import type { Role } from '../navConfig';

const SCOPE: EffectiveScope = {
  orgId: 'org-1', orgName: 'Acme', folders: [], projects: [],
  restricted: false, connectionIds: 'all', region: 'all',
};

function input(
  role: Role,
  menu: Record<string, MenuPermissionLevel> | null,
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

const ids = (list: { meta: { id: string } }[]) => list.map((r) => r.meta.id);

describe('getEligibleMeta', () => {
  it('an owner with every module is eligible for the whole catalogue', () => {
    const i = input('owner', null);
    const eligible = getEligibleMeta(i);
    expect(eligible.length).toBeGreaterThanOrEqual(55);
  });

  it('a security-only viewer sees no finops or devops widgets', () => {
    const menu: Record<string, MenuPermissionLevel> = {
      security: 'read', cost: 'none', optimization: 'none', monitoring: 'none',
      cloud: 'none', incidents: 'none', automation: 'none', containers: 'none',
      resources: 'none', alerts: 'none',
    };
    const eligible = getEligibleMeta(input('viewer', menu));
    const eligibleIds = new Set(eligible.map((m) => m.id));
    // no finops widget is reachable without cost.read
    expect(eligible.some((m) => m.category === 'finops')).toBe(false);
    // no deployment/observability panel without devops.read / observability.read
    expect(eligibleIds.has('recent-deployments')).toBe(false);
    expect(eligibleIds.has('deployment-frequency')).toBe(false);
    expect(eligibleIds.has('infrastructure-health')).toBe(false);
    expect(eligibleIds.has('security-posture')).toBe(true);
  });
});

describe('buildOverviewConfig — persona shapes', () => {
  it('executive (owner) default view leads with operations + security, not pod-level widgets', () => {
    const cfg = buildOverviewConfig(input('owner', null));
    const shown = ids(cfg.widgets);
    expect(shown).toContain('active-incidents');
    expect(shown).toContain('security-posture');
    expect(shown).toContain('current-cloud-spend');
    // golden-signals / error-rate are default-off (not integrated) — hidden until added
    expect(shown).not.toContain('golden-signals');
    expect(shown).not.toContain('error-rate');
    // config is the issue §14 shape
    expect(cfg.user).toBe('u-1');
    expect(Array.isArray(cfg.modules)).toBe(true);
    expect(Array.isArray(cfg.capabilities)).toBe(true);
  });

  it('FinOps persona gets a finance-only Overview', () => {
    const menu: Record<string, MenuPermissionLevel> = {
      cost: 'admin', optimization: 'admin',
      security: 'none', cloud: 'none', monitoring: 'none', incidents: 'none',
      automation: 'none', containers: 'none', resources: 'none', alerts: 'none',
    };
    const cfg = buildOverviewConfig(input('viewer', menu));
    const panelCats = new Set(cfg.widgets.map((w) => w.meta.category));
    // finops + always-on cross-cutting operations widgets only
    expect(cfg.widgets.some((w) => w.meta.category === 'finops')).toBe(true);
    expect(panelCats.has('security')).toBe(false);
    expect(panelCats.has('devops')).toBe(false);
    expect(panelCats.has('observability')).toBe(false);
    expect(ids(cfg.kpis).some((id) => id.startsWith('kpi-'))).toBe(true);
    expect(ids(cfg.kpis)).not.toContain('kpi-security-score');
  });

  it('DevSecOps persona gets deployment + security widgets combined', () => {
    const menu: Record<string, MenuPermissionLevel> = {
      security: 'write', monitoring: 'write', resources: 'read', containers: 'write',
      cost: 'none', optimization: 'none', incidents: 'read',
    };
    const cfg = buildOverviewConfig(input('editor', menu));
    const shown = ids(cfg.widgets);
    expect(shown).toContain('recent-deployments');
    expect(shown).toContain('critical-vulnerabilities');
  });
});

describe('buildOverviewConfig — personalization (issue §15 level 2)', () => {
  it('hidden widgets drop out; opted-in default-off widgets appear', () => {
    const prefs: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      hidden: ['active-incidents'],
      added: ['compliance'],
    };
    const cfg = buildOverviewConfig(input('owner', null, { preferences: prefs }));
    const shown = ids(cfg.widgets);
    expect(shown).not.toContain('active-incidents');
    expect(shown).toContain('compliance');
  });

  it('a saved layout rect overrides the auto-packed position', () => {
    const prefs: OverviewPreferences = {
      ...DEFAULT_PREFERENCES,
      layout: { 'security-posture': { x: 8, y: 20, w: 4, h: 9 } },
    };
    const cfg = buildOverviewConfig(input('owner', null, { preferences: prefs }));
    const sp = cfg.widgets.find((w) => w.meta.id === 'security-posture');
    expect(sp?.layout).toEqual({ x: 8, y: 20, w: 4, h: 9 });
  });

  it('a favorite is pulled to the front', () => {
    const prefs: OverviewPreferences = { ...DEFAULT_PREFERENCES, favorites: ['cost-by-service'] };
    const cfg = buildOverviewConfig(input('owner', null, { preferences: prefs }));
    expect(cfg.widgets[0].meta.id).toBe('cost-by-service');
    expect(cfg.widgets[0].favorite).toBe(true);
  });
});

describe('buildOverviewConfig — context awareness (issue §15 level 3)', () => {
  it('a critical incident pushes Active Incidents to the top with a reason', () => {
    const calm = buildOverviewConfig(input('owner', null));
    const calmPos = ids(calm.widgets).indexOf('active-incidents');

    const hot = buildOverviewConfig(input('owner', null, {
      signals: { ...EMPTY_SIGNALS, criticalIncidents: 2, generatedAt: '2026-09-03T00:00:00Z' },
    }));
    expect(hot.widgets[0].meta.id).toBe('active-incidents');
    expect(hot.widgets[0].boostReason).toMatch(/critical incident/i);
    expect(ids(hot.widgets).indexOf('active-incidents')).toBeLessThan(calmPos);
  });

  it('a cost anomaly elevates the Cost Anomalies widget when it is shown', () => {
    const prefs: OverviewPreferences = { ...DEFAULT_PREFERENCES, added: ['cost-anomalies'] };
    const hot = buildOverviewConfig(input('owner', null, {
      preferences: prefs,
      signals: { ...EMPTY_SIGNALS, costAnomalies: 3 },
    }));
    const ca = hot.widgets.find((w) => w.meta.id === 'cost-anomalies');
    expect(ca?.boostReason).toMatch(/anomal/i);
  });
});
