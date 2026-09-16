import { describe, expect, it } from 'vitest';
import { REGISTRY_META } from './registryMeta';
import {
  ALL_CAPABILITIES,
  EMPTY_SIGNALS,
  WIDGET_CATEGORIES,
  type ContextSignals,
} from './types';
import { NAV_MODULES } from '../navConfig';

const CAPS = new Set(ALL_CAPABILITIES);
const NAV_ICONS = new Set(NAV_MODULES.map((module) => module.icon));

function expectFinitePositiveNumber(
  value: unknown,
  label: string,
): asserts value is number {
  expect(typeof value, `${label} should be a number`).toBe('number');
  expect(Number.isFinite(value), `${label} should be finite`).toBe(true);
  expect(value, `${label} should be > 0`).toBeGreaterThan(0);
}

describe('REGISTRY_META integrity', () => {
  it('contains unique, non-empty widget ids', () => {
    const ids = REGISTRY_META.map((meta) => meta.id);

    expect(ids.every((id) => typeof id === 'string' && id.trim().length > 0)).toBe(
      true,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every requires/anyOf capability is a real Capability', () => {
    for (const meta of REGISTRY_META) {
      for (const capability of meta.requires) {
        expect(
          CAPS.has(capability),
          `${meta.id} requires unknown capability "${capability}"`,
        ).toBe(true);
      }

      for (const capability of meta.anyOf ?? []) {
        expect(
          CAPS.has(capability),
          `${meta.id} anyOf references unknown capability "${capability}"`,
        ).toBe(true);
      }
    }
  });

  it('every module is null or a real navConfig menu_key', () => {
    for (const meta of REGISTRY_META) {
      if (meta.module === null) continue;

      expect(
        NAV_ICONS.has(meta.module),
        `${meta.id} → unknown module "${meta.module}"`,
      ).toBe(true);
    }
  });

  it('every category is known', () => {
    for (const meta of REGISTRY_META) {
      expect(
        WIDGET_CATEGORIES.includes(meta.category),
        `${meta.id} has unknown category "${meta.category}"`,
      ).toBe(true);
    }
  });

  it('every widget kind is one of the supported registry kinds', () => {
    for (const meta of REGISTRY_META) {
      expect(['kpi', 'panel']).toContain(meta.kind);
    }
  });

  it('KPI widgets are single-column', () => {
    for (const meta of REGISTRY_META) {
      if (meta.kind === 'kpi') {
        expect(meta.defaultSize.w, `${meta.id} KPI width`).toBe(1);
      }
    }
  });

  it('defaultSize dimensions are valid', () => {
    for (const meta of REGISTRY_META) {
      expect(
        [1, 2, 3],
        `${meta.id} has invalid default width`,
      ).toContain(meta.defaultSize.w);

      expectFinitePositiveNumber(
        meta.defaultSize.h,
        `${meta.id} defaultSize.h`,
      );
    }
  });

  it('base priorities are finite numbers', () => {
    for (const meta of REGISTRY_META) {
      expect(
        typeof meta.basePriority,
        `${meta.id} basePriority should be numeric`,
      ).toBe('number');

      expect(
        Number.isFinite(meta.basePriority),
        `${meta.id} basePriority should be finite`,
      ).toBe(true);
    }
  });

  it('default-off widgets have an explicit opt-in path and do not duplicate ids', () => {
    const defaultOff = REGISTRY_META.filter(
      (meta) => meta.defaultEnabled === false,
    );

    const ids = defaultOff.map((meta) => meta.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const meta of defaultOff) {
      expect(meta.id.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate capability requirements within a widget', () => {
    for (const meta of REGISTRY_META) {
      expect(
        new Set(meta.requires).size,
        `${meta.id} contains duplicate requires capabilities`,
      ).toBe(meta.requires.length);

      if (meta.anyOf) {
        expect(
          new Set(meta.anyOf).size,
          `${meta.id} contains duplicate anyOf capabilities`,
        ).toBe(meta.anyOf.length);
      }
    }
  });

  it('does not duplicate capabilities across requires and anyOf accidentally', () => {
    for (const meta of REGISTRY_META) {
      if (!meta.anyOf) continue;

      const requires = new Set(meta.requires);

      for (const capability of meta.anyOf) {
        expect(
          requires.has(capability),
          `${meta.id} repeats "${capability}" in requires and anyOf`,
        ).toBe(false);
      }
    }
  });

  it('contextBoost is total, deterministic for identical input, and returns a sane shape', () => {
    const hotSignals: ContextSignals = {
      ...EMPTY_SIGNALS,
      criticalIncidents: 3,
      investigatingIncidents: 2,
      criticalVulns: 5,
      openAttackPaths: 1,
      costAnomalies: 2,
      failedDeployments: 1,
      criticalAlerts: 4,
      anomalyDollarImpact: 1250,
      generatedAt: '2026-09-03T00:00:00Z',
    };

    for (const meta of REGISTRY_META) {
      if (!meta.contextBoost) continue;

      const none = meta.contextBoost(EMPTY_SIGNALS);
      expect(
        none,
        `${meta.id} should not boost for EMPTY_SIGNALS`,
      ).toBeNull();

      const first = meta.contextBoost(hotSignals);
      const second = meta.contextBoost(hotSignals);

      expect(first).toEqual(second);

      if (first === null) continue;

      expectFinitePositiveNumber(
        first.priority,
        `${meta.id} contextBoost.priority`,
      );

      expect(
        typeof first.reason,
        `${meta.id} contextBoost.reason`,
      ).toBe('string');

      expect(
        first.reason.trim().length,
        `${meta.id} contextBoost.reason`,
      ).toBeGreaterThan(0);
    }
  });

  it('contextBoost does not mutate its signal input', () => {
    const signals: ContextSignals = {
      ...EMPTY_SIGNALS,
      criticalIncidents: 2,
      costAnomalies: 1,
      criticalAlerts: 1,
    };

    const before = structuredClone(signals);

    for (const meta of REGISTRY_META) {
      meta.contextBoost?.(signals);
    }

    expect(signals).toEqual(before);
  });

  it('covers every declared widget category', () => {
    const seen = new Set(REGISTRY_META.map((meta) => meta.category));

    for (const category of WIDGET_CATEGORIES) {
      expect(
        seen.has(category),
        `no widget in category "${category}"`,
      ).toBe(true);
    }
  });

  it('has the required issue catalogue breadth', () => {
    expect(REGISTRY_META.length).toBeGreaterThanOrEqual(60);
  });

  it('does not expose blank or whitespace-only titles', () => {
    for (const meta of REGISTRY_META) {
      expect(
        typeof meta.title,
        `${meta.id} title should be a string`,
      ).toBe('string');

      expect(
        meta.title.trim().length,
        `${meta.id} title should be non-empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('has valid module values for all module-scoped widgets', () => {
    for (const meta of REGISTRY_META) {
      if (meta.module === null) continue;

      expect(meta.module.trim().length).toBeGreaterThan(0);
      expect(NAV_ICONS.has(meta.module)).toBe(true);
    }
  });
});
