import { describe, it, expect } from 'vitest';
import { resolveConnectionScope, scopedConnectionId, scopedConnectionIds, scopeMonitoringHealth, type MonitoringHealthLike } from './scopeLogic';
import type { EffectiveScope } from './types';

function scope(over: Partial<EffectiveScope> = {}): EffectiveScope {
  return {
    orgId: 'o1', orgName: 'Org', folders: [], projects: [],
    restricted: false, connectionIds: 'all', region: 'all',
    ...over,
  };
}

describe('resolveConnectionScope', () => {
  it('is unrestricted when neither axis narrows', () => {
    expect(resolveConnectionScope(['a', 'b'], false, null)).toEqual({ restricted: false, connectionIds: 'all' });
    expect(resolveConnectionScope(['a', 'b'], false, { restricted: false, connectionIds: [] })).toEqual({ restricted: false, connectionIds: 'all' });
  });

  it('a folder/project scope pick alone narrows to that scope\'s connections', () => {
    expect(resolveConnectionScope(['a', 'b'], true, null)).toEqual({ restricted: true, connectionIds: ['a', 'b'] });
  });

  it('a resource-grant restriction alone narrows to the granted ids', () => {
    const r = resolveConnectionScope(['a', 'b', 'c'], false, { restricted: true, connectionIds: ['a', 'c'] });
    expect(r).toEqual({ restricted: true, connectionIds: ['a', 'c'] });
  });

  it('when both apply, intersects rather than letting one win', () => {
    // scope narrows the known set to [a, b]; grants only allow [b, z] -- only b satisfies both
    const r = resolveConnectionScope(['a', 'b'], true, { restricted: true, connectionIds: ['b', 'z'] });
    expect(r).toEqual({ restricted: true, connectionIds: ['b'] });
  });

  it('grants restriction referencing an id outside the scoped set drops it', () => {
    const r = resolveConnectionScope(['a'], true, { restricted: true, connectionIds: ['z'] });
    expect(r.connectionIds).toEqual([]);
  });
});

describe('scopedConnectionId (singular)', () => {
  it('prefers an explicit FilterBar account selection', () => {
    expect(scopedConnectionId(scope({ activeConnectionId: 'x', restricted: true, connectionIds: ['a', 'b'] }))).toBe('x');
  });

  it('pins to the one connection when restricted down to exactly one', () => {
    expect(scopedConnectionId(scope({ restricted: true, connectionIds: ['solo'] }))).toBe('solo');
  });

  it('is undefined when restricted to more than one (no multi-id param on this endpoint)', () => {
    expect(scopedConnectionId(scope({ restricted: true, connectionIds: ['a', 'b'] }))).toBeUndefined();
  });

  it('is undefined when unrestricted', () => {
    expect(scopedConnectionId(scope())).toBeUndefined();
  });
});

describe('scopedConnectionIds (plural)', () => {
  it('wraps an explicit FilterBar account selection as a single-item list', () => {
    expect(scopedConnectionIds(scope({ activeConnectionId: 'x' }))).toEqual(['x']);
  });

  it('passes through the full restricted list', () => {
    expect(scopedConnectionIds(scope({ restricted: true, connectionIds: ['a', 'b', 'c'] }))).toEqual(['a', 'b', 'c']);
  });

  it('is undefined when unrestricted -- endpoint should fetch everything', () => {
    expect(scopedConnectionIds(scope())).toBeUndefined();
  });
});

describe('scopeMonitoringHealth', () => {
  const data: MonitoringHealthLike = {
    total: 5,
    overallByState: { OK: 4, ALARM: 1 },
    overallByStatus: { healthy: 4, unhealthy: 1 },
    connections: [
      { connectionId: 'a', total: 3, byState: { OK: 3 }, byStatus: { healthy: 3 } },
      { connectionId: 'b', total: 2, byState: { OK: 1, ALARM: 1 }, byStatus: { healthy: 1, unhealthy: 1 } },
    ],
  };

  it('returns the data unchanged when unrestricted', () => {
    expect(scopeMonitoringHealth(data, scope())).toBe(data);
  });

  it('re-derives totals from only the connections in scope', () => {
    const scoped = scope({ restricted: true, connectionIds: ['a'] });
    const result = scopeMonitoringHealth(data, scoped);
    expect(result.total).toBe(3);
    expect(result.overallByState).toEqual({ OK: 3 });
    expect(result.overallByStatus).toEqual({ healthy: 3 });
    expect(result.connections).toHaveLength(1);
  });

  it('sums across multiple in-scope connections', () => {
    const scoped = scope({ restricted: true, connectionIds: ['a', 'b'] });
    const result = scopeMonitoringHealth(data, scoped);
    expect(result.total).toBe(5);
    expect(result.overallByState).toEqual({ OK: 4, ALARM: 1 });
  });

  it('zeroes out when scoped to a connection with no health data', () => {
    const scoped = scope({ restricted: true, connectionIds: ['nonexistent'] });
    const result = scopeMonitoringHealth(data, scoped);
    expect(result.total).toBe(0);
    expect(result.connections).toEqual([]);
  });
});
