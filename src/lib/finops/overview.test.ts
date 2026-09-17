import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  Budget,
  CostAnomaly,
  CostRecommendation,
  CostSnapshot,
} from '../api';

import type {
  UnifiedAccountRow,
} from '../unifiedAccounts';

import {
  aggregateDaily,
  costByCloudBars,
  costByAccountBars,
  costByEnvironmentBars,
  recordToBars,
  summarizeBudgets,
  optimizationByCategory,
  anomalySeverity,
  sortAnomalies,
  periodOverPeriod,
  previousRange,
  percentChange,
  biggestChanges,
} from './overview';

type Provider =
  | 'aws'
  |  'azure'
  |  'gcp';

function conn(
  id: string,
  provider: Provider,
  identifier: string,
  name = id,
  environment = 'production',
): UnifiedAccountRow {
  return {
    id,
    provider,
    name,
    identifier,
    environment,
    status: 'connected',
    errorMessage: null,
    connectionMethod: 'access_key',
    connectionMethodLabel: 'Access key',
    region: 'us-east-1',
    resources: 0,
    lastSync: null,
    raw: {},
  } as UnifiedAccountRow;
}

function snapshot(
  date: string,
  cost: number,
): CostSnapshot {
  return {
    id: `${date}-${cost}`,
    connection_id: 'c1',
    account_id: 'a1',
    usage_date: date,
    service: 'EC2',
    region: 'us-east-1',
    unblended_cost: String(cost),
    usage_quantity: null,
    usage_unit: null,
    currency: 'USD',
  };
}

function budget(
  overrides: Partial<Budget> = {},
): Budget {
  return {
    id: 'b1',
    org_id: 'o1',
    scope_type: 'org',
    scope_id: 'o1',
    name: 'Org budget',
    monthly_limit: 1000,
    alert_thresholds: [80],
    created_at: '',
    currentSpend: 500,
    projectedSpend: 900,
    forecastMethod: 'linear',
    percentOfLimit: 50,
    status: 'ok',
    ...overrides,
  };
}

/**
 * `Object.assign`, not an inline `...overrides` spread.
 *
 * `Partial<T>` types every property as `T[K] | undefined`, so spreading it
 * into an object literal lets a required field become undefined and the
 * result stops being a CostRecommendation. Object.assign produces
 * `CostRecommendation & Partial<CostRecommendation>`, which is assignable --
 * and it keeps the base fully type-checked rather than casting the result.
 */
function recommendation(
  overrides: Partial<CostRecommendation> = {},
): CostRecommendation {
  const base: CostRecommendation = {
    id: 'r1',
    connection_id: 'c1',
    resource_id: null,
    category: 'idle',
    issue: 'Idle resource',
    recommended_action: 'Review and remove if unused',
    potential_monthly_savings: 10,
    priority: 'low',
    status: 'open',
    created_at: '',
    external_key: null,
    excluded_reason: null,
    excluded_justification: null,
    excluded_by: null,
    excluded_at: null,
    excluded_until: null,
    assigned_to: null,
    last_notified_at: null,
    last_notified_by: null,
    source: 'homegrown_heuristic',

    /*
     * Evidence-contract fields. These defaults keep these aggregation tests
     * focused on the aggregate behavior; recommendation validity itself should
     * be covered by the dedicated recommendation-display tests.
     */
    validity: 'actionable',
    validity_reason: null,
    evidence_window_days: null,
    evidence_sample_count: null,
    evidence_from: null,
    evidence_to: null,
    action_group: null,
    target_state_at_evaluation: null,
    rule_version: null,
    evaluated_at: null,
    expires_at: null,
    confidence: null,
    savings_state: null,
    observed_monthly_savings: null,
    verified_at: null,
    // These two were absent from the fixture entirely. The old
    // `...overrides` spread hid it, because Partial<T> could notionally
    // supply them -- so an incomplete fixture type-checked.
    commitment_term: null,
    payment_option: null,
    ownership: null,
  };

  return Object.assign(base, overrides);
}

function anomaly(
  overrides: Partial<CostAnomaly> = {},
): CostAnomaly {
  return {
    id: 'an1',
    connection_id: 'c1',
    service: 'EC2',
    detected_at: '',
    usage_date: '2026-09-01',
    expected_cost: 100,
    actual_cost: 150,
    percent_change: 50,
    dollar_impact: 50,
    status: 'open',
    created_at: '',
    ...overrides,
  };
}

describe('aggregateDaily', () => {
  it('sums cost by usage date and sorts ascending', () => {
    const result = aggregateDaily([
      snapshot('2026-09-02', 10),
      snapshot('2026-09-01', 5),
      snapshot('2026-09-01', 3),
    ]);

    expect(result).toEqual([
      {
        date: '2026-09-01',
        cost: 8,
      },
      {
        date: '2026-09-02',
        cost: 10,
      },
    ]);
  });

  it('returns an empty array for no rows', () => {
    expect(aggregateDaily([])).toEqual([]);
  });

  it('preserves a date with a zero-cost row', () => {
    expect(
      aggregateDaily([
        snapshot('2026-09-01', 0),
      ]),
    ).toEqual([
      {
        date: '2026-09-01',
        cost: 0,
      },
    ]);
  });
});

describe('costByCloudBars', () => {
  const connections = [
    conn(
      'c-aws',
      'aws',
      '111111111111',
    ),
    conn(
      'c-azure',
      'azure',
      'sub-1',
    ),
  ];

  it('groups by resolved provider using either id or identifier', () => {
    expect(
      costByCloudBars(
        {
          '111111111111': 100,
          'sub-1': 40,
        },
        connections,
      ),
    ).toEqual([
      {
        label: 'AWS',
        value: 100,
      },
      {
        label: 'Azure',
        value: 40,
      },
    ]);
  });

  it('drops keys that resolve to no known connection', () => {
    expect(
      costByCloudBars(
        {
          'unknown-account': 999,
          '111111111111': 50,
        },
        connections,
      ),
    ).toEqual([
      {
        label: 'AWS',
        value: 50,
      },
    ]);
  });

  it('sums multiple accounts under the same provider', () => {
    const multi = [
      conn('c1', 'aws', 'a1'),
      conn('c2', 'aws', 'a2'),
    ];

    expect(
      costByCloudBars(
        {
          a1: 30,
          a2: 20,
        },
        multi,
      ),
    ).toEqual([
      {
        label: 'AWS',
        value: 50,
      },
    ]);
  });

  it('does not mutate the connection input', () => {
    const input = [
      conn('c1', 'aws', 'a1'),
      conn('c2', 'azure', 'a2'),
    ];

    const before = input.map(
      (item) => item.id,
    );

    costByCloudBars(
      {
        a1: 10,
        a2: 20,
      },
      input,
    );

    expect(
      input.map(
        (item) => item.id,
      ),
    ).toEqual(before);
  });
});

describe('costByAccountBars', () => {
  it('resolves display names, sorts descending, and respects the limit', () => {
    const connections = [
      conn(
        'c1',
        'aws',
        'a1',
        'Production',
      ),
      conn(
        'c2',
        'aws',
        'a2',
        'Staging',
      ),
    ];

    expect(
      costByAccountBars(
        {
          a1: 50,
          a2: 200,
        },
        connections,
        1,
      ),
    ).toEqual([
      {
        label: 'Staging',
        value: 200,
      },
    ]);
  });

  it('falls back to the raw key when no connection matches', () => {
    expect(
      costByAccountBars(
        {
          'ghost-account': 10,
        },
        [],
      ),
    ).toEqual([
      {
        label: 'ghost-account',
        value: 10,
      },
    ]);
  });

  it('returns no bars for an empty cost record', () => {
    expect(
      costByAccountBars(
        {},
        [],
      ),
    ).toEqual([]);
  });
});

describe('recordToBars', () => {
  it('handles null and undefined input', () => {
    expect(recordToBars(null)).toEqual([]);
    expect(recordToBars(undefined)).toEqual([]);
  });

  it('sorts descending, removes zero values, and caps the result', () => {
    expect(
      recordToBars(
        {
          Compute: 40,
          Storage: 20,
          Empty: 0,
          Network: 10,
        },
        2,
      ),
    ).toEqual([
      {
        label: 'Compute',
        value: 40,
      },
      {
        label: 'Storage',
        value: 20,
      },
    ]);
  });
});

describe('summarizeBudgets', () => {
  it('returns a zeroed rollup for no budgets', () => {
    expect(
      summarizeBudgets([]),
    ).toMatchObject({
      count: 0,
      usedPercent: null,
      worst: null,
    });
  });

  it('sums limits/spend/forecast and reports the worst status', () => {
    const rollup =
      summarizeBudgets([
        budget({
          monthly_limit: 100,
          currentSpend: 50,
          status: 'ok',
        }),
        budget({
          id: 'b2',
          monthly_limit: 200,
          currentSpend: 220,
          status: 'exceeded',
        }),
      ]);

    expect(
      rollup.totalLimit,
    ).toBe(300);

    expect(
      rollup.totalSpend,
    ).toBe(270);

    expect(
      rollup.usedPercent,
    ).toBe(90);

    expect(
      rollup.worst,
    ).toBe('exceeded');

    expect(
      rollup.exceededCount,
    ).toBe(1);
  });

  it('does not divide by zero when all budget limits are zero', () => {
    const rollup =
      summarizeBudgets([
        budget({
          monthly_limit: 0,
          currentSpend: 0,
        }),
      ]);

    expect(
      rollup.usedPercent,
    ).toBeNull();
  });
});

describe('optimizationByCategory', () => {
  it('sums savings by category with a friendly label', () => {
    expect(
      optimizationByCategory([
        recommendation({
          category: 'idle',
          potential_monthly_savings: 18,
        }),
        recommendation({
          category: 'rightsizing',
          potential_monthly_savings: 24,
        }),
        recommendation({
          category: 'idle',
          potential_monthly_savings: 5,
        }),
      ]),
    ).toEqual([
      {
        label: 'Rightsizing',
        value: 24,
      },
      {
        label: 'Idle Resources',
        value: 23,
      },
    ]);
  });

  it('falls back to a de-slugged label for an unmapped category', () => {
    expect(
      optimizationByCategory([
        recommendation({
          category:
            'unattached_ip',
          potential_monthly_savings: 5,
        }),
      ]),
    ).toEqual([
      {
        label: 'unattached ip',
        value: 5,
      },
    ]);
  });

  it('returns no bars for an empty recommendation list', () => {
    expect(
      optimizationByCategory([]),
    ).toEqual([]);
  });
});

describe('anomalySeverity', () => {
  it('is critical at or above 50% change', () => {
    expect(
      anomalySeverity(50),
    ).toBe('critical');

    expect(
      anomalySeverity(75),
    ).toBe('critical');
  });

  it('is warning below 50% change', () => {
    expect(
      anomalySeverity(49),
    ).toBe('warning');

    expect(
      anomalySeverity(0),
    ).toBe('warning');
  });
});

describe('sortAnomalies', () => {
  it('sorts by dollar impact descending', () => {
    const sorted =
      sortAnomalies([
        anomaly({
          id: 'a',
          dollar_impact: 10,
        }),
        anomaly({
          id: 'b',
          dollar_impact: 90,
        }),
        anomaly({
          id: 'c',
          dollar_impact: 40,
        }),
      ]);

    expect(
      sorted.map(
        (item) => item.id,
      ),
    ).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('does not mutate the original anomaly array', () => {
    const source = [
      anomaly({
        id: 'a',
        dollar_impact: 10,
      }),
      anomaly({
        id: 'b',
        dollar_impact: 90,
      }),
    ];

    const before =
      source.map(
        (item) => item.id,
      );

    sortAnomalies(source);

    expect(
      source.map(
        (item) => item.id,
      ),
    ).toEqual(before);
  });
});

describe('periodOverPeriod', () => {
  it('splits the series at the midpoint and computes percentage change', () => {
    const daily = [
      {
        date: '1',
        cost: 10,
      },
      {
        date: '2',
        cost: 10,
      },
      {
        date: '3',
        cost: 20,
      },
      {
        date: '4',
        cost: 20,
      },
    ];

    const result =
      periodOverPeriod(daily);

    expect(
      result.previous,
    ).toBe(20);

    expect(
      result.current,
    ).toBe(40);

    expect(
      result.changePercent,
    ).toBe(100);
  });

  it('handles an empty series without dividing by zero', () => {
    expect(
      periodOverPeriod([]),
    ).toEqual({
      current: 0,
      previous: 0,
      changePercent: null,
    });
  });

  it('handles a single point without a previous baseline', () => {
    expect(
      periodOverPeriod([
        {
          date: '1',
          cost: 5,
        },
      ]),
    ).toEqual({
      current: 5,
      previous: 0,
      changePercent: null,
    });
  });
});

describe('costByEnvironmentBars', () => {
  it('sums cost by connection environment', () => {
    const connections = [
      conn(
        'c1',
        'aws',
        'a1',
        'A',
        'production',
      ),
      conn(
        'c2',
        'aws',
        'a2',
        'B',
        'production',
      ),
      conn(
        'c3',
        'aws',
        'a3',
        'C',
        'staging',
      ),
    ];

    expect(
      costByEnvironmentBars(
        {
          a1: 30,
          a2: 20,
          a3: 10,
        },
        connections,
      ),
    ).toEqual([
      {
        label: 'production',
        value: 50,
      },
      {
        label: 'staging',
        value: 10,
      },
    ]);
  });

  it('drops unresolvable keys', () => {
    expect(
      costByEnvironmentBars(
        {
          ghost: 100,
        },
        [],
      ),
    ).toEqual([]);
  });

  it('does not mutate the connection input', () => {
    const connections = [
      conn(
        'c1',
        'aws',
        'a1',
        'A',
        'production',
      ),
    ];

    const before =
      connections.map(
        (item) => item.id,
      );

    costByEnvironmentBars(
      {
        a1: 30,
      },
      connections,
    );

    expect(
      connections.map(
        (item) => item.id,
      ),
    ).toEqual(before);
  });
});

describe('previousRange', () => {
  it('returns the immediately preceding equal-length window', () => {
    expect(
      previousRange({
        from: '2026-09-11',
        to: '2026-09-20',
      }),
    ).toEqual({
      from: '2026-09-01',
      to: '2026-09-10',
    });
  });

  it('handles a single-day range', () => {
    expect(
      previousRange({
        from: '2026-09-10',
        to: '2026-09-10',
      }),
    ).toEqual({
      from: '2026-09-09',
      to: '2026-09-09',
    });
  });

  it('crosses a month boundary correctly', () => {
    expect(
      previousRange({
        from: '2026-09-01',
        to: '2026-09-05',
      }),
    ).toEqual({
      from: '2026-08-27',
      to: '2026-08-31',
    });
  });
});

describe('percentChange', () => {
  it('computes rounded percentage change', () => {
    expect(
      percentChange(
        120,
        100,
      ),
    ).toBe(20);

    expect(
      percentChange(
        80,
        100,
      ),
    ).toBe(-20);
  });

  it('returns null when there is no valid previous baseline', () => {
    expect(
      percentChange(
        50,
        0,
      ),
    ).toBeNull();

    expect(
      percentChange(
        50,
        -10,
      ),
    ).toBeNull();
  });
});

describe('biggestChanges', () => {
  it('splits services into increases and decreases sorted by dollar impact', () => {
    const current = {
      EC2: 200,
      S3: 40,
      RDS: 10,
    };

    const previous = {
      EC2: 100,
      S3: 90,
      RDS: 10,
    };

    const {
      increases,
      decreases,
    } = biggestChanges(
      current,
      previous,
    );

    expect(increases).toEqual([
      {
        label: 'EC2',
        current: 200,
        previous: 100,
        delta: 100,
      },
    ]);

    expect(decreases).toEqual([
      {
        label: 'S3',
        current: 40,
        previous: 90,
        delta: -50,
      },
    ]);
  });

  it('treats a service present in only one period as a full increase or decrease', () => {
    const {
      increases,
      decreases,
    } = biggestChanges(
      {
        Lambda: 30,
      },
      {
        EBS: 15,
      },
    );

    expect(increases).toEqual([
      {
        label: 'Lambda',
        current: 30,
        previous: 0,
        delta: 30,
      },
    ]);

    expect(decreases).toEqual([
      {
        label: 'EBS',
        current: 0,
        previous: 15,
        delta: -15,
      },
    ]);
  });

  it('caps each result list at the requested limit', () => {
    const {
      increases,
    } = biggestChanges(
      {
        a: 10,
        b: 20,
        c: 30,
      },
      {},
      2,
    );

    expect(increases).toHaveLength(
      2,
    );

    expect(
      increases[0].label,
    ).toBe('c');
  });

  it('returns no changes for identical periods', () => {
    expect(
      biggestChanges(
        {
          EC2: 100,
          S3: 25,
        },
        {
          EC2: 100,
          S3: 25,
        },
      ),
    ).toEqual({
      increases: [],
      decreases: [],
    });
  });
});
