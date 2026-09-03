import { describe, it, expect } from 'vitest';
import { REGISTRY_META } from './registryMeta';
import { ALL_CAPABILITIES, WIDGET_CATEGORIES, EMPTY_SIGNALS } from './types';
import { NAV_MODULES } from '../navConfig';

const CAPS = new Set(ALL_CAPABILITIES);
const NAV_ICONS = new Set(NAV_MODULES.map((m) => m.icon));

describe('REGISTRY_META integrity', () => {
  it('every widget id is unique', () => {
    const ids = REGISTRY_META.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every requires/anyOf capability is a real Capability', () => {
    for (const m of REGISTRY_META) {
      for (const c of m.requires) expect(CAPS.has(c), `${m.id} requires unknown ${c}`).toBe(true);
      for (const c of m.anyOf ?? []) expect(CAPS.has(c), `${m.id} anyOf unknown ${c}`).toBe(true);
    }
  });

  it('every module is null or a real navConfig menu_key', () => {
    for (const m of REGISTRY_META) {
      if (m.module === null) continue;
      expect(NAV_ICONS.has(m.module), `${m.id} → unknown module "${m.module}"`).toBe(true);
    }
  });

  it('every category is known', () => {
    for (const m of REGISTRY_META) {
      expect(WIDGET_CATEGORIES.includes(m.category), `${m.id} bad category ${m.category}`).toBe(true);
    }
  });

  it('KPI widgets are single-column', () => {
    for (const m of REGISTRY_META) {
      if (m.kind === 'kpi') expect(m.defaultSize.w, `${m.id}`).toBe(1);
    }
  });

  it('defaultSize.w is 1..3 and h is positive', () => {
    for (const m of REGISTRY_META) {
      expect([1, 2, 3]).toContain(m.defaultSize.w);
      expect(m.defaultSize.h).toBeGreaterThan(0);
    }
  });

  it('contextBoost, when present, is total and returns a sane shape', () => {
    for (const m of REGISTRY_META) {
      if (!m.contextBoost) continue;
      const none = m.contextBoost(EMPTY_SIGNALS);
      expect(none === null).toBe(true); // no boost when nothing is wrong
      const hot = m.contextBoost({
        ...EMPTY_SIGNALS,
        criticalIncidents: 3, investigatingIncidents: 2, criticalVulns: 5,
        openAttackPaths: 1, costAnomalies: 2, failedDeployments: 1, criticalAlerts: 4,
      });
      if (hot) {
        expect(typeof hot.priority).toBe('number');
        expect(hot.priority).toBeGreaterThan(0);
        expect(typeof hot.reason).toBe('string');
        expect(hot.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('covers all seven widget categories', () => {
    const seen = new Set(REGISTRY_META.map((m) => m.category));
    for (const c of WIDGET_CATEGORIES) expect(seen.has(c), `no widget in category ${c}`).toBe(true);
  });

  it('has the full issue catalogue breadth (>= 60 widgets)', () => {
    expect(REGISTRY_META.length).toBeGreaterThanOrEqual(60);
  });
});
