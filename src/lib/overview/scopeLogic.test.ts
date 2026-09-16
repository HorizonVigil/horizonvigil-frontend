import { describe, expect, it } from 'vitest';
import {
  resolveConnectionScope,
  scopedConnectionId,
  scopedConnectionIds,
  scopeMonitoringHealth,
  type MonitoringHealthLike,
} from './scopeLogic';
import type { EffectiveScope } from './types';

function makeScope(
  overrides: Partial<EffectiveScope> = {},
): EffectiveScope {
  return {
    orgId: 'o1',
    orgName: 'Org',
    folders: [],
    projects: [],
    restricted: false,
    connectionIds: 'all',
    region: 'all',
    ...overrides,
  };
}

describe('resolveConnectionScope', () => {
  it('is unrestricted when neither scope axis narrows', () => {
    expect(
      resolveConnectionScope(['a', 'b'], false, null),
    ).toEqual({
      restricted: false,
      connectionIds: 'all',
    });

    expect(
      resolveConnectionScope(
        ['a', 'b'],
        false,
        { restricted: false, connectionIds: [] },
      ),
    ).toEqual({
      restricted: false,
      connectionIds: 'all',
    });
  });

  it('a folder/project scope pick alone narrows to the current connections', () => {
    expect(
      resolveConnectionScope(['a', 'b'], true, null),
    ).toEqual({
      restricted: true,
      connectionIds: ['a', 'b'],
    });
  });

  it('a resource-grant restriction alone narrows to the granted ids', () => {
    expect(
      resolveConnectionScope(
        ['a', 'b', 'c'],
        false,
        {
          restricted: true,
          connectionIds: ['a', 'c'],
        },
      ),
    ).toEqual({
      restricted: true,
      connectionIds: ['a', 'c'],
    });
  });

  it('intersects scope selection and resource grants when both apply', () => {
    const result = resolveConnectionScope(
      ['a', 'b'],
      true,
      {
        restricted: true,
        connectionIds: ['b', 'z'],
      },
    );

    expect(result).toEqual({
      restricted: true,
      connectionIds: ['b'],
    });
  });

  it('drops grant ids outside the already scoped connection set', () => {
    const result = resolveConnectionScope(
      ['a'],
      true,
      {
        restricted: true,
        connectionIds: ['z'],
      },
    );

    expect(result).toEqual({
      restricted: true,
      connectionIds: [],
    });
  });

  it('deduplicates duplicate source connection ids', () => {
    const result = resolveConnectionScope(
      ['a', 'a', 'b', 'b'],
      true,
      null,
    );

    expect(result).toEqual({
      restricted: true,
      connectionIds: ['a', 'b'],
    });
  });

  it('does not widen a restricted set when grants contain duplicates', () => {
    const result = resolveConnectionScope(
      ['a', 'b'],
      false,
      {
        restricted: true,
        connectionIds: ['a', 'a', 'b', 'b'],
      },
    );

    expect(result).toEqual({
      restricted: true,
      connectionIds: ['a', 'b'],
    });
  });
});

describe('scopedConnectionId (singular)', () => {
  it('prefers an explicit FilterBar account selection', () => {
    expect(
      scopedConnectionId(
        makeScope({
          activeConnectionId: 'x',
          restricted: true,
          connectionIds: ['a', 'b'],
        }),
      ),
    ).toBe('x');
  });

  it('pins to the only connection when restricted to exactly one', () => {
    expect(
      scopedConnectionId(
        makeScope({
          restricted: true,
          connectionIds: ['solo'],
        }),
      ),
    ).toBe('solo');
  });

  it('is undefined when restricted to multiple connections', () => {
    expect(
      scopedConnectionId(
        makeScope({
          restricted: true,
          connectionIds: ['a', 'b'],
        }),
      ),
    ).toBeUndefined();
  });

  it('is undefined when the scope is unrestricted', () => {
    expect(scopedConnectionId(makeScope())).toBeUndefined();
  });

  it('ignores an empty explicit account selection', () => {
    expect(
      scopedConnectionId(
        makeScope({
          activeConnectionId: '',
          restricted: true,
          connectionIds: ['solo'],
        }),
      ),
    ).toBe('solo');
  });
});

describe('scopedConnectionIds (plural)', () => {
  it('wraps an explicit FilterBar account selection as a single-item list', () => {
    expect(
      scopedConnectionIds(
        makeScope({
          activeConnectionId: 'x',
        }),
      ),
    ).toEqual(['x']);
  });

  it('passes through all restricted connections', () => {
    expect(
      scopedConnectionIds(
        makeScope({
          restricted: true,
          connectionIds: ['a', 'b', 'c'],
        }),
      ),
    ).toEqual(['a', 'b', 'c']);
  });

  it('is undefined when unrestricted', () => {
    expect(scopedConnectionIds(makeScope())).toBeUndefined();
  });

  it('prefers an explicit account selection over the broader restricted set', () => {
    expect(
      scopedConnectionIds(
        makeScope({
          activeConnectionId: 'x',
          restricted: true,
          connectionIds: ['a', 'b'],
        }),
      ),
    ).toEqual(['x']);
  });
});

describe('scopeMonitoringHealth', () => {
  const data: MonitoringHealthLike = {
    total: 5,
    overallByState: {
      OK: 4,
      ALARM: 1,
    },
    overallByStatus: {
      healthy: 4,
      unhealthy: 1,
    },
    connections: [
      {
        connectionId: 'a',
        total: 3,
        byState: { OK: 3 },
        byStatus: { healthy: 3 },
      },
      {
        connectionId: 'b',
        total: 2,
        byState: { OK: 1, ALARM: 1 },
        byStatus: { healthy: 1, unhealthy: 1 },
      },
    ],
  };

  it('returns the original object when unrestricted', () => {
    expect(scopeMonitoringHealth(data, makeScope())).toBe(data);
  });

  it('re-derives totals from only the connections in scope', () => {
    const result = scopeMonitoringHealth(
      data,
      makeScope({
        restricted: true,
        connectionIds: ['a'],
      }),
    );

    expect(result.total).toBe(3);
    expect(result.overallByState).toEqual({ OK: 3 });
    expect(result.overallByStatus).toEqual({ healthy: 3 });
    expect(result.connections).toHaveLength(1);
    expect(result.connections[0]?.connectionId).toBe('a');
  });

  it('sums across multiple in-scope connections', () => {
    const result = scopeMonitoringHealth(
      data,
      makeScope({
        restricted: true,
        connectionIds: ['a', 'b'],
      }),
    );

    expect(result.total).toBe(5);
    expect(result.overallByState).toEqual({
      OK: 4,
      ALARM: 1,
    });
    expect(result.overallByStatus).toEqual({
      healthy: 4,
      unhealthy: 1,
    });
  });

  it('returns an empty health rollup when no scoped connection has data', () => {
    const result = scopeMonitoringHealth(
      data,
      makeScope({
        restricted: true,
        connectionIds: ['nonexistent'],
      }),
    );

    expect(result.total).toBe(0);
    expect(result.overallByState).toEqual({});
    expect(result.overallByStatus).toEqual({});
    expect(result.connections).toEqual([]);
  });

  it('ignores connection records outside the effective restricted scope', () => {
    const result = scopeMonitoringHealth(
      data,
      makeScope({
        restricted: true,
        connectionIds: ['a'],
      }),
    );

    expect(result.connections.map((item) => item.connectionId)).toEqual([
      'a',
    ]);
    expect(result.connections.some((item) => item.connectionId === 'b')).toBe(
      false,
    );
  });

  it('does not mutate the original health payload', () => {
    const snapshot = structuredClone(data);

    scopeMonitoringHealth(
      data,
      makeScope({
        restricted: true,
        connectionIds: ['a'],
      }),
    );

    expect(data).toEqual(snapshot);
  });

  it('handles an empty restricted scope without fabricating totals', () => {
    const result = scopeMonitoringHealth(
      data,
      makeScope({
        restricted: true,
        connectionIds: [],
      }),
    );

    expect(result.total).toBe(0);
    expect(result.connections).toEqual([]);
    expect(result.overallByState).toEqual({});
    expect(result.overallByStatus).toEqual({});
  });

  it('preserves a restricted connection when the account filter selects it', () => {
    const result = scopeMonitoringHealth(
      data,
      makeScope({
        restricted: true,
        activeConnectionId: 'b',
        connectionIds: ['a', 'b'],
      }),
    );

    expect(result.connections.map((item) => item.connectionId)).toEqual([
      'b',
    ]);
    expect(result.total).toBe(2);
  });
});
