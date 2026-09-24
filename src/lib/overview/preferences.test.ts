import { describe, expect, it } from 'vitest';

import { normalizePreferences } from './preferences';
import { DEFAULT_PREFERENCES } from './types';

describe('normalizePreferences', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'nope'],
    ['number', 42],
    ['boolean', true],
    ['array', []],
  ])('returns defaults for %s input', (_label, value) => {
    expect(normalizePreferences(value)).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid fields and drops malformed values without leaking junk', () => {
    const preferences = normalizePreferences({
      layout: {
        good: { x: 1, y: 2, w: 4, h: 6 },
        bad: { x: 'nope', y: 2 },
      },
      hidden: ['a', 2, 'b', null],
      favorites: 'not-an-array',
      added: ['x'],
      kpiOrder: ['kpi-a'],
      kpiHidden: [],
      defaults: {
        projectId: 'proj-1',
        environment: 5,
        dateRange: '7d',
      },
      dismissedSignals: {
        incidents: 123,
        bad: 'x',
      },
      junk: true,
    });

    expect(preferences.layout).toEqual({
      good: { x: 1, y: 2, w: 4, h: 6 },
    });

    expect(preferences.hidden).toEqual(['a', 'b']);
    expect(preferences.favorites).toEqual([]);
    expect(preferences.added).toEqual(['x']);
    expect(preferences.kpiOrder).toEqual(['kpi-a']);
    expect(preferences.kpiHidden).toEqual([]);

    expect(preferences.defaults).toEqual({
      projectId: 'proj-1',
      environment: undefined,
      dateRange: '7d',
    });

    expect(preferences.dismissedSignals).toEqual({
      incidents: 123,
    });

    expect(preferences).not.toHaveProperty('junk');
  });

  it('does not mutate the caller input', () => {
    const input = {
      layout: {
        good: { x: 1, y: 2, w: 4, h: 6 },
      },
      hidden: ['a', 'b'],
      favorites: ['cost-by-service'],
      added: ['compliance'],
      kpiOrder: ['kpi-cost'],
      kpiHidden: ['kpi-security-score'],
      defaults: {
        projectId: 'proj-1',
        environment: 'prod',
        dateRange: '7d',
      },
      dismissedSignals: {
        incidents: 123,
      },
    };

    const before = structuredClone(input);

    normalizePreferences(input);

    expect(input).toEqual(before);
  });

  it('returns independent collections instead of sharing mutable default state', () => {
    const first = normalizePreferences(null);
    const second = normalizePreferences(null);

    expect(first).not.toBe(DEFAULT_PREFERENCES);
    expect(second).not.toBe(DEFAULT_PREFERENCES);

    first.hidden.push('test-hidden');
    first.favorites.push('test-favorite');
    first.added.push('test-added');
    first.kpiOrder.push('test-kpi');
    first.kpiHidden.push('test-kpi-hidden');

    expect(second.hidden).not.toContain('test-hidden');
    expect(second.favorites).not.toContain('test-favorite');
    expect(second.added).not.toContain('test-added');
    expect(second.kpiOrder).not.toContain('test-kpi');
    expect(second.kpiHidden).not.toContain('test-kpi-hidden');

    expect(DEFAULT_PREFERENCES.hidden).not.toContain('test-hidden');
    expect(DEFAULT_PREFERENCES.favorites).not.toContain('test-favorite');
    expect(DEFAULT_PREFERENCES.added).not.toContain('test-added');
    expect(DEFAULT_PREFERENCES.kpiOrder).not.toContain('test-kpi');
    expect(DEFAULT_PREFERENCES.kpiHidden).not.toContain('test-kpi-hidden');
  });

  it('does not preserve malformed layout entries just because the parent layout is an object', () => {
    const preferences = normalizePreferences({
      layout: {
        valid: { x: 0, y: 0, w: 12, h: 4 },
        missingHeight: { x: 0, y: 0, w: 12 },
        negativeWidth: { x: 0, y: 0, w: -1, h: 4 },
        nanLike: { x: 'NaN', y: 0, w: 4, h: 4 },
      },
    });

    expect(preferences.layout).toEqual({
      valid: { x: 0, y: 0, w: 12, h: 4 },
    });
  });

  it('drops non-string array members rather than coercing them into IDs', () => {
    const preferences = normalizePreferences({
      hidden: ['valid', 123, {}, null, 'also-valid'],
      favorites: ['fav', false],
      added: [null, 'added'],
      kpiOrder: [42, 'kpi'],
      kpiHidden: [{ id: 'kpi' }, 'hidden'],
    });

    expect(preferences.hidden).toEqual(['valid', 'also-valid']);
    expect(preferences.favorites).toEqual(['fav']);
    expect(preferences.added).toEqual(['added']);
    expect(preferences.kpiOrder).toEqual(['kpi']);
    expect(preferences.kpiHidden).toEqual(['hidden']);
  });

  it('keeps valid defaults while dropping only malformed default fields', () => {
    const preferences = normalizePreferences({
      defaults: {
        projectId: 'proj-2',
        environment: 123,
        dateRange: '30d',
        extra: 'ignored',
      },
    });

    expect(preferences.defaults).toEqual({
      projectId: 'proj-2',
      environment: undefined,
      dateRange: '30d',
    });
  });

  it('keeps valid dismissed-signal entries and drops malformed values', () => {
    const preferences = normalizePreferences({
      dismissedSignals: {
        incidents: 123,
        anomalies: 456,
        invalid: 'nope',
        another: null,
      },
    });

    expect(preferences.dismissedSignals).toEqual({
      incidents: 123,
      anomalies: 456,
    });
  });

  it('is deterministic for the same input', () => {
    const value = {
      hidden: ['a', 'b'],
      favorites: ['cost-by-service'],
      added: ['compliance'],
      kpiOrder: ['kpi-cost'],
      defaults: {
        projectId: 'proj-1',
        environment: 'prod',
        dateRange: '7d',
      },
      dismissedSignals: {
        incidents: 123,
      },
    };

    expect(normalizePreferences(value)).toEqual(normalizePreferences(value));
  });
});
