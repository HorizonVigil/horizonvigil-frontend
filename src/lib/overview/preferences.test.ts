import { describe, it, expect } from 'vitest';
import { normalizePreferences } from './preferences';
import { DEFAULT_PREFERENCES } from './types';

describe('normalizePreferences', () => {
  it('returns defaults for null / garbage', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences('nope')).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps valid fields and drops malformed ones', () => {
    const p = normalizePreferences({
      layout: { good: { x: 1, y: 2, w: 4, h: 6 }, bad: { x: 'nope', y: 2 } },
      hidden: ['a', 2, 'b'],
      favorites: 'not-an-array',
      added: ['x'],
      kpiOrder: ['kpi-a'],
      kpiHidden: [],
      defaults: { projectId: 'proj-1', environment: 5, dateRange: '7d' },
      dismissedSignals: { incidents: 123, bad: 'x' },
      junk: true,
    });
    expect(p.layout).toEqual({ good: { x: 1, y: 2, w: 4, h: 6 } });
    expect(p.hidden).toEqual(['a', 'b']);
    expect(p.favorites).toEqual([]);
    expect(p.added).toEqual(['x']);
    expect(p.defaults).toEqual({ projectId: 'proj-1', environment: undefined, dateRange: '7d' });
    expect(p.dismissedSignals).toEqual({ incidents: 123 });
    expect(p).not.toHaveProperty('junk');
  });
});
