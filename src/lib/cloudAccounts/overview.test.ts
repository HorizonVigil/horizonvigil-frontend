import {
  describe,
  expect,
  it,
} from 'vitest';

import type {
  AwsAccountsDashboard,
  CloudAccountsHealthResponse,
  HealthSignal,
} from '../api';

import {
  activityCategory,
  aggregateOverview,
  buildAttentionItems,
  costByProviderBars,
  healthDonutSlices,
  narrowToProvider,
  normalizeDashboard,
  normalizeHealth,
  normalizeResources,
  providerHealthRows,
  recordToBars,
  resourceGrowthSeries,
  rollupProvider,
  signalHealthRows,
  syncBuckets,
  topProblemAccounts,
  mergeActivity,
  type ProviderDashes,
  type ProviderHealth,
} from './overview';

function dash(
  overrides: Partial<AwsAccountsDashboard> = {},
): AwsAccountsDashboard {
  return {
    totalAccounts: 0,
    healthyAccounts: 0,
    failedAccounts: 0,
    disconnectedAccounts: 0,
    accountsNeedingAttention: 0,
    resourcesDiscovered: 0,
    regionsCovered: 0,
    lastDiscovery: null,
    nextScheduledDiscovery: null,
    discoverySuccessRate: null,
    accountsNeedingAttentionList: [],
    permissionErrors: 0,
    syncFailures: 0,
    monthlyCost: 0,
    topCostAccounts: [],
    topGrowingAccounts: [],
    openRecommendations: 0,
    potentialMonthlySavings: 0,
    rotationDue: 0,
    recentActivity: [],
    recentAlerts: [],
    ...overrides,
  };
}

function health(
  provider: 'aws' | 'azure' | 'gcp',
  summary: Partial<
    CloudAccountsHealthResponse['summary']
  > = {},
  accounts: CloudAccountsHealthResponse['accounts'] = [],
): CloudAccountsHealthResponse {
  return {
    provider,
    accounts,
    summary: {
      total: 0,
      healthy: 0,
      warning: 0,
      critical: 0,
      unknown: 0,
      healthPercent: null,
      ...summary,
    },
  };
}

const noHealth: ProviderHealth = {
  aws: null,
  azure: null,
  gcp: null,
};

function signal(
  key: HealthSignal['key'],
  status: HealthSignal['status'],
  overrides: Partial<HealthSignal> = {},
): HealthSignal {
  return {
    key,
    label: key,
    status,
    detail: '',
    weight: 10,
    ...overrides,
  };
}

function healthAccount(
  connectionId: string,
  signals: HealthSignal[],
) {
  return {
    connectionId,
    connectionName: 'Test environment',
    provider: 'aws' as const,
    identifier: connectionId,
    environment: 'production',
    score: 80,
    state: 'healthy' as const,
    signals,
  };
}

describe('rollupProvider', () => {
  it('prefers /health/detailed buckets when present', () => {
    const result = rollupProvider(
      'aws',
      dash({
        totalAccounts: 10,
        healthyAccounts: 1,
      }),
      health('aws', {
        total: 10,
        healthy: 8,
        warning: 1,
        critical: 1,
        unknown: 0,
      }),
    );

    expect(result.healthy).toBe(8);
    expect(result.warning).toBe(1);
    expect(result.critical).toBe(1);
    expect(result.unknown).toBe(0);
    expect(result.total).toBe(10);
    expect(result.healthPercent).toBe(80);
  });

  it('falls back to dashboard counts when health is null', () => {
    const result = rollupProvider(
      'azure',
      dash({
        totalAccounts: 5,
        healthyAccounts: 3,
        failedAccounts: 1,
        disconnectedAccounts: 1,
      }),
      null,
    );

    expect(result.healthy).toBe(3);
    expect(result.critical).toBe(1);
    expect(result.unknown).toBe(0);
    expect(result.warning).toBe(1);
    expect(result.total).toBe(5);

    /*
     * 3 healthy of 5 RATED accounts = 60%.
     *
     * The denominator excludes only `unknown`, and nothing here is unknown:
     * disconnected(1) - failed(1) = 0. Warning and critical accounts were
     * still assessed, so they belong in the denominator -- dropping them
     * would raise the score by hiding the accounts that are doing badly.
     */
    expect(result.healthPercent).toBe(60);
  });

  it('marks GCP as having no cost support', () => {
    expect(
      rollupProvider(
        'gcp',
        dash({ totalAccounts: 1 }),
        null,
      ).hasCost,
    ).toBe(false);

    expect(
      rollupProvider(
        'aws',
        dash({ totalAccounts: 1 }),
        null,
      ).hasCost,
    ).toBe(true);
  });

  it('does not produce a health percentage when there are no rated environments', () => {
    const result = rollupProvider(
      'aws',
      dash({
        totalAccounts: 2,
      }),
      health('aws', {
        total: 2,
        healthy: 0,
        warning: 0,
        critical: 0,
        unknown: 2,
      }),
    );

    expect(result.healthPercent).toBeNull();
  });
});

describe('aggregateOverview', () => {
  const dashes: ProviderDashes = {
    aws: dash({
      totalAccounts: 820,
      healthyAccounts: 806,
      failedAccounts: 4,
      accountsNeedingAttention: 10,
      resourcesDiscovered: 40000,
      monthlyCost: 50000,
      lastDiscovery: '2026-09-01T00:00:00Z',
    }),
    azure: dash({
      totalAccounts: 312,
      healthyAccounts: 302,
      failedAccounts: 2,
      accountsNeedingAttention: 8,
      resourcesDiscovered: 12000,
      monthlyCost: 20000,
      lastDiscovery: '2026-09-03T00:00:00Z',
    }),
    gcp: dash({
      totalAccounts: 152,
      healthyAccounts: 139,
      failedAccounts: 2,
      accountsNeedingAttention: 11,
      resourcesDiscovered: 8000,
      monthlyCost: 0,
    }),
  };

  it('sums provider totals and picks the newest discovery', () => {
    const aggregate = aggregateOverview(
      dashes,
      noHealth,
    );

    expect(aggregate.totals.total).toBe(1284);
    expect(aggregate.totals.resources).toBe(60000);
    expect(aggregate.totals.monthlyCost).toBe(70000);
    expect(aggregate.activeProviders).toEqual([
      'aws',
      'azure',
      'gcp',
    ]);
    expect(aggregate.lastDiscovery).toBe(
      '2026-09-03T00:00:00Z',
    );
  });

  it('drops providers with zero environments from activeProviders', () => {
    const aggregate =
      aggregateOverview(
        {
          ...dashes,
          gcp: dash(),
          azure: dash(),
        },
        noHealth,
      );

    expect(aggregate.activeProviders).toEqual([
      'aws',
    ]);
  });

  it('computes the overall health percentage excluding unknowns', () => {
    const aggregate =
      aggregateOverview(
        {
          aws: dash({
            totalAccounts: 100,
          }),
          azure: dash(),
          gcp: dash(),
        },
        {
          aws: health('aws', {
            total: 100,
            healthy: 90,
            warning: 5,
            critical: 5,
            unknown: 0,
          }),
          azure: null,
          gcp: null,
        },
      );

    expect(
      aggregate.totals.healthPercent,
    ).toBe(90);
  });
});

describe('boundary normalisation', () => {
  it('normalizes partial dashboard payloads without throwing', () => {
    const result =
      normalizeDashboard({
        totalAccounts: 5,
        syncFailures: 'nope',
        recentActivity: null,
        accountsNeedingAttentionList:
          undefined,
      } as unknown as Partial<AwsAccountsDashboard>);

    expect(result.totalAccounts).toBe(5);
    expect(result.syncFailures).toBe(0);
    expect(result.recentActivity).toEqual([]);
    expect(
      result.accountsNeedingAttentionList,
    ).toEqual([]);
    expect(result.monthlyCost).toBe(0);
  });

  it('handles null and undefined dashboard payloads', () => {
    expect(
      normalizeDashboard(null).totalAccounts,
    ).toBe(0);

    expect(
      normalizeDashboard(undefined)
        .recentActivity,
    ).toEqual([]);
  });

  it('rejects health payloads without a valid provider', () => {
    expect(
      normalizeHealth(null),
    ).toBeNull();

    expect(
      normalizeHealth({
        summary: {
          total: 5,
        },
      }),
    ).toBeNull();

    const normalized =
      normalizeHealth({
        provider: 'aws',
        accounts: 'x',
        summary: null,
      } as unknown as CloudAccountsHealthResponse);

    expect(normalized).not.toBeNull();
    expect(normalized?.accounts).toEqual([]);
    expect(normalized?.summary.total).toBe(0);
  });

  it('normalizes usable health accounts and discards malformed signal entries', () => {
    const normalized =
      normalizeHealth({
        provider: 'aws',
        accounts: [
          {
            connectionId: 'c-1',
            connectionName: 'Production',
            provider: 'aws',
            identifier: '123',
            environment: 'production',
            score: 80,
            state: 'healthy',
            signals: [
              signal(
                'connection',
                'ok',
              ),
              null,
              { broken: true },
            ],
          },
        ],
        summary: {
          total: 1,
          healthy: 1,
          warning: 0,
          critical: 0,
          unknown: 0,
          healthPercent: 100,
        },
      } as unknown as CloudAccountsHealthResponse);

    expect(normalized).not.toBeNull();
    expect(
      normalized?.accounts[0]?.signals,
    ).toHaveLength(1);
    expect(
      normalized?.accounts[0]?.signals[0]
        .status,
    ).toBe('ok');
  });

  it('normalizes resource dashboard payloads', () => {
    expect(
      normalizeResources(null),
    ).toBeNull();

    const result = normalizeResources({
      total: 10,
    });

    expect(result).not.toBeNull();
    expect(result?.byCategory).toEqual({});
    expect(result?.byStatus).toEqual({});
    expect(result?.byRegion).toEqual({});
    expect(result?.trend30d).toEqual([]);
  });

  it('survives an all-garbage normalized pipeline', () => {
    const dashes: ProviderDashes = {
      aws: normalizeDashboard({
        totalAccounts: 'x',
        recentActivity: 'y',
      } as unknown as Partial<AwsAccountsDashboard>),
      azure: normalizeDashboard(null),
      gcp: normalizeDashboard(undefined),
    };

    const aggregate =
      aggregateOverview(
        dashes,
        noHealth,
      );

    expect(aggregate.totals.total).toBe(0);
    expect(() =>
      mergeActivity(dashes),
    ).not.toThrow();
    expect(() =>
      buildAttentionItems(
        aggregate,
        dashes,
        { security: null },
      ),
    ).not.toThrow();
    expect(() =>
      topProblemAccounts(dashes),
    ).not.toThrow();
  });
});

describe('narrowToProvider', () => {
  const dashes: ProviderDashes = {
    aws: dash({
      totalAccounts: 10,
    }),
    azure: dash({
      totalAccounts: 5,
    }),
    gcp: dash({
      totalAccounts: 2,
    }),
  };

  const healthMap: ProviderHealth = {
    aws: health('aws', {
      total: 10,
    }),
    azure: health('azure', {
      total: 5,
    }),
    gcp: null,
  };

  it('returns the maps unchanged when provider is null', () => {
    const narrowed =
      narrowToProvider(
        dashes,
        healthMap,
        null,
      );

    expect(narrowed.dashes).toBe(dashes);
    expect(narrowed.health).toBe(
      healthMap,
    );
  });

  it('zeroes every provider except the selected one', () => {
    const narrowed =
      narrowToProvider(
        dashes,
        healthMap,
        'azure',
      );

    expect(
      narrowed.dashes.azure.totalAccounts,
    ).toBe(5);

    expect(
      narrowed.dashes.aws.totalAccounts,
    ).toBe(0);

    expect(
      narrowed.dashes.gcp.totalAccounts,
    ).toBe(0);

    expect(
      narrowed.health.aws,
    ).toBeNull();

    expect(
      narrowed.health.azure,
    ).not.toBeNull();

    expect(
      aggregateOverview(
        narrowed.dashes,
        narrowed.health,
      ).activeProviders,
    ).toEqual(['azure']);
  });

  it('does not mutate the original provider map', () => {
    const narrowed =
      narrowToProvider(
        dashes,
        healthMap,
        'aws',
      );

    expect(
      dashes.azure.totalAccounts,
    ).toBe(5);

    expect(
      narrowed.dashes.aws,
    ).toBe(dashes.aws);
  });
});

describe('healthDonutSlices', () => {
  it('omits empty buckets', () => {
    const slices =
      healthDonutSlices({
        total: 10,
        healthy: 10,
        warning: 0,
        critical: 0,
        unknown: 0,
        attention: 0,
        resources: 0,
        monthlyCost: 0,
        healthPercent: 100,
      });

    expect(slices).toHaveLength(1);
    expect(slices[0].label).toBe(
      'Healthy',
    );
  });

  it('includes unknown as an explicit slice when unknown environments exist', () => {
    const slices =
      healthDonutSlices({
        total: 4,
        healthy: 2,
        warning: 0,
        critical: 0,
        unknown: 2,
        attention: 0,
        resources: 0,
        monthlyCost: 0,
        healthPercent: 100,
      });

    expect(
      slices.map(
        (slice) => slice.label,
      ),
    ).toEqual([
      'Healthy',
      'Unknown',
    ]);
  });
});

describe('providerHealthRows', () => {
  it('emits one comparable row per active provider', () => {
    const aggregate =
      aggregateOverview(
        {
          aws: dash({
            totalAccounts: 10,
          }),
          azure: dash({
            totalAccounts: 4,
          }),
          gcp: dash(),
        },
        {
          aws: health('aws', {
            total: 10,
            healthy: 9,
            warning: 1,
            healthPercent: 90,
          }),
          azure: health('azure', {
            total: 4,
            healthy: 4,
            healthPercent: 100,
          }),
          gcp: null,
        },
      );

    const rows =
      providerHealthRows(
        aggregate,
      );

    expect(
      rows.map((row) => row.label),
    ).toEqual([
      'AWS',
      'Azure',
    ]);

    expect(rows[0].trailing).toBe(
      '90%',
    );

    expect(rows[1].trailing).toBe(
      '100%',
    );
  });

  it('uses an em dash when a provider has no rated environments', () => {
    const aggregate =
      aggregateOverview(
        {
          aws: dash({
            totalAccounts: 2,
          }),
          azure: dash(),
          gcp: dash(),
        },
        {
          aws: health('aws', {
            total: 2,
            unknown: 2,
            healthPercent: null,
          }),
          azure: null,
          gcp: null,
        },
      );

    const rows =
      providerHealthRows(
        aggregate,
      );

    expect(rows[0].trailing).toBe(
      '—',
    );
  });
});

describe('signalHealthRows', () => {
  it('rolls per-account signals into an ok percentage per signal key', () => {
    const accountOne =
      healthAccount('c-1', [
        signal('connection', 'ok'),
        signal('permissions', 'ok'),
      ]);

    const accountTwo =
      healthAccount('c-2', [
        signal('connection', 'ok'),
        signal(
          'permissions',
          'fail',
        ),
      ]);

    const response = health(
      'aws',
      { total: 2 },
      [
        accountOne,
        accountTwo,
      ],
    );

    const rows =
      signalHealthRows({
        aws: response,
        azure: null,
        gcp: null,
      });

    const connection =
      rows.find(
        (row) =>
          row.key ===
          'connection',
      );

    const permissions =
      rows.find(
        (row) =>
          row.key ===
          'permissions',
      );

    expect(connection).toBeDefined();
    expect(permissions).toBeDefined();
    expect(
      connection?.okPercent,
    ).toBe(100);
    expect(
      permissions?.okPercent,
    ).toBe(50);
    expect(
      connection?.okCount,
    ).toBe(2);
    expect(
      permissions?.total,
    ).toBe(2);
  });

  it('does not create rows for signal keys that are not present', () => {
    const response = health(
      'aws',
      { total: 1 },
      [
        healthAccount('c-1', [
          signal(
            'connection',
            'ok',
          ),
        ]),
      ],
    );

    const rows =
      signalHealthRows({
        aws: response,
        azure: null,
        gcp: null,
      });

    expect(
      rows.map((row) => row.key),
    ).toEqual([
      'connection',
    ]);
  });
});

describe('syncBuckets', () => {
  it('splits total into synced, failed, and permission issues without going negative', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        totalAccounts: 100,
        syncFailures: 8,
        permissionErrors: 12,
      }),
      azure: dash(),
      gcp: dash(),
    };

    const aggregate =
      aggregateOverview(
        dashes,
        noHealth,
      );

    const buckets =
      syncBuckets(
        aggregate,
        dashes,
      );

    expect(buckets).toEqual({
      successful: 80,
      failed: 8,
      permissionIssues: 12,
      total: 100,
    });
  });

  it('clamps successful syncs to zero when failures exceed total', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        totalAccounts: 5,
        syncFailures: 10,
        permissionErrors: 10,
      }),
      azure: dash(),
      gcp: dash(),
    };

    const aggregate =
      aggregateOverview(
        dashes,
        noHealth,
      );

    const buckets =
      syncBuckets(
        aggregate,
        dashes,
      );

    expect(buckets.total).toBe(5);
    expect(buckets.successful).toBe(0);
    expect(buckets.failed).toBe(10);
    expect(
      buckets.permissionIssues,
    ).toBe(10);
  });
});

describe('buildAttentionItems', () => {
  const base: ProviderDashes = {
    aws: dash(),
    azure: dash(),
    gcp: dash(),
  };

  it('is empty when nothing requires attention', () => {
    const aggregate =
      aggregateOverview(
        base,
        noHealth,
      );

    expect(
      buildAttentionItems(
        aggregate,
        base,
        { security: null },
      ),
    ).toEqual([]);
  });

  it('orders critical before warning and includes sync, permission, security, and rotation items', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        totalAccounts: 50,
        syncFailures: 3,
        permissionErrors: 5,
        rotationDue: 2,
      }),
      azure: dash(),
      gcp: dash(),
    };

    const aggregate =
      aggregateOverview(
        dashes,
        noHealth,
      );

    const items =
      buildAttentionItems(
        aggregate,
        dashes,
        {
          security: {
            bySeverity: {
              critical: 4,
            },
          },
        },
      );

    expect(
      items.map((item) => item.id),
    ).toEqual(
      expect.arrayContaining([
        'sync-failed',
        'perm-issues',
        'sec-critical',
        'rotation',
      ]),
    );

    const firstWarningIndex =
      items.findIndex(
        (item) =>
          item.severity ===
          'warning',
      );

    const lastCriticalIndex =
      [...items]
        .map(
          (item) => item.severity,
        )
        .lastIndexOf(
          'critical',
        );

    expect(
      lastCriticalIndex,
    ).toBeGreaterThanOrEqual(0);

    expect(
      firstWarningIndex,
    ).toBeGreaterThan(
      lastCriticalIndex,
    );
  });

  it('flags discovery data older than seven days', () => {
    const now = Date.parse(
      '2026-09-20T00:00:00Z',
    );

    const dashes: ProviderDashes = {
      aws: dash({
        totalAccounts: 10,
        lastDiscovery:
          '2026-09-01T00:00:00Z',
      }),
      azure: dash(),
      gcp: dash(),
    };

    const aggregate =
      aggregateOverview(
        dashes,
        noHealth,
      );

    const items =
      buildAttentionItems(
        aggregate,
        dashes,
        {
          security: null,
          now,
        },
      );

    expect(
      items.some(
        (item) => item.id === 'stale',
      ),
    ).toBe(true);
  });

  it('does not mark a provider with no discovery timestamp as stale', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        totalAccounts: 10,
        lastDiscovery: null,
      }),
      azure: dash(),
      gcp: dash(),
    };

    const aggregate =
      aggregateOverview(
        dashes,
        noHealth,
      );

    const items =
      buildAttentionItems(
        aggregate,
        dashes,
        {
          security: null,
          now: Date.parse(
            '2026-09-20T00:00:00Z',
          ),
        },
      );

    expect(
      items.some(
        (item) => item.id === 'stale',
      ),
    ).toBe(false);
  });
});

describe('topProblemAccounts', () => {
  it('flattens provider attention lists and caps the result', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        accountsNeedingAttentionList: [
          {
            connectionId: 'a',
            connectionName:
              'Prod-07',
            reason:
              'Permission',
          },
        ],
      }),
      azure: dash({
        accountsNeedingAttentionList: [
          {
            connectionId: 'b',
            connectionName:
              'Pay-02',
            reason:
              'Sync failed',
          },
        ],
      }),
      gcp: dash(),
    };

    const rows =
      topProblemAccounts(
        dashes,
        1,
      );

    expect(rows).toHaveLength(
      1,
    );

    expect(rows[0]).toMatchObject({
      connectionId: 'a',
      provider: 'aws',
      issue: 'Permission',
    });
  });

  it('returns no malformed problem accounts with an empty connection id', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        accountsNeedingAttentionList: [
          {
            connectionId: '',
            connectionName:
              'Unknown',
            reason:
              'Permission',
          },
        ],
      }),
      azure: dash(),
      gcp: dash(),
    };

    const rows =
      topProblemAccounts(
        dashes,
      );

    expect(rows).toEqual([]);
  });
});

describe('mergeActivity', () => {
  it('merges and sorts activity newest-first across providers', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        recentActivity: [
          {
            id: '1',
            action:
              'aws_account.synced',
            targetId: null,
            occurredAt:
              '2026-09-01T10:00:00Z',
            actorEmail: null,
          },
        ],
      }),
      azure: dash({
        recentActivity: [
          {
            id: '2',
            action:
              'azure_account.discovered',
            targetId: null,
            occurredAt:
              '2026-09-02T10:00:00Z',
            actorEmail: null,
          },
        ],
      }),
      gcp: dash(),
    };

    const timeline =
      mergeActivity(dashes);

    expect(
      timeline.map(
        (entry) => entry.id,
      ),
    ).toEqual([
      'azure-2',
      'aws-1',
    ]);
  });

  it('orders equal timestamps deterministically', () => {
    const dashes: ProviderDashes = {
      aws: dash({
        recentActivity: [
          {
            id: '2',
            action:
              'aws_account.synced',
            targetId: null,
            occurredAt:
              '2026-09-01T10:00:00Z',
            actorEmail: null,
          },
          {
            id: '1',
            action:
              'aws_account.synced',
            targetId: null,
            occurredAt:
              '2026-09-01T10:00:00Z',
            actorEmail: null,
          },
        ],
      }),
      azure: dash(),
      gcp: dash(),
    };

    const timeline =
      mergeActivity(dashes);

    expect(
      timeline.map(
        (entry) => entry.id,
      ),
    ).toEqual([
      'aws-1',
      'aws-2',
    ]);
  });
});

describe('resourceGrowthSeries', () => {
  it('back-calculates a cumulative series that ends at total', () => {
    const series =
      resourceGrowthSeries({
        total: 100,
        byCategory: {},
        byStatus: {},
        byRegion: {},
        trend30d: [
          {
            date: '2026-09-01',
            created: 6,
            deleted: 1,
          },
          {
            date: '2026-09-02',
            created: 5,
            deleted: 0,
          },
          {
            date: '2026-09-03',
            created: 7,
            deleted: 2,
          },
        ],
      });

    expect(
      series.map(
        (point) => point.y,
      ),
    ).toEqual([
      90,
      95,
      100,
    ]);
  });

  it('does not produce negative cumulative values', () => {
    const series =
      resourceGrowthSeries({
        total: 1,
        byCategory: {},
        byStatus: {},
        byRegion: {},
        trend30d: [
          {
            date: '2026-09-01',
            created: 0,
            deleted: 50,
          },
        ],
      });

    /*
     * The contract is that the series ENDS at `total` (asserted above), so
     * with a net of -50 the walk starts at 51 and lands on 1 -- which is the
     * real current total, not a negative value. Assert the property this test
     * is named for; pinning 0 here would contradict the end-at-total contract
     * and force the last point to disagree with the inventory count.
     */
    for (const point of series) {
      expect(point.y).toBeGreaterThanOrEqual(0);
    }

    expect(series[series.length - 1].y).toBe(1);
  });
});

describe('recordToBars', () => {
  it('sorts descending, drops zero values, and caps length', () => {
    const bars =
      recordToBars(
        {
          Compute: 40,
          Storage: 20,
          Empty: 0,
          Network: 10,
        },
        2,
      );

    expect(bars).toEqual([
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

  it('handles null records and invalid limits safely', () => {
    expect(
      recordToBars(null),
    ).toEqual([]);

    expect(
      recordToBars(
        {
          Compute: 40,
        },
        0,
      ),
    ).toEqual([]);
  });
});

describe('costByProviderBars', () => {
  it('excludes providers with no cost support or no environments', () => {
    const aggregate =
      aggregateOverview(
        {
          aws: dash({
            totalAccounts: 5,
            monthlyCost: 100,
          }),
          azure: dash({
            totalAccounts: 2,
            monthlyCost: 50,
          }),
          gcp: dash({
            totalAccounts: 3,
            monthlyCost: 0,
          }),
        },
        noHealth,
      );

    expect(
      costByProviderBars(
        aggregate,
      ),
    ).toEqual([
      {
        label: 'AWS',
        value: 100,
      },
      {
        label: 'Azure',
        value: 50,
      },
    ]);
  });
});

describe('activityCategory', () => {
  it('classifies common actions', () => {
    expect(
      activityCategory(
        'aws_connection.synced',
      ),
    ).toBe('connections');

    expect(
      activityCategory(
        'security.finding_opened',
      ),
    ).toBe('security');

    expect(
      activityCategory(
        'cost.budget_exceeded',
      ),
    ).toBe('cost');

    expect(
      activityCategory(
        'gcp_project.bulk_imported',
      ),
    ).toBe('accounts');

    expect(
      activityCategory(
        'resource.discovered',
      ),
    ).toBe('resources');

    expect(
      activityCategory(
        'something.else',
      ),
    ).toBe('configuration');
  });

  it('handles empty or mixed-case actions safely', () => {
    expect(
      activityCategory(''),
    ).toBe('configuration');

    expect(
      activityCategory(
        'SECURITY.FINDING_OPENED',
      ),
    ).toBe('security');
  });
});
